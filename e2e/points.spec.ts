import { expect, test } from '@playwright/test';
import {
    choisirUneCoordonneeSurLaCarte,
    cliquerSurLImage,
    ouvrirUnTrajetAvecUnePage,
} from './aides';

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
