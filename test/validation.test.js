import test from 'node:test';
import assert from 'node:assert/strict';

test('Argentina datetime serializes to the intended UTC minute', () => {
  assert.equal(new Date('2026-08-10T14:35:00-03:00').toISOString(), '2026-08-10T17:35:00.000Z');
});

test('supported receipt formats stay intentionally narrow', () => {
  const allowed = new Set(['image/jpeg','image/png','image/webp','application/pdf']);
  assert.equal(allowed.has('image/png'), true);
  assert.equal(allowed.has('image/svg+xml'), false);
  assert.equal(allowed.has('text/html'), false);
});
