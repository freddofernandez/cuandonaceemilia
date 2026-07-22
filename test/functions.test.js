import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet, onRequestPost } from '../functions/api/guesses.js';

const originalFetch = globalThis.fetch;
const env = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SECRET_KEY: 'server-secret',
  IP_HASH_SECRET: 'ip-hash-secret',
  CF_PAGES_BRANCH: 'local'
};

function futureLocalMinute(days = 10) {
  const utc = new Date(Date.now() + days * 864e5);
  return new Date(utc.getTime() - 3 * 36e5).toISOString().slice(0, 16);
}

function submission(overrides = {}) {
  const form = new FormData();
  form.set('nickname', overrides.nickname || 'Tía Juli');
  form.set('email', overrides.email || 'juli@example.com');
  form.set('birth_datetime', overrides.birth_datetime || futureLocalMinute());
  form.set('weight_grams', String(overrides.weight_grams || 3250));
  if (overrides.wants_bet) form.set('wants_bet', 'on');
  if (overrides.receipt) form.set('receipt', overrides.receipt, overrides.filename || 'transferencia.pdf');
  return new Request('https://cuandonaceemilia.pages.dev/api/guesses', {
    method: 'POST',
    headers: { 'CF-Connecting-IP': overrides.ip || '203.0.113.42' },
    body: form
  });
}

test.after(() => { globalThis.fetch = originalFetch; });

test('public leaderboard requests and returns only safe fields', async () => {
  let requestedUrl;
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return Response.json([{ nickname:'Abu', birth_datetime:'2026-08-10T17:35:00Z', weight_grams:3300, wants_bet:false }]);
  };
  const response = await onRequestGet({ env });
  assert.equal(response.status, 200);
  assert.match(requestedUrl, /select=nickname,birth_datetime,weight_grams,wants_bet/);
  assert.doesNotMatch(requestedUrl, /email|ip_hash|receipt_path/);
  assert.equal((await response.json())[0].nickname, 'Abu');
});

test('valid prediction is inserted with normalized identity and hashed IP', async () => {
  let inserted;
  globalThis.fetch = async (url, init = {}) => {
    assert.equal(init.headers.apikey, env.SUPABASE_SECRET_KEY);
    inserted = JSON.parse(init.body);
    return Response.json([{ id:'7a908e56-40f2-4d64-a2a4-b0cc2a6385c1' }]);
  };
  const response = await onRequestPost({ request:submission({ nickname:'  Tía   Juli  ', email:'JULI@EXAMPLE.COM' }), env });
  assert.equal(response.status, 201);
  assert.equal(inserted.nickname, 'Tía Juli');
  assert.equal(inserted.email, 'juli@example.com');
  assert.match(inserted.ip_hash, /^[a-f0-9]{64}$/);
  assert.equal(inserted.birth_datetime.endsWith(':00.000Z'), true);
});

test('receipt flow uploads privately and stores only its random path', async () => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url:String(url), method:init.method || 'GET', body:init.body });
    if (String(url).includes('/rest/v1/emilia_guesses') && init.method === 'POST') {
      return Response.json([{ id:'7a908e56-40f2-4d64-a2a4-b0cc2a6385c1' }]);
    }
    return new Response(null, { status:200 });
  };
  const receipt = new Blob(['private transfer'], { type:'application/pdf' });
  const response = await onRequestPost({ request:submission({ wants_bet:true, receipt }), env });
  assert.equal(response.status, 201);
  const upload = calls.find(call => call.url.includes('/storage/v1/object/emilia-transferencias/'));
  assert.equal(upload.method, 'POST');
  assert.match(upload.url, /7a908e56-40f2-4d64-a2a4-b0cc2a6385c1\/[0-9a-f-]+\.pdf$/);
  const patch = calls.find(call => call.method === 'PATCH');
  assert.match(JSON.parse(patch.body).receipt_path, /^[0-9a-f-]+\/[0-9a-f-]+\.pdf$/);
});

test('database uniqueness conflicts become friendly HTTP 409 responses', async () => {
  globalThis.fetch = async () => Response.json({ code:'23505', message:'duplicate key', details:'weight_grams already exists' }, { status:409 });
  const response = await onRequestPost({ request:submission(), env });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /Ese peso ya está en uso/);
});

test('bet receipt rejects executable and oversized file types before persistence', async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; return Response.json([]); };
  const receipt = new Blob(['<script>alert(1)</script>'], { type:'text/html' });
  const response = await onRequestPost({ request:submission({ wants_bet:true, receipt, filename:'receipt.html' }), env });
  assert.equal(response.status, 400);
  assert.equal(called, false);
});
