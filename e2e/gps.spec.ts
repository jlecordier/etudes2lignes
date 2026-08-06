import { expect, test } from '@playwright/test';
import {
    ajouterUnPoint,
    coordonneeDuPoint,
    waitForScroll,
    expectedScroll,
    currentScroll,
    requireDefined,
    ouvrirUnTrajetAvecUnePage,
} from './helpers';

// Géolocalisation mockée : la position du navigateur est pilotée par le test.
// 46.6042/2.3950 ≈ le centre de la vue France du sélecteur (= le point à 80 %).
test.use({
    geolocation: { latitude: 46.6042, longitude: 2.395 },
    permissions: ['geolocation'],
});

test.describe('Suivi avec le GPS du navigateur (mocké)', () => {
    test('Étant donné une position accordée, quand j’ouvre le suivi, alors la page se cale dessus', async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);
        await ajouterUnPoint(page, 0.8, 0);
        await ajouterUnPoint(page, 0.2, 150);

        await page.getByRole('button', { name: 'Suivre' }).click();

        await waitForScroll(page, await expectedScroll(page, 0.8));
    });

    test('Quand ma position devient celle du second point, alors la page suit', async ({
        page,
        context,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);
        await ajouterUnPoint(page, 0.8, 0);
        await ajouterUnPoint(page, 0.2, 150);
        // La coordonnée exacte du second point est lue sur sa ligne, en
        // infobulle : la phrase visible dit l'avancement dans le trajet, pas des
        // degrés décimaux.
        const correspondance = requireDefined(
            /: (-?[\d.]+), (-?[\d.]+)$/.exec(await coordonneeDuPoint(page, 1)),
            'coordonnées dans l’infobulle du second point',
        );
        const latitude = requireDefined(correspondance[1], 'latitude du point');
        const longitude = requireDefined(correspondance[2], 'longitude du point');

        await page.getByRole('button', { name: 'Suivre' }).click();
        await waitForScroll(page, await expectedScroll(page, 0.8));

        await context.setGeolocation({
            latitude: Number.parseFloat(latitude),
            longitude: Number.parseFloat(longitude),
        });
        // Un vrai GPS pousse des fixes en continu ; le mock ne pousse qu'au
        // changement, et cette unique poussée peut tomber dans le throttle.
        // On rejoue donc le chemin « réveil du téléphone » (position immédiate,
        // hors throttle) jusqu'à ce que la page soit calée sur le second point.
        const attendu = await expectedScroll(page, 0.2);
        await expect
            .poll(
                async () => {
                    await page.evaluate(() =>
                        document.dispatchEvent(new Event('visibilitychange')),
                    );
                    return Math.abs((await currentScroll(page)) - attendu);
                },
                { timeout: 20_000 },
            )
            .toBeLessThan(15);

        // Le dernier fix vient d'arriver : l'état d'erreur est effacé.
        await expect(page.locator('#suivi-status')).toHaveText('', { timeout: 10_000 });
    });
});
