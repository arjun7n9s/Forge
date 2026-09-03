import { expect, test } from '@playwright/test';
import { installFakeModelContext, openApp } from './helpers';

test('EOC-only DOI is amber and does not warn on save', async ({ page }) => {
  await openApp(page, '/notes/note-eoc');
  await expect(page.getByText('Editorial concern')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('citation-doi')).toHaveCSS('text-decoration-line', 'underline');
  await page.getByRole('button', { name: /save note/i }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('OpenAlex-only retraction is labeled as OpenAlex-only, not corroborated', async ({ page }) => {
  await openApp(page, '/notes/note-openalex');
  await expect(page.getByText('Retracted')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /run scan now/i }).click();
  await page.getByRole('link', { name: /^workspace$/i }).click();
  await expect(page.getByText('OpenAlex retraction')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Signals disagree')).toHaveCount(0);
});

test('slow DOI source renders a gray unknown dot and still allows save', async ({ page }) => {
  await page.route('**/api/verify', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ doi: '10.1234/timeout', status: 'unknown', card_type: null, colors: { integrity: 'gray' }, sources: {}, timings_ms: { total: 5000, openalex: 5000, crossref: 0 }, cache: { state: 'miss' } }) });
  });
  await openApp(page, '/notes/note-clean');
  const editor = page.getByLabel('Note body');
  await editor.fill('Timeout probe 10.1234/timeout-source-xyz');
  await expect(page.getByLabel('Citation status unknown')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /save note/i }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('review-gated tools exist only while the review drawer is open', async ({ page }) => {
  await installFakeModelContext(page);
  await openApp(page, '/');
  const before = await page.evaluate(async () => (await document.modelContext?.getTools?.() ?? []).map((tool) => tool.name));
  expect(before).not.toContain('confirm_edit');
  await page.getByRole('button', { name: /^review$/i }).first().click();
  await expect(page.getByRole('button', { name: /confirm edit/i })).toBeVisible();
  const open = await page.evaluate(async () => (await document.modelContext?.getTools?.() ?? []).map((tool) => tool.name));
  expect(open).toEqual(expect.arrayContaining(['confirm_edit', 'reject_edit']));
  await page.getByRole('button', { name: /close review/i }).click();
  await expect(page.getByRole('button', { name: /confirm edit/i })).toHaveCount(0);
  const after = await page.evaluate(async () => (await document.modelContext?.getTools?.() ?? []).map((tool) => tool.name));
  expect(after).not.toContain('confirm_edit');
});
