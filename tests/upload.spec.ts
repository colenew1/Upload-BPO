import { expect, test } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';

const fixturePath = path.resolve(
  __dirname,
  '../fixtures/sample-upload.xlsx',
);

test.describe('Upload preview UI', () => {
  test('renders preview and updates selection counts', async ({ page }) => {
    await page.goto('/upload');

    await page.setInputFiles('input[type="file"]', fixturePath);
    await page.getByRole('button', { name: /generate preview/i }).click();

    await expect(page.getByTestId('stat-behaviors')).toContainText('2/2');
    await expect(page.getByTestId('stat-monthly')).toContainText('1/1');
    await expect(page.getByTestId('stat-activity')).toContainText('1/1');

    const toggle = page.getByTestId('row-toggle-behaviors').first();
    await toggle.click();
    await expect(page.getByTestId('stat-behaviors')).toContainText('1/2');

    await page.getByTestId('select-all-behaviors').click();
    await expect(page.getByTestId('stat-behaviors')).toContainText('2/2');
  });
});

test.describe('Preview API', () => {
  test('returns parsed datasets for a sample workbook', async ({ request, baseURL }) => {
    const buffer = await fs.readFile(fixturePath);
    const response = await request.post(
      `${baseURL ?? 'http://127.0.0.1:3000'}/api/upload/preview`,
      {
        multipart: {
          file: {
            name: 'sample-upload.xlsx',
            mimeType:
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            buffer,
          },
          client: 'Alorica',
        },
      },
    );

    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json.data.behaviors.length).toBeGreaterThan(0);
    expect(json.data.monthlyMetrics.length).toBe(1);
    expect(json.data.activityMetrics.length).toBe(1);
    expect(json.meta.behaviorStats.acceptedRows).toBe(
      json.data.behaviors.length,
    );
  });
});

