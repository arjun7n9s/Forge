import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

const ACCESS_KEY = process.env.FORGE_E2E_ACCESS_KEY ?? 'correct horse battery staple';

test('persistence login reload durability logout revocation and conflict', async ({ page }) => {
  await openApp(page, '/');
  await expect(page.locator('body')).toBeVisible();
  const unlock = page.getByRole('heading', { name: 'Unlock FORGE' });
  const local = page.getByText('Local-only mode');
  await expect(unlock.or(local).or(page.getByText('Durable workspace'))).toBeVisible({ timeout: 20_000 });
  if (await local.isVisible().catch(() => false)) {
    test.skip(true, 'PostgreSQL persistence is not configured on this pair');
  }
  if (await unlock.isVisible().catch(() => false)) {
    await page.getByLabel('Workspace access key').fill(ACCESS_KEY);
    await page.getByRole('button', { name: /unlock workspace/i }).click();
  }
  if (!(await page.getByText('Durable workspace').isVisible().catch(() => false))) {
    test.skip(true, 'Workspace access key does not match this pair');
  }
  const revisionText = await page.getByText(/PostgreSQL revision/).textContent();
  await page.reload();
  await expect(page.getByText('Durable workspace')).toBeVisible();
  await expect(page.getByText(/PostgreSQL revision/)).toHaveText(revisionText ?? /PostgreSQL revision/);

  await page.getByRole('button', { name: /log out/i }).click();
  await expect(page.getByRole('heading', { name: 'Unlock FORGE' })).toBeVisible();

  const replay = await page.evaluate(async () => {
    const response = await fetch('/api/workspace', { credentials: 'same-origin', cache: 'no-store' });
    return response.status;
  });
  expect(replay).toBe(401);

  await page.getByLabel('Workspace access key').fill(ACCESS_KEY);
  await page.getByRole('button', { name: /unlock workspace/i }).click();
  await expect(page.getByText('Durable workspace')).toBeVisible();

  const conflicted = await page.evaluate(async () => {
    const current = await fetch('/api/workspace', { credentials: 'same-origin', cache: 'no-store' }).then((response) => response.json()) as { revision: number; snapshot: unknown };
    const stale = await fetch('/api/workspace', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ revision: Math.max(0, current.revision - 1), snapshot: current.snapshot }),
    });
    return stale.status;
  });
  expect(conflicted).toBe(409);
  await page.reload();
  await expect(page.getByText(/Durable workspace|Save conflict/)).toBeVisible();
});
