import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Precisa de `npm run scene` (gera e2e/.scene.json); sem o arquivo o teste é ignorado.
const scene = path.join(__dirname, '.scene.json');

test.skip(!existsSync(scene), 'rode "npm run scene" antes');

test('cena: Redirecionar Ataque, Tinta do Polvo e mover o Cão Fiel', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const state = readFileSync(scene, 'utf8');
  await page.addInitScript((s) => {
    localStorage.setItem('runegrid.encounter.v2', s);
    localStorage.setItem(
      'runegrid.prefs.v1',
      JSON.stringify({ highContrast: false, locale: 'pt-BR', ruleset: '2024' }),
    );
  }, state);
  await page.goto('/combate');
  const token = (n: string) =>
    page.locator(`app-map-view [role=button][aria-label*="${n}"]`).first();

  await page
    .getByRole('button', { name: /Espada/ })
    .first()
    .click();
  await token('Chefe').click({ force: true });
  await page.locator('.reaction button', { hasText: '→' }).first().click();
  await expect(page.locator('[role=log] li').first()).toContainText('Goblin');

  await page.getByRole('button', { name: 'Encerrar turno' }).click();
  await page.locator('.reaction button', { hasText: 'destino' }).click();
  await page
    .locator('app-map-view svg')
    .first()
    .click({ position: { x: 300, y: 330 }, force: true });
  await expect(page.locator('[role=log]')).toContainText('Polvo usa a reação');

  await page.getByRole('button', { name: 'Encerrar turno' }).click();
  await page.getByRole('button', { name: /Mover Faithful/ }).click();
  await page
    .locator('app-map-view svg')
    .first()
    .click({ position: { x: 200, y: 400 }, force: true });
  await expect(page.locator('[role=log]')).toContainText('Faithful Hound avança');
  expect(errors).toEqual([]);
});
