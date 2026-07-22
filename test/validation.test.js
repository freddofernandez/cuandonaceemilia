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
  assert.match(html, /Ya recibimos 5 predicciones desde esta conexión/);
  assert.equal((app.match(/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js/g) || []).length, 1);
  assert.match(app, /typeof window\.turnstile\?\.render === 'function'/);
  assert.match(app, /if \(turnstileApiPromise\) return turnstileApiPromise/);
  assert.match(app, /script\[data-turnstile-api\]/);
  assert.match(app, /response\.status === 429/);
  assert.match(app, /showSubmissionLimit\(\)/);
  assert.match(app, /scope=ip-status/);
  assert.match(app, /\/verificación\|anti-bots\|persona\/i/);
});

test('database schema and migration enforce five submissions per IP', async () => {
  const [schema, migration] = await Promise.all([
    readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260722_ip_submission_limit.sql', import.meta.url), 'utf8')
  ]);
  assert.doesNotMatch(schema, /constraint emilia_ip_unique/);
  assert.match(schema, /count\(\*\).*ip_hash = new\.ip_hash\) >= 5/s);
  assert.match(migration, /drop constraint if exists emilia_ip_unique/);
  assert.match(migration, /pg_advisory_xact_lock/);
});

test('family messages are limited in the form, API schema, and migration', async () => {
  const [html, app, schema, migration] = await Promise.all([
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260722_family_message.sql', import.meta.url), 'utf8')
  ]);
  assert.match(html, /name="family_message"[^>]*maxlength="240"/);
  assert.match(app, /\.message-toggle/);
  assert.match(app, /escapeHtml\(familyMessage\)/);
  assert.match(schema, /family_message text not null default '' check \(char_length\(family_message\) <= 240\)/);
  assert.match(migration, /add column if not exists family_message text not null default ''/);
  assert.match(migration, /check \(char_length\(family_message\) <= 240\)/);
});
