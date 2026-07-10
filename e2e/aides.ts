import { expect, type Page } from '@playwright/test';

/** PNG transparent de 1×1 pixel : suffisant pour tester l'import sans fixture lourde. */
export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

export function fichierPng(nom: string): { name: string; mimeType: string; buffer: Buffer } {
  return { name: nom, mimeType: 'image/png', buffer: PNG_1X1 };
}

/** Crée un trajet, l'ouvre dans l'éditeur et importe une page. */
export async function ouvrirUnTrajetAvecUnePage(page: Page): Promise<void> {
  // Les tuiles OSM sont bloquées : la carte reste grise mais fonctionne,
  // et les tests ne dépendent pas du réseau.
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
  await page.goto('./');
  page.once('dialog', (dialogue) => void dialogue.accept('Paris → Bordeaux'));
  await page.getByRole('button', { name: 'Nouveau trajet' }).click();
  await page.getByRole('button', { name: 'Paris → Bordeaux' }).click();
  // L'éditeur charge le trajet en asynchrone : attendre qu'il soit prêt
  // (le titre apparaît en fin de chargement) avant d'importer.
  await expect(page.getByRole('heading', { name: 'Paris → Bordeaux' })).toBeVisible();
  await page.locator('#input-images').setInputFiles([fichierPng('page-1.png')]);
  await expect(page.locator('.nom-image')).toHaveText(['page-1.png']);
}

/** Clique sur l'image de l'éditeur à une fraction de sa hauteur. */
export async function cliquerSurLImage(page: Page, fractionDeHauteur: number): Promise<void> {
  const zone = page.locator('.zone-image').first();
  await zone.scrollIntoViewIfNeeded();
  // L'image de test s'étire en pleine largeur : le point visé peut être sous
  // le pli. On centre la cible dans le viewport avant de cliquer.
  const viewport = page.viewportSize()!;
  let cadre = (await zone.boundingBox())!;
  const decalage = cadre.y + cadre.height * fractionDeHauteur - viewport.height / 2;
  await page.evaluate((delta) => window.scrollBy(0, delta), decalage);
  cadre = (await zone.boundingBox())!;
  await page.mouse.click(cadre.x + cadre.width / 2, cadre.y + cadre.height * fractionDeHauteur);
}

/** Choisit une coordonnée sur la carte ouverte (clic au centre + décalage). */
export async function choisirUneCoordonneeSurLaCarte(page: Page, decalageX = 0): Promise<void> {
  await expect(page.locator('#ecran-carte')).toBeVisible();
  // Le décalage du clic est horizontal : c'est la longitude qui doit changer.
  const champLongitude = page.getByLabel('Longitude');
  const valeurAvant = await champLongitude.inputValue();
  const carte = (await page.locator('#conteneur-carte').boundingBox())!;
  await page.mouse.click(carte.x + carte.width / 2 + decalageX, carte.y + carte.height / 2);
  // Le clic n'est pris en compte que lorsque le marqueur a bougé : attendre
  // que la saisie reflète la nouvelle longitude avant de valider.
  await expect(champLongitude).not.toHaveValue(valeurAvant);
  await page.getByRole('button', { name: 'Valider' }).click();
  await expect(page.locator('#ecran-carte')).toBeHidden();
}

/** Ajoute un point : clic sur l'image à la fraction donnée, puis choix sur carte. */
export async function ajouterUnPoint(
  page: Page,
  fractionDeHauteur: number,
  decalageCarteX = 0,
): Promise<void> {
  await page.getByRole('button', { name: 'Ajouter un point' }).click();
  await cliquerSurLImage(page, fractionDeHauteur);
  await choisirUneCoordonneeSurLaCarte(page, decalageCarteX);
}
