import { expect, test, type Page } from '@playwright/test';
import {
    ajouterUnPoint,
    attendreLeDefilement,
    choisirUneCoordonneeSurLaCarte,
    defilementAttendu,
    ouvrirUnTrajetAvecUnePage,
} from './aides';

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

/**
 * Ouvre la carte de simulation et clique le repère du point 1 : un repère
 * n'est pas interactif, le clic atteint la carte dessous — la position
 * simulée est donc exactement celle du premier point du voyage.
 */
async function simulerSurLePremierRepere(page: Page): Promise<void> {
    await page.getByRole('button', { name: '🧪 Simuler', exact: true }).click();
    await expect(page.locator('#ecran-carte')).toBeVisible();
    const champLongitude = page.getByLabel('Longitude');
    const valeurAvant = await champLongitude.inputValue();
    const repere = (await page.locator('#conteneur-carte .marqueur-carte').first().boundingBox())!;
    await page.mouse.click(repere.x + repere.width / 2, repere.y + repere.height / 2);
    await expect(champLongitude).not.toHaveValue(valeurAvant);
    await page.getByRole('button', { name: 'Valider' }).click();
    await expect(page.locator('#ecran-carte')).toBeHidden();
}

test.describe('Suivi du trajet (position simulée)', () => {
    test('Étant donné une permission refusée (défaut Playwright), alors l’état l’explique', async ({
        page,
        browserName,
    }) => {
        test.skip(
            browserName === 'firefox',
            'Firefox ne délivre aucun callback d’erreur sur refus de permission : l’état reste « En attente ».',
        );
        await ouvrirLeSuiviDUnTrajetGeoreference(page);

        await expect(page.locator('#etat-suivi')).toHaveText(
            'Accès à la position refusé — autorisez la localisation pour ce site puis revenez.',
        );
    });

    test('Étant donné le suivi, quand j’ouvre la carte de simulation, alors les points du trajet y sont repérés', async ({
        page,
    }) => {
        await ouvrirLeSuiviDUnTrajetGeoreference(page);

        await page.getByRole('button', { name: '🧪 Simuler', exact: true }).click();
        await expect(page.locator('#ecran-carte')).toBeVisible();

        await expect(page.locator('#conteneur-carte .marqueur-carte')).toHaveText(['1', '2']);
    });

    test('Étant donné une position simulée sur le premier point, alors la page se cale à 75 % et le bandeau s’affiche', async ({
        page,
    }) => {
        await ouvrirLeSuiviDUnTrajetGeoreference(page);

        await simulerSurLePremierRepere(page);

        await expect(page.locator('#bandeau-simulation')).toBeVisible();
        await attendreLeDefilement(page, await defilementAttendu(page, 0.8));
    });

    test('Étant donné le suivi actif, quand je défile à la main, alors le suivi se coupe et « Reprendre » le rétablit', async ({
        page,
    }) => {
        await ouvrirLeSuiviDUnTrajetGeoreference(page);
        await simulerSurLePremierRepere(page);
        const attendu = await defilementAttendu(page, 0.8);
        await attendreLeDefilement(page, attendu);

        // Un défilement humain (molette / toucher) coupe le suivi automatique.
        await page.dispatchEvent('body', 'wheel');
        const boutonReprendre = page.getByRole('button', { name: 'Reprendre le suivi' });
        await expect(boutonReprendre).toBeVisible();

        // La page part ailleurs, le suivi coupé ne la ramène pas.
        await page.evaluate(() => window.scrollTo({ top: 0 }));

        await boutonReprendre.click();
        await expect(boutonReprendre).toBeHidden();
        await attendreLeDefilement(page, attendu);
    });

    test('Étant donné une position simulée très loin de la ligne, alors l’état affiche « Hors trajet »', async ({
        page,
    }) => {
        await ouvrirLeSuiviDUnTrajetGeoreference(page);

        await page.getByRole('button', { name: '🧪 Simuler', exact: true }).click();
        await expect(page.locator('#ecran-carte')).toBeVisible();
        // Marseille, saisie à la main : loin de la ligne quel que soit le zoom.
        await page.getByLabel('Latitude').fill('43.2965');
        await page.getByLabel('Longitude').fill('5.3698');
        await page.getByRole('button', { name: 'Placer' }).click();
        await page.getByRole('button', { name: 'Valider' }).click();

        await expect(page.locator('#etat-suivi')).toHaveText(
            /^Hors trajet \(à \d+ km de la ligne\)\.$/,
        );
    });

    test('Étant donné un trajet à un seul point, alors l’état réclame au moins deux points', async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);
        await ajouterUnPoint(page, 0.5, 0);
        await page.getByRole('button', { name: 'Suivre' }).click();

        await page.getByRole('button', { name: '🧪 Simuler', exact: true }).click();
        await choisirUneCoordonneeSurLaCarte(page);

        await expect(page.locator('#etat-suivi')).toHaveText(
            'Ajoutez au moins deux points géo-référencés pour activer le suivi.',
        );
    });
});
