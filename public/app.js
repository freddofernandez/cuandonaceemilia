const form = document.querySelector('#guess-form');
const betToggle = document.querySelector('#wants-bet');
const receiptArea = document.querySelector('#receipt-area');
const receiptInput = document.querySelector('#receipt');
const message = document.querySelector('#form-message');
const submitButton = document.querySelector('#submit-button');
const leaderboard = document.querySelector('#leaderboard');
const stats = document.querySelector('#stats');

const argentinaDate = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Cordoba', day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

betToggle.addEventListener('change', () => {
  receiptArea.hidden = !betToggle.checked;
  receiptInput.required = betToggle.checked;
});

function loadTurnstileScript(siteKey) {
  const container = document.querySelector('#turnstile');
  container.classList.add('cf-turnstile');
  container.dataset.sitekey = siteKey;
  container.dataset.theme = 'light';
  container.dataset.size = 'flexible';
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-turnstile-script]');
    const script = existing || document.createElement('script');
    const deadline = Date.now() + 12000;
    const waitUntilReady = () => {
      if (container.querySelector('iframe, input[name="cf-turnstile-response"]')) return resolve();
      if (Date.now() >= deadline) return reject(new Error('Turnstile no respondió.'));
      window.setTimeout(waitUntilReady, 50);
    };
    script.addEventListener('load', waitUntilReady, { once:true });
    script.addEventListener('error', () => reject(new Error('No pudimos cargar la verificación anti-bots.')), { once:true });
    if (!existing) {
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      script.async = true;
      script.defer = true;
      script.dataset.turnstileScript = '';
      document.head.append(script);
    } else waitUntilReady();
  });
}

async function loadConfig() {
  try {
    const response = await fetch('/api/config');
    if (!response.ok) throw new Error();
    const config = await response.json();
    if (config.turnstileSiteKey) {
      await loadTurnstileScript(config.turnstileSiteKey);
    }
  } catch {
    message.className = 'form-message error';
    message.textContent = 'No pudimos iniciar la protección anti-bots. Recargá la página para participar.';
    submitButton.disabled = true;
  }
}

async function loadGuesses() {
  leaderboard.innerHTML = '<p class="loading">Cargando corazonadas…</p>';
  try {
    const response = await fetch('/api/guesses');
    if (!response.ok) throw new Error();
    const guesses = await response.json();
    stats.innerHTML = `<span><b>${guesses.length}</b> ${guesses.length === 1 ? 'predicción' : 'predicciones'}</span><span>·</span><span>Cada fecha, hora y peso es único</span>`;
    leaderboard.innerHTML = guesses.length ? guesses.map((guess, index) => `
      <article class="guess-row">
        <span class="rank">${String(index + 1).padStart(2, '0')}</span>
        <span class="name">${escapeHtml(guess.nickname)}</span>
        <time class="date" datetime="${guess.birth_datetime}">${argentinaDate.format(new Date(guess.birth_datetime))}</time>
        <span class="weight">${Number(guess.weight_grams).toLocaleString('es-AR')} g</span>
        ${guess.wants_bet ? '<span class="bet-badge">VAQUITA ♡</span>' : '<span></span>'}
      </article>`).join('') : '<p class="empty">Todavía no hay predicciones. ¡Podés inaugurar la lista! 🌼</p>';
  } catch {
    leaderboard.innerHTML = '<p class="empty">No pudimos cargar las predicciones. Probá nuevamente en un ratito.</p>';
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.className = 'form-message';
  message.textContent = '';
  if (!form.reportValidity()) return;
  const file = receiptInput.files[0];
  if (file && file.size > 5 * 1024 * 1024) {
    message.classList.add('error'); message.textContent = 'El comprobante no puede superar los 5 MB.'; return;
  }
  submitButton.disabled = true;
  submitButton.firstChild.textContent = 'Guardando… ';
  try {
    const response = await fetch('/api/guesses', { method:'POST', body:new FormData(form) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'No pudimos guardar tu predicción.');
    form.reset(); receiptArea.hidden = true; receiptInput.required = false;
    message.classList.add('success'); message.textContent = '¡Listo! Tu corazonada ya está en la lista 💛';
    if (window.turnstile) window.turnstile.reset();
    await loadGuesses();
  } catch (error) {
    message.classList.add('error'); message.textContent = error.message;
    if (window.turnstile) window.turnstile.reset();
  } finally {
    submitButton.disabled = false; submitButton.firstChild.textContent = 'Guardar mi predicción ';
  }
});

document.querySelector('#refresh-button').addEventListener('click', loadGuesses);
loadConfig();
loadGuesses();
