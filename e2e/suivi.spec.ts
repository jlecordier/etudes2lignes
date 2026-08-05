import { expect, test, type Page } from '@playwright/test';
import {
    ajouterUnPoint,
    waitForScroll,
    choisirUneCoordonneeSurLaCarte,
    expectedScroll,
    currentScroll,
    isLargeScreen,
    requireDefined,
    ouvrirUnTrajetAvecUnePage,
} from './helpers';

/**
 * Prépare un trajet suivi-able : une page, un point au bas (80 %) et un point
 * en haut (20 %) — lecture bas → haut, le voyage va donc de 80 % vers 20 %.
 */
async function ouvrirLeSuiviDUnTrajetGeoreference(page: Page): Promise<void> {
    await ouvrirUnTrajetAvecUnePage(page);
    await ajouterUnPoint(page, 0.8, 0);
    await ajouterUnPoint(page, 0.2, 150);
    await page.getByRole('button', { name: 'Suivre' }).click();
    await expect(page.locator('suivi-screen')).toBeVisible();
}

/**
 * Ouvre la carte de simulation et clique le repère du point 1 : un repère
 * n'est pas interactif, le clic atteint la carte dessous — la position
 * simulée est donc exactement celle du premier point du voyage.
 */
async function simulerSurLePremierRepere(page: Page): Promise<void> {
    await page.getByRole('button', { name: '🧪 Simuler', exact: true }).click();
    await expect(page.locator('#screen-carte')).toBeVisible();
    const longitudeInput = page.getByLabel('Longitude');
    const valueBefore = await longitudeInput.inputValue();
    const repere = requireDefined(
        await page.locator('#carte-container .carte-marker').first().boundingBox(),
        'repère sur la carte',
    );
    await page.mouse.click(repere.x + repere.width / 2, repere.y + repere.height / 2);
    await expect(longitudeInput).not.toHaveValue(valueBefore);
    await page.getByRole('button', { name: 'Valider' }).click();
    await expect(page.locator('#screen-carte')).toBeHidden();
}

/**
 * Rend l'aperçu visible : au-dessus de 900 px il l'est déjà, en dessous c'est le
 * bouton flottant qui le déplie. C'est le CSS qui dit lequel des deux, comme
 * pour l'application.
 */
async function afficherLApercu(page: Page): Promise<void> {
    if (!(await isLargeScreen(page))) {
        await page.getByRole('button', { name: 'Aperçu du trajet' }).click();
    }
    await expect(page.locator('#trajet-overview')).toBeVisible();
}

/** La hauteur relative de la barre dans la pile de l'aperçu, telle qu'elle s'affiche. */
async function fractionDeLaBarre(page: Page): Promise<number> {
    const pile = requireDefined(
        await page.locator('#overview-stack').boundingBox(),
        'cadre de la pile de l’aperçu',
    );
    const barre = requireDefined(
        await page.locator('#overview-position').boundingBox(),
        'cadre de la barre de position',
    );
    return (barre.y - pile.y) / pile.height;
}

