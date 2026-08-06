import { expect, test } from '@playwright/test';
import {
    ajouterUnPoint,
    coordonneeDuPoint,
    requireDefined,
    ouvrirUnTrajetAvecUnePage,
} from './helpers';

test.describe("Carte de l'éditeur (tous les points du trajet)", () => {
    test('Étant donné deux points, alors la carte intégrée montre deux marqueurs numérotés', async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);
        await ajouterUnPoint(page, 0.8, 0);
        await expect(page.locator('point-marker')).toHaveCount(1);
        await ajouterUnPoint(page, 0.2, 150);
        await expect(page.locator('point-marker')).toHaveCount(2);

        await expect(page.locator('#carte-points .carte-marker')).toHaveText(['1', '2']);
    });

    test('Étant donné un point, quand je fais glisser son marqueur sur la carte, alors sa coordonnée change', async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);
        await ajouterUnPoint(page, 0.5, 0);
        await expect(page.locator('point-marker')).toHaveCount(1);
        const before = await coordonneeDuPoint(page);

        // L'ajout du point a fait défiler la page : ramener la carte à l'écran,
        // sinon le glisser viserait des coordonnées hors du viewport.
        await page.locator('#carte-points').scrollIntoViewIfNeeded();
        const marker = requireDefined(
            await page.locator('#carte-points .carte-marker').first().boundingBox(),
            'marqueur de la carte',
        );
        await page.mouse.move(marker.x + marker.width / 2, marker.y + marker.height / 2);
        await page.mouse.down();
        await page.mouse.move(marker.x + marker.width / 2 + 70, marker.y + marker.height / 2 + 45, {
            steps: 8,
        });
        await page.mouse.up();

        // Assertion qui réessaie : la sauvegarde et le re-rendu sont asynchrones.
        await expect(page.locator('point-marker').first()).not.toHaveAttribute('title', before);
    });

    test('Étant donné un aller-retour par le suivi, quand je rouvre l’éditeur, alors sa carte est toujours vivante', async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);
        await ajouterUnPoint(page, 0.8, 0);
        await ajouterUnPoint(page, 0.2, 150);
        await expect(page.locator('#carte-points .carte-marker')).toHaveText(['1', '2']);

        await page.getByRole('button', { name: 'Suivre' }).click();
        await expect(page.locator('suivi-screen')).toBeVisible();
        await page.getByRole('button', { name: 'Éditer' }).click();

        // L'écran d'édition est reconstruit à chaque ouverture, donc son
        // conteneur de carte est un élément neuf : une carte mémorisée d'une
        // visite à l'autre resterait accrochée au conteneur précédent, et
        // celui-ci serait vide.
        await expect(page.locator('#carte-points .carte-marker')).toHaveText(['1', '2']);
    });

    test('Étant donné l’éditeur, alors la carte est à côté des images sur grand écran et au-dessus sur mobile', async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);
        const carte = requireDefined(
            await page.locator('#carte-points').boundingBox(),
            'carte intégrée',
        );
        const stack = requireDefined(
            await page.locator('#images-stack').boundingBox(),
            'pile d’images',
        );

        if (requireDefined(page.viewportSize(), 'viewport').width >= 900) {
            // Côte à côte : la carte finit avant que les images commencent…
            expect(carte.x + carte.width).toBeLessThanOrEqual(stack.x + 1);
            // …et elles partagent la même rangée.
            expect(Math.abs(carte.y - stack.y)).toBeLessThan(carte.height);
        } else {
            // Empilés : la carte se termine au-dessus du début des images.
            expect(carte.y + carte.height).toBeLessThanOrEqual(stack.y + 1);
        }
    });
});
