const TABLE = 'emilia_guesses';
const BUCKET = 'emilia-transferencias';
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_FILES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' } });
const clean = (value) => String(value || '').trim();

function supabase(env, path, init = {}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) throw new Error('Supabase no está configurado.');
  return fetch(`${env.SUPABASE_URL}${path}`, {
    ...init,
    headers: { apikey: env.SUPABASE_SECRET_KEY, ...(init.headers || {}) }
  });
}

async function ipHash(request, secret) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function verifyTurnstile(request, env, token) {
  const secret = env.TURNSTILE_SECRET_KEY || env.TURNSTILE_SECRET;
  if (!secret) {
    if (env.CF_PAGES_BRANCH === 'local') return true;
    throw new Error('Turnstile no está configurado.');
  }
  if (!token) return false;
  const body = new URLSearchParams({ secret, response:token });
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) body.set('remoteip', ip);
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body
  });
  const result = await response.json();
  return result.success === true;
}

export async function onRequestGet({ env }) {
  try {
    const response = await supabase(env, `/rest/v1/${TABLE}?select=nickname,birth_datetime,weight_grams,wants_bet&order=birth_datetime.asc&limit=200`, {
      headers: { Accept:'application/json' }
    });
    if (!response.ok) throw new Error(`Supabase ${response.status}`);
    return json(await response.json());
  } catch (error) {
    console.error('GET guesses:', error.message);
    return json({ error:'No pudimos cargar las predicciones.' }, 503);
  }
}

export async function onRequestPost({ request, env }) {
  let createdId;
  let receiptPath;
  try {
    const type = request.headers.get('content-type') || '';
    if (!type.includes('multipart/form-data')) return json({ error:'Formato de solicitud inválido.' }, 415);
    const data = await request.formData();
    if (clean(data.get('website'))) return json({ error:'Solicitud rechazada.' }, 400);

    const nickname = clean(data.get('nickname')).replace(/\s+/g, ' ');
    const email = clean(data.get('email')).toLowerCase();
    const localDate = clean(data.get('birth_datetime'));
    const weight = Number(data.get('weight_grams'));
    const wantsBet = data.get('wants_bet') === 'on';
    const receipt = data.get('receipt');
    const turnstileToken = clean(data.get('cf-turnstile-response'));

    if (nickname.length < 2 || nickname.length > 30) return json({ error:'El apodo debe tener entre 2 y 30 caracteres.' }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json({ error:'Ingresá un email válido.' }, 400);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localDate)) return json({ error:'Elegí una fecha y hora válidas.' }, 400);
    const birthDate = new Date(`${localDate}:00-03:00`);
    if (!Number.isFinite(birthDate.getTime()) || birthDate <= new Date() || birthDate > new Date(Date.now() + 366 * 864e5)) return json({ error:'La fecha debe estar dentro de los próximos 12 meses.' }, 400);
    if (!Number.isInteger(weight) || weight < 1500 || weight > 6000) return json({ error:'El peso debe ser un número entero entre 1.500 y 6.000 gramos.' }, 400);
    if (wantsBet && (!(receipt instanceof File) || !receipt.size)) return json({ error:'Adjuntá el comprobante para participar de la vaquita.' }, 400);
    if (receipt instanceof File && receipt.size && (receipt.size > MAX_FILE_SIZE || !ALLOWED_FILES.has(receipt.type))) return json({ error:'El comprobante debe ser JPG, PNG, WebP o PDF y pesar menos de 5 MB.' }, 400);
    if (!(await verifyTurnstile(request, env, turnstileToken))) return json({ error:'No pudimos verificar que seas una persona. Volvé a intentarlo.' }, 403);

    const hash = await ipHash(request, env.IP_HASH_SECRET || env.SUPABASE_SECRET_KEY);
    const createResponse = await supabase(env, `/rest/v1/${TABLE}`, {
      method:'POST',
      headers:{'Content-Type':'application/json','Prefer':'return=representation'},
      body:JSON.stringify({ nickname, email, birth_datetime:birthDate.toISOString(), weight_grams:weight, wants_bet:wantsBet, ip_hash:hash })
    });
    const created = await createResponse.json().catch(() => ({}));
    if (!createResponse.ok) {
      if (created.code === '23505') {
        const details = `${created.message || ''} ${created.details || ''}`;
        if (details.includes('ip_hash')) return json({ error:'Ya recibimos una predicción desde tu conexión.' }, 409);
        const label = details.includes('nickname') ? 'Ese apodo' : details.includes('email') ? 'Ese email' : details.includes('birth_datetime') ? 'Esa fecha y hora' : details.includes('weight_grams') ? 'Ese peso' : details.includes('ip_hash') ? 'Ya recibimos una predicción desde tu conexión' : 'Ese dato';
        return json({ error:`${label} ya está en uso. Probá con otro.` }, 409);
      }
      throw new Error(`Supabase insert ${createResponse.status}`);
    }
    createdId = created[0]?.id;

    if (wantsBet && receipt instanceof File && receipt.size) {
      const extension = { 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp', 'application/pdf':'pdf' }[receipt.type];
      receiptPath = `${createdId}/${crypto.randomUUID()}.${extension}`;
      const upload = await supabase(env, `/storage/v1/object/${BUCKET}/${receiptPath}`, { method:'POST', headers:{'Content-Type':receipt.type,'x-upsert':'false'}, body:receipt });
      if (!upload.ok) throw new Error(`Supabase upload ${upload.status}`);
      const patch = await supabase(env, `/rest/v1/${TABLE}?id=eq.${createdId}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({receipt_path:receiptPath}) });
      if (!patch.ok) throw new Error(`Supabase patch ${patch.status}`);
    }
    return json({ ok:true }, 201);
  } catch (error) {
    console.error('POST guess:', error.message);
    if (receiptPath) await supabase(env, `/storage/v1/object/${BUCKET}/${receiptPath}`, { method:'DELETE' }).catch(() => {});
    if (createdId) await supabase(env, `/rest/v1/${TABLE}?id=eq.${createdId}`, { method:'DELETE' }).catch(() => {});
    return json({ error:'No pudimos guardar tu predicción. Probá nuevamente.' }, 503);
  }
}
