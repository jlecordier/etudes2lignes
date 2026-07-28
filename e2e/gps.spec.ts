import { expect, test } from '@playwright/test';
import {
    ajouterUnPoint,
    attendreLeDefilement,
    defilementAttendu,
    defilementCourant,
    mesure,
    ouvrirUnTrajetAvecUnePage,
} from './aides';

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

        await attendreLeDefilement(page, await defilementAttendu(page, 0.8));
    });

    test('Quand ma position devient celle du second point, alors la page suit', async ({
        page,
        context,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);
        await ajouterUnPoint(page, 0.8, 0);
        await ajouterUnPoint(page, 0.2, 150);
        // La coordonnée exacte du second point est lue dans la liste de l'éditeur.
        const description = mesure(
            await page.locator('.description-point').nth(1).textContent(),
            'description du second point',
        );
        const correspondance = mesure(
            /— (-?[\d.]+), (-?[\d.]+)$/.exec(description),
            'coordonnées dans la description',
        );
        const latitude = mesure(correspondance[1], 'latitude du point');
        const longitude = mesure(correspondance[2], 'longitude du point');

        await page.getByRole('button', { name: 'Suivre' }).click();
        await attendreLeDefilement(page, await defilementAttendu(page, 0.8));

        await context.setGeolocation({
            latitude: Number.parseFloat(latitude),
            longitude: Number.parseFloat(longitude),
        });
        // Un vrai GPS pousse des fixes en continu ; le mock ne pousse qu'au
        // changement, et cette unique poussée peut tomber dans le throttle.
        // On rejoue donc le chemin « réveil du téléphone » (position immédiate,
        // hors throttle) jusqu'à ce que la page soit calée sur le second point.
        const attendu = await defilementAttendu(page, 0.2);
        await expect
            .poll(
                async () => {
                    await page.evaluate(() =>
                        document.dispatchEvent(new Event('visibilitychange')),
                    );
                    return Math.abs((await defilementCourant(page)) - attendu);
                },
                { timeout: 20_000 },
            )
            .toBeLessThan(15);

        // Le dernier fix vient d'arriver : l'état d'erreur est effacé.
        await expect(page.locator('#etat-suivi')).toHaveText('', { timeout: 10_000 });
    });
});
