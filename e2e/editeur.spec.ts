import { expect, test, type Page } from '@playwright/test';
import { fichierPng } from './aides';

async function ouvrirUnTrajetVierge(page: Page): Promise<void> {
  await page.goto('./');
  page.once('dialog', (dialogue) => void dialogue.accept('Paris → Bordeaux'));
  await page.getByRole('button', { name: 'Nouveau trajet' }).click();
  await page.getByRole('button', { name: 'Paris → Bordeaux' }).click();
  await expect(page.getByRole('heading', { name: 'Paris → Bordeaux' })).toBeVisible();
}

async function importerDeuxPages(page: Page): Promise<void> {
  await page
    .locator('#input-images')
    .setInputFiles([fichierPng('page-1.png'), fichierPng('page-2.png')]);
  await expect(page.locator('.nom-image')).toHaveText(['page-1.png', 'page-2.png']);
}

test.describe("Éditeur d'un trajet — les images", () => {
  test('Étant donné un trajet vierge, quand j’importe deux images, alors elles s’affichent dans l’ordre', async ({
    page,
  }) => {
    await ouvrirUnTrajetVierge(page);

    await importerDeuxPages(page);

    await expect(page.locator('#pile-images img')).toHaveCount(2);
  });

  test('Étant donné deux images, quand je monte la seconde, alors l’ordre s’inverse', async ({
    page,
  }) => {
    await ouvrirUnTrajetVierge(page);
    await importerDeuxPages(page);

    await page.getByRole('button', { name: 'Monter page-2.png' }).click();

    await expect(page.locator('.nom-image')).toHaveText(['page-2.png', 'page-1.png']);
  });

  test('Étant donné deux images, quand j’en supprime une et confirme, alors elle disparaît durablement', async ({
    page,
  }) => {
    await ouvrirUnTrajetVierge(page);
    await importerDeuxPages(page);

    page.once('dialog', (dialogue) => void dialogue.accept());
    await page.getByRole('button', { name: 'Supprimer page-1.png' }).click();
    await expect(page.locator('.nom-image')).toHaveText(['page-2.png']);

    // La suppression survit à un rechargement (persistance IndexedDB).
    await page.reload();
    await page.getByRole('button', { name: 'Paris → Bordeaux' }).click();
    await expect(page.locator('.nom-image')).toHaveText(['page-2.png']);
  });

  test('Étant donné l’éditeur, quand je reviens à la liste, alors le compte d’images est à jour', async ({
    page,
  }) => {
    await ouvrirUnTrajetVierge(page);
    await importerDeuxPages(page);

    await page.getByRole('button', { name: '← Trajets' }).click();

    await expect(page.getByText('2 image(s) · 0 point(s)')).toBeVisible();
  });
});
