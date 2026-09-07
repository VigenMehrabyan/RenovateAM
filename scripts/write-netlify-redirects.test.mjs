import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apiRedirect } from './write-netlify-redirects.mjs';

test('generates a concrete API proxy with the original API prefix and forced rewrite', () => {
  assert.equal(
    apiRedirect('https://api.example.invalid/'),
    '/api/* https://api.example.invalid/api/:splat 200!\n',
  );
  assert.equal(
    apiRedirect('https://api.example.invalid'),
    apiRedirect('https://api.example.invalid/'),
  );
});
test('fails early for missing or unsafe deployment configuration', () => {
  for (const value of [
    undefined,
    '',
    '$API_URL',
    'http://api.example.invalid',
    'https://user:password@api.example.invalid',
    'https://api.example.invalid/api/v1',
    'https://api.example.invalid/?key=secret',
    'https://api.example.invalid/#fragment',
  ]) {
    assert.throws(() => apiRedirect(value));
  }
});
