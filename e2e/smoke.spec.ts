import { expect, test } from '@playwright/test';

const pages: [string, string][] = [
  ['/criaturas', 'Criaturas'],
  ['/combate', 'Combate'],
  ['/gerador', 'Gerador de desafios'],
  ['/estudio', 'Estúdio'],
  ['/bestiario', 'Bestiário'],
  ['/magias', 'Magias'],
  ['/dados', 'Dados'],
  ['/mesa', 'Mesa online'],
];

for (const [path, title] of pages) {
  test(`${path} abre`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(title);
    expect(errors).toEqual([]);
  });
}

test('botão Rolar responde sem erros', async ({ page }) => {
  await page.goto('/dados');
  await page.getByRole('button', { name: 'Rolar', exact: true }).click();
  await expect(page.locator('[aria-live]').first()).toBeAttached();
});

test('mapa fica em primeiro plano no tablet', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/combate');
  const map = await page.locator('app-map-view').boundingBox();
  const initiative = await page.getByRole('complementary', { name: 'Iniciativa' }).boundingBox();
  expect(map).not.toBeNull();
  expect(initiative).not.toBeNull();
  expect(map!.y).toBeLessThan(initiative!.y);
});
