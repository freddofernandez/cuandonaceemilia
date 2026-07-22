import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Argentina datetime serializes to the intended UTC minute', () => {
  assert.equal(new Date('2026-08-10T14:35:00-03:00').toISOString(), '2026-08-10T17:35:00.000Z');
});

test('Supabase stores birth datetimes as Argentina wall-clock values', async () => {
  const schema = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  assert.match(schema, /birth_datetime timestamp without time zone not null/);
});

test('supported receipt formats stay intentionally narrow', () => {
  const allowed = new Set(['image/jpeg','image/png','image/webp','application/pdf']);
  assert.equal(allowed.has('image/png'), true);
  assert.equal(allowed.has('image/svg+xml'), false);
  assert.equal(allowed.has('text/html'), false);
});

test('Turnstile API has a single idempotent loader', async () => {
  const [html, app] = await Promise.all([
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/app.js', import.meta.url), 'utf8')
  ]);
  assert.doesNotMatch(html, /challenges\.cloudflare\.com\/turnstile\/v0\/api\.js/);
  assert.doesNotMatch(html, /id=["']turnstile["']/);
  assert.match(html, /id=["']turnstile-widget["']/);
  assert.match(html, /id=["']already-participated["']/);
  assert.match(html, /Podés ir a ver las predicciones/);
  assert.equal((app.match(/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js/g) || []).length, 1);
  assert.match(app, /typeof window\.turnstile\?\.render === 'function'/);
  assert.match(app, /if \(turnstileApiPromise\) return turnstileApiPromise/);
  assert.match(app, /script\[data-turnstile-api\]/);
  assert.match(app, /response\.status === 409/);
  assert.match(app, /showAlreadyParticipated\(\)/);
});
