import { expect, test } from '@playwright/test';

const REQUIRED = [
  'origin-agent-cluster',
  'permissions-policy',
  'x-content-type-options',
  'referrer-policy',
  'content-security-policy',
  'strict-transport-security',
];

test('personal origin emits the isolation and hardening headers', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.ok()).toBeTruthy();
  for (const name of REQUIRED) {
    const value = response.headers()[name];
    expect(value, name).toBeTruthy();
  }
  expect(response.headers()['origin-agent-cluster']).toBe('?1');
  expect(response.headers()['permissions-policy']).toContain('tools=(self)');
  expect(response.headers()['referrer-policy']).toBe('no-referrer');
  expect(response.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(response.headers()['strict-transport-security']).toContain('max-age=31536000');
});
