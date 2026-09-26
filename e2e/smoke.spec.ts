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