test.describe('Aperçu du trajet pendant le suivi', () => {
    test('Étant donné une position simulée sur le premier point, alors la barre de l’aperçu tombe à la hauteur de ce point', async ({
        page,
    }) => {
        await ouvrirLeSuiviDUnTrajetGeoreference(page);
        await afficherLApercu(page);

        await simulerSurLePremierRepere(page);

        // Le premier point du voyage est à 80 % de l'unique page : la barre doit
        // tomber à 80 % de la pile de l'aperçu. On lit la fraction sur les boîtes
        // réelles — un test qui recalculerait les offsets ne vérifierait rien.
        await expect(page.locator('#overview-position')).toBeVisible();
        await expect.poll(async () => fractionDeLaBarre(page)).toBeCloseTo(0.8, 1);
    });

    test('Étant donné la simulation quittée, alors la barre quitte l’aperçu', async ({ page }) => {
        await ouvrirLeSuiviDUnTrajetGeoreference(page);
        await afficherLApercu(page);
        await simulerSurLePremierRepere(page);
        await expect(page.locator('#overview-position')).toBeVisible();

        await page.getByRole('button', { name: '🚪 Quitter' }).click();

        // Sans quoi une position fictive resterait plantée sur le trajet, que
        // l'utilisateur lirait comme sa position réelle.
        await expect(page.locator('#overview-position')).toBeHidden();
    });

    test('Étant donné un grand écran, alors l’aperçu est là sans bouton, et le trajet entier y tient', async ({
        page,
    }) => {
        await ouvrirLeSuiviDUnTrajetGeoreference(page);
        test.skip(!(await isLargeScreen(page)), 'Parcours réservé au grand écran.');

        await expect(page.locator('#trajet-overview')).toBeVisible();
        await expect(page.locator('#overview-button')).toBeHidden();

        const pile = requireDefined(
            await page.locator('#overview-stack').boundingBox(),
            'cadre de la pile de l’aperçu',
        );
        const viewport = requireDefined(page.viewportSize(), 'viewport');
        expect(pile.height).toBeLessThanOrEqual(viewport.height);
        expect(pile.height).toBeGreaterThan(0);
        // Autant de vignettes que la pile a de pages.
        await expect(page.locator('#overview-stack overview-page')).toHaveCount(
            await page.locator('#suivi-stack schema-page').count(),
        );
    });

    test('Étant donné un petit écran, alors le bouton flottant déplie puis replie l’aperçu', async ({
        page,
    }) => {
        await ouvrirLeSuiviDUnTrajetGeoreference(page);
        test.skip(await isLargeScreen(page), 'Parcours réservé aux écrans sous le seuil.');

        const overview = page.locator('#trajet-overview');
        const bouton = page.getByRole('button', { name: 'Aperçu du trajet' });
        await expect(overview).toBeHidden();

        await bouton.click();
        await expect(overview).toBeVisible();

        await bouton.click();
        await expect(overview).toBeHidden();
    });
});

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

        await expect(page.locator('#suivi-status')).toHaveText(
            'Accès à la position refusé — autorisez la localisation pour ce site puis revenez.',
        );
    });

    test('Étant donné le suivi, quand j’ouvre la carte de simulation, alors les points du trajet y sont repérés', async ({
        page,
    }) => {
        await ouvrirLeSuiviDUnTrajetGeoreference(page);

        await page.getByRole('button', { name: '🧪 Simuler', exact: true }).click();
        await expect(page.locator('#screen-carte')).toBeVisible();

        await expect(page.locator('#carte-container .carte-marker')).toHaveText(['1', '2']);
    });

    test('Étant donné une position simulée sur le premier point, alors la page se cale à 75 % et le bandeau s’affiche', async ({
        page,
    }) => {
        await ouvrirLeSuiviDUnTrajetGeoreference(page);

        await simulerSurLePremierRepere(page);

        await expect(page.locator('#simulation-banner')).toBeVisible();
        await waitForScroll(page, await expectedScroll(page, 0.8));
    });

    test('Étant donné le suivi actif, quand je défile à la main, alors le suivi se coupe et « Reprendre » le rétablit', async ({
        page,
    }) => {
        await ouvrirLeSuiviDUnTrajetGeoreference(page);
        await simulerSurLePremierRepere(page);
        const attendu = await expectedScroll(page, 0.8);
        await waitForScroll(page, attendu);

        // Un défilement humain (molette / toucher) coupe le suivi automatique.
        await page.dispatchEvent('body', 'wheel');
        const resumeButton = page.getByRole('button', { name: 'Reprendre le suivi' });
        await expect(resumeButton).toBeVisible();

        // La page part ailleurs, le suivi coupé ne la ramène pas.
        await page.evaluate(() => {
            window.scrollTo({ top: 0 });
        });

        await resumeButton.click();
        await expect(resumeButton).toBeHidden();
        await waitForScroll(page, attendu);
    });

    test('Étant donné une simulation quittée, quand je reprends le suivi, alors la page ne revient pas sur la position simulée', async ({
        page,
    }) => {
        await ouvrirLeSuiviDUnTrajetGeoreference(page);
        await simulerSurLePremierRepere(page);
        await waitForScroll(page, await expectedScroll(page, 0.8));

        // Retour au GPS réel : la position simulée doit être oubliée. Sans cela,
        // l'utilisateur lirait une position simulée en la croyant réelle.
        await page.getByRole('button', { name: '🚪 Quitter' }).click();
        await expect(page.locator('#simulation-banner')).toBeHidden();

        // Il lit ailleurs dans le document, puis redemande le suivi automatique.
        await page.dispatchEvent('body', 'wheel');
        await page.evaluate(() => {
            window.scrollTo({ top: 0 });
        });
        const resumeButton = page.getByRole('button', { name: 'Reprendre le suivi' });
        await expect(resumeButton).toBeVisible();
        await resumeButton.click();

        // Aucune position réelle n'est arrivée (permission refusée en test) : la
        // page doit donc rester où elle est. On attend franchement, puisqu'il
        // s'agit de vérifier qu'un défilement ne se produit PAS.
        await page.waitForTimeout(1_000);
        expect(await currentScroll(page)).toBeLessThan(15);
    });

    test('Étant donné une position simulée très loin de la ligne, alors l’état affiche « Hors trajet »', async ({
        page,
    }) => {
        await ouvrirLeSuiviDUnTrajetGeoreference(page);

        await page.getByRole('button', { name: '🧪 Simuler', exact: true }).click();
        await expect(page.locator('#screen-carte')).toBeVisible();
        // Marseille, saisie à la main : loin de la ligne quel que soit le zoom.
        await page.getByLabel('Latitude').fill('43.2965');
        await page.getByLabel('Longitude').fill('5.3698');
        await page.getByRole('button', { name: 'Placer' }).click();
        await page.getByRole('button', { name: 'Valider' }).click();

        await expect(page.locator('#suivi-status')).toHaveText(
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

        await expect(page.locator('#suivi-status')).toHaveText(
            'Ajoutez au moins deux points géo-référencés pour activer le suivi.',
        );
    });
});
