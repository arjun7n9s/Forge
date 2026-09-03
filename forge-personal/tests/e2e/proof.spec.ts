import { expect, test } from '@playwright/test';
import { installFakeModelContext, openApp, registeredToolNames } from './helpers';

test('proof surface reads live getTools and review-gated editor state', async ({ page }) => {
  await installFakeModelContext(page);
  await openApp(page, '/proof');

  await expect(page.getByTestId('discovery-state')).toHaveAttribute('data-discovery', 'supported');
  await expect(page.locator('[data-testid="proof-tool"][data-active="true"]').first()).toBeVisible();
  const idleNames = await registeredToolNames(page);
  expect(idleNames.length).toBeGreaterThan(0);
  const renderedIdle = await page.getByTestId('proof-tool').evaluateAll((nodes) =>
    nodes.filter((node) => node.getAttribute('data-active') === 'true').map((node) => node.getAttribute('data-tool-name') ?? '').sort(),
  );
  expect(renderedIdle).toEqual(idleNames);
  await expect(page.getByTestId('editor-state')).toHaveText('EDITOR_DRAFT_READY');

  await openApp(page, '/');
  await page.getByRole('button', { name: /^review$/i }).first().click();
  await expect(page.getByRole('button', { name: /confirm edit/i })).toBeVisible();
  await page.getByRole('complementary', { name: /edit review drawer/i }).getByRole('link', { name: /inspect proof/i }).click();

  await expect(page.getByTestId('editor-state')).toHaveText('EDITOR_REVIEW_OPEN');
  const reviewNames = await registeredToolNames(page);
  expect(reviewNames).toEqual(expect.arrayContaining(['confirm_edit', 'reject_edit', 'propose_note_edit']));
  const renderedReview = await page.getByTestId('proof-tool').evaluateAll((nodes) =>
    nodes.filter((node) => node.getAttribute('data-active') === 'true').map((node) => node.getAttribute('data-tool-name') ?? '').sort(),
  );
  expect(renderedReview).toEqual(reviewNames);
  await expect(page.locator('[data-testid="proof-tool"][data-tool-name="confirm_edit"]')).toHaveAttribute('data-active', 'true');
});
