import { expect, test, type Page } from '@playwright/test';
import { fichierPng } from './aides';

async function ouvrirUnTrajetAvecUnePage(page: Page): Promise<void> {
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

async function cliquerSurLImage(page: Page, fractionDeHauteur: number): Promise<void> {
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

async function choisirUneCoordonneeSurLaCarte(page: Page, decalageX = 0): Promise<void> {
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

test.describe('Géoréférencement des points', () => {
  test('Étant donné une image, quand j’ajoute un point (image puis carte), alors il apparaît en liste et en marqueur', async ({
    page,
  }) => {
    await ouvrirUnTrajetAvecUnePage(page);

    await page.getByRole('button', { name: 'Ajouter un point' }).click();
    await cliquerSurLImage(page, 0.25);
    await choisirUneCoordonneeSurLaCarte(page);

    await expect(page.locator('.description-point')).toHaveCount(1);
    await expect(page.locator('.description-point')).toContainText(/à 2[4-6] %/);
    await expect(page.locator('.marqueur-point')).toHaveCount(1);
  });

  test('Étant donné un point, quand je le déplace sur l’image, alors sa hauteur change sans ouvrir la carte', async ({
    page,
  }) => {
    await ouvrirUnTrajetAvecUnePage(page);
    await page.getByRole('button', { name: 'Ajouter un point' }).click();
    await cliquerSurLImage(page, 0.25);
    await choisirUneCoordonneeSurLaCarte(page);

    await page.getByRole('button', { name: "Déplacer le point 1 sur l'image" }).click();
    await cliquerSurLImage(page, 0.75);

    await expect(page.locator('#ecran-carte')).toBeHidden();
    await expect(page.locator('.description-point')).toContainText(/à 7[4-6] %/);
  });

  test('Étant donné un point, quand je le déplace sur la carte, alors sa coordonnée change', async ({
    page,
  }) => {
    await ouvrirUnTrajetAvecUnePage(page);
    await page.getByRole('button', { name: 'Ajouter un point' }).click();
    await cliquerSurLImage(page, 0.25);
    await choisirUneCoordonneeSurLaCarte(page);
    const avant = (await page.locator('.description-point').textContent()) ?? '';

    await page.getByRole('button', { name: 'Déplacer le point 1 sur la carte' }).click();
    await choisirUneCoordonneeSurLaCarte(page, 150);

    // Assertion qui réessaie : la sauvegarde et le re-rendu sont asynchrones.
    await expect(page.locator('.description-point')).not.toHaveText(avant);
  });

  test('Étant donné un point, quand je le supprime et confirme, alors liste et marqueur disparaissent', async ({
    page,
  }) => {
    await ouvrirUnTrajetAvecUnePage(page);
    await page.getByRole('button', { name: 'Ajouter un point' }).click();
    await cliquerSurLImage(page, 0.25);
    await choisirUneCoordonneeSurLaCarte(page);

    page.once('dialog', (dialogue) => void dialogue.accept());
    await page.getByRole('button', { name: 'Supprimer le point 1' }).click();

    await expect(page.locator('.description-point')).toHaveCount(0);
    await expect(page.locator('.marqueur-point')).toHaveCount(0);
  });

  test('Étant donné le choix sur carte, quand je saisis latitude et longitude à la main, alors le point est créé avec ces valeurs', async ({
    page,
  }) => {
    await ouvrirUnTrajetAvecUnePage(page);
    await page.getByRole('button', { name: 'Ajouter un point' }).click();
    await cliquerSurLImage(page, 0.5);
    await expect(page.locator('#ecran-carte')).toBeVisible();

    await page.getByLabel('Latitude').fill('46.5802');
    await page.getByLabel('Longitude').fill('0.3404');
    await page.getByRole('button', { name: 'Placer' }).click();
    await page.getByRole('button', { name: 'Valider' }).click();

    await expect(page.locator('.description-point')).toContainText('46.5802, 0.3404');
  });
});
