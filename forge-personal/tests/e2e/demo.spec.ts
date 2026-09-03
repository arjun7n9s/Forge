import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

test('locked preventive and reactive demo path', async ({ page }) => {
  await openApp(page, '/notes/note-gautret');
  await expect(page.getByText('Retracted')).toBeVisible();
  await expect(page.getByTestId('citation-doi')).toHaveCSS('text-decoration-line', 'line-through');
  await page.getByRole('button', { name: /save note/i }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();

  await openApp(page, '/notes/note-clean');
  await expect(page.getByLabel('Citation verified clean')).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);

  await openApp(page, '/notes/note-lesne');
  await expect(page.getByText('Retracted')).toBeVisible();

  await page.getByRole('link', { name: /^workspace$/i }).click();
  await page.getByRole('button', { name: /run scan now/i }).first().click();
  await expect(page.getByText('Pending review').first()).toBeVisible();
  await page.getByRole('button', { name: /^review$/i }).first().click();
  await expect(page.getByRole('button', { name: /confirm edit/i })).toBeVisible();
  await page.getByRole('button', { name: /close review/i }).click();
  await expect(page.getByRole('button', { name: /confirm edit/i })).toHaveCount(0);
});
