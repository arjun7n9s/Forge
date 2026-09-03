import { expect, test } from '@playwright/test';
import { installFakeModelContext, openApp } from './helpers';

const BAD_ORIGINS = ['https://attacker.example', 'https://evil.example', 'http://127.0.0.1:9'];

test('negative-origin discovery stays empty across multiple bad origins', async ({ page }) => {
  await installFakeModelContext(page);
  await openApp(page, '/proof');
  await expect(page.getByTestId('discovery-state')).toHaveAttribute('data-discovery', 'supported');
  for (const origin of BAD_ORIGINS) {
    const count = await page.evaluate(async (fromOrigin) => {
      const tools = await document.modelContext?.getTools?.({ fromOrigins: [fromOrigin] }) ?? [];
      return tools.length;
    }, origin);
    expect(count, origin).toBe(0);
  }
  await expect(page.getByTestId('negative-origin')).toHaveAttribute('data-negative', 'pass');
});
