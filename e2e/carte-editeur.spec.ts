import { expect, test } from '@playwright/test';
import { ajouterUnPoint, mesure, ouvrirUnTrajetAvecUnePage } from './aides';

test.describe("Carte de l'éditeur (tous les points du trajet)", () => {
    test('Étant donné deux points, alors la carte intégrée montre deux marqueurs numérotés', async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);
        await ajouterUnPoint(page, 0.8, 0);
        await expect(page.locator('.description-point')).toHaveCount(1);
        await ajouterUnPoint(page, 0.2, 150);
        await expect(page.locator('.description-point')).toHaveCount(2);

        await expect(page.locator('#carte-points .marqueur-carte')).toHaveText(['1', '2']);
    });

    test('Étant donné un point, quand je fais glisser son marqueur sur la carte, alors sa coordonnée change', async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);
        await ajouterUnPoint(page, 0.5, 0);
        await expect(page.locator('.description-point')).toHaveCount(1);
        const avant = (await page.locator('.description-point').textContent()) ?? '';

        // L'ajout du point a fait défiler la page : ramener la carte à l'écran,
        // sinon le glisser viserait des coordonnées hors du viewport.
        await page.locator('#carte-points').scrollIntoViewIfNeeded();
        const marqueur = mesure(
            await page.locator('#carte-points .marqueur-carte').first().boundingBox(),
            'marqueur de la carte',
        );
        await page.mouse.move(marqueur.x + marqueur.width / 2, marqueur.y + marqueur.height / 2);
        await page.mouse.down();
        await page.mouse.move(
            marqueur.x + marqueur.width / 2 + 70,
            marqueur.y + marqueur.height / 2 + 45,
            { steps: 8 },
        );
        await page.mouse.up();

        // Assertion qui réessaie : la sauvegarde et le re-rendu sont asynchrones.
        await expect(page.locator('.description-point')).not.toHaveText(avant);
    });

    test('Étant donné l’éditeur, alors la carte est à côté des images sur grand écran et au-dessus sur mobile', async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);
        const carte = mesure(await page.locator('#carte-points').boundingBox(), 'carte intégrée');
        const pile = mesure(await page.locator('#pile-images').boundingBox(), 'pile d’images');

        if (mesure(page.viewportSize(), 'viewport').width >= 900) {
            // Côte à côte : la carte finit avant que les images commencent…
            expect(carte.x + carte.width).toBeLessThanOrEqual(pile.x + 1);
            // …et elles partagent la même rangée.
            expect(Math.abs(carte.y - pile.y)).toBeLessThan(carte.height);
        } else {
            // Empilés : la carte se termine au-dessus du début des images.
            expect(carte.y + carte.height).toBeLessThanOrEqual(pile.y + 1);
        }
    });
});
