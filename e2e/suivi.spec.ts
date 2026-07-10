import { expect, test, type Page } from '@playwright/test';
import { ajouterUnPoint, choisirUneCoordonneeSurLaCarte, ouvrirUnTrajetAvecUnePage } from './aides';

/**
 * Prépare un trajet suivi-able : une page, un point au bas (80 %) et un point
 * en haut (20 %) — lecture bas → haut, le voyage va donc de 80 % vers 20 %.
 */
async function ouvrirLeSuiviDUnTrajetGeoreference(page: Page): Promise<void> {
  await ouvrirUnTrajetAvecUnePage(page);
  await ajouterUnPoint(page, 0.8, 0);
  await ajouterUnPoint(page, 0.2, 150);
  await page.getByRole('button', { name: 'Suivre' }).click();
  await expect(page.locator('#ecran-suivi')).toBeVisible();
}

/** Défilement attendu pour placer une fraction de l'image à 75 % de l'écran. */
function defilementAttendu(page: Page, fraction: number): Promise<number> {
  return page.evaluate((f) => {
    const image = document.querySelector<HTMLImageElement>('#pile-suivi img')!;
    const cadre = image.getBoundingClientRect();
    const cible = cadre.top + window.scrollY + f * cadre.height;
    const defilement = cible - 0.75 * window.innerHeight;
    const maximum = document.documentElement.scrollHeight - window.innerHeight;
    return Math.min(Math.max(0, maximum), Math.max(0, defilement));
  }, fraction);
}

function defilementCourant(page: Page): Promise<number> {
  return page.evaluate(() => window.scrollY);
}

test.describe('Suivi du trajet (position simulée)', () => {
  test('Étant donné le suivi ouvert, alors l’état signale que le GPS n’est pas disponible', async ({
    page,
  }) => {
    await ouvrirLeSuiviDUnTrajetGeoreference(page);

    await expect(page.locator('#etat-suivi')).toContainText('GPS non branché');
  });

  test('Étant donné une position simulée sur le premier point, alors la page se cale à 75 % et le bandeau s’affiche', async ({
    page,
  }) => {
    await ouvrirLeSuiviDUnTrajetGeoreference(page);

    await page.getByRole('button', { name: 'Simuler', exact: true }).click();
    await choisirUneCoordonneeSurLaCarte(page);

    await expect(page.locator('#bandeau-simulation')).toBeVisible();
    const attendu = await defilementAttendu(page, 0.8);
    await expect
      .poll(async () => Math.abs((await defilementCourant(page)) - attendu), { timeout: 10_000 })
      .toBeLessThan(15);
  });

  test('Étant donné le suivi actif, quand je défile à la main, alors le suivi se coupe et « Reprendre » le rétablit', async ({
    page,
  }) => {
    await ouvrirLeSuiviDUnTrajetGeoreference(page);
    await page.getByRole('button', { name: 'Simuler', exact: true }).click();
    await choisirUneCoordonneeSurLaCarte(page);
    const attendu = await defilementAttendu(page, 0.8);
    await expect
      .poll(async () => Math.abs((await defilementCourant(page)) - attendu), { timeout: 10_000 })
      .toBeLessThan(15);

    // Un défilement humain (molette / toucher) coupe le suivi automatique.
    await page.dispatchEvent('body', 'wheel');
    const boutonReprendre = page.getByRole('button', { name: 'Reprendre le suivi' });
    await expect(boutonReprendre).toBeVisible();

    // La page part ailleurs, le suivi coupé ne la ramène pas.
    await page.evaluate(() => window.scrollTo({ top: 0 }));

    await boutonReprendre.click();
    await expect(boutonReprendre).toBeHidden();
    await expect
      .poll(async () => Math.abs((await defilementCourant(page)) - attendu), { timeout: 10_000 })
      .toBeLessThan(15);
  });

  test('Étant donné une position simulée très loin de la ligne, alors l’état affiche « Hors trajet »', async ({
    page,
  }) => {
    await ouvrirLeSuiviDUnTrajetGeoreference(page);

    await page.getByRole('button', { name: 'Simuler', exact: true }).click();
    await expect(page.locator('#ecran-carte')).toBeVisible();
    const carte = (await page.locator('#conteneur-carte').boundingBox())!;
    // Presque le bord bas de la carte : à des centaines de kilomètres de la ligne.
    await page.mouse.click(carte.x + carte.width / 2, carte.y + carte.height - 20);
    await page.getByRole('button', { name: 'Valider' }).click();

    await expect(page.locator('#etat-suivi')).toContainText('Hors trajet');
  });

  test('Étant donné un trajet à un seul point, alors l’état réclame au moins deux points', async ({
    page,
  }) => {
    await ouvrirUnTrajetAvecUnePage(page);
    await ajouterUnPoint(page, 0.5, 0);
    await page.getByRole('button', { name: 'Suivre' }).click();

    await page.getByRole('button', { name: 'Simuler', exact: true }).click();
    await choisirUneCoordonneeSurLaCarte(page);

    await expect(page.locator('#etat-suivi')).toContainText('au moins deux points');
  });
});
