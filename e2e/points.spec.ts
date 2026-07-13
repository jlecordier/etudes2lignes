import { expect, test } from '@playwright/test';
import {
    choisirUneCoordonneePourUnPoint,
    clicDroitSurLImage,
    cliquerSurLImage,
    fichierPng,
    ouvrirUnTrajetAvecUnePage,
} from './aides';

test.describe('Géoréférencement des points', () => {
    test('Étant donné une image, quand j’ajoute un point (image puis carte), alors il apparaît en liste et en marqueur', async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);

        await page
            .locator('.barre-actions')
            .getByRole('button', { name: 'Ajouter un point' })
            .click();
        await cliquerSurLImage(page, 0.25);
        await choisirUneCoordonneePourUnPoint(page);

        await expect(page.locator('.description-point')).toHaveCount(1);
        await expect(page.locator('.description-point')).toHaveText(
            /^Point 1 — page-1\.png à 2[4-6] % — -?\d+\.\d{4}, -?\d+\.\d{4}$/,
        );
        await expect(page.locator('.marqueur-point')).toHaveCount(1);
    });

    test('Étant donné un point, quand je le déplace sur l’image, alors sa hauteur change sans ouvrir la carte', async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);
        await page
            .locator('.barre-actions')
            .getByRole('button', { name: 'Ajouter un point' })
            .click();
        await cliquerSurLImage(page, 0.25);
        await choisirUneCoordonneePourUnPoint(page);

        await page
            .locator('#liste-points')
            .getByRole('button', { name: "Déplacer le point 1 sur l'image" })
            .click();
        await cliquerSurLImage(page, 0.75);

        await expect(page.locator('#ecran-carte')).toBeHidden();
        await expect(page.locator('.description-point')).toHaveText(
            /^Point 1 — page-1\.png à 7[4-6] % — -?\d+\.\d{4}, -?\d+\.\d{4}$/,
        );
    });

    test('Étant donné un point, quand je le déplace sur l’image via le bouton flottant sur le marqueur, alors sa hauteur change sans remonter à la liste', async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);
        await page
            .locator('.barre-actions')
            .getByRole('button', { name: 'Ajouter un point' })
            .click();
        await cliquerSurLImage(page, 0.25);
        await choisirUneCoordonneePourUnPoint(page);

        await page
            .locator('.marqueur-point')
            .getByRole('button', { name: "Déplacer le point 1 sur l'image" })
            .click();
        await cliquerSurLImage(page, 0.75);

        await expect(page.locator('#ecran-carte')).toBeHidden();
        await expect(page.locator('.description-point')).toHaveText(
            /^Point 1 — page-1\.png à 7[4-6] % — -?\d+\.\d{4}, -?\d+\.\d{4}$/,
        );
    });

    test('Étant donné un point, quand je le déplace sur la carte, alors sa coordonnée change', async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);
        await page
            .locator('.barre-actions')
            .getByRole('button', { name: 'Ajouter un point' })
            .click();
        await cliquerSurLImage(page, 0.25);
        await choisirUneCoordonneePourUnPoint(page);
        const avant = (await page.locator('.description-point').textContent()) ?? '';

        await page
            .locator('#liste-points')
            .getByRole('button', { name: 'Déplacer le point 1 sur la carte' })
            .click();
        await choisirUneCoordonneePourUnPoint(page, 150);

        // Assertion qui réessaie : la sauvegarde et le re-rendu sont asynchrones.
        await expect(page.locator('.description-point')).not.toHaveText(avant);
    });

    test('Étant donné un point, quand je le déplace sur la carte via le bouton flottant sur le marqueur, alors sa coordonnée change', async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);
        await page
            .locator('.barre-actions')
            .getByRole('button', { name: 'Ajouter un point' })
            .click();
        await cliquerSurLImage(page, 0.25);
        await choisirUneCoordonneePourUnPoint(page);
        const avant = (await page.locator('.description-point').textContent()) ?? '';

        await page
            .locator('.marqueur-point')
            .getByRole('button', { name: 'Déplacer le point 1 sur la carte' })
            .click();
        await choisirUneCoordonneePourUnPoint(page, 150);

        await expect(page.locator('.description-point')).not.toHaveText(avant);
    });

    test('Étant donné un point, quand je le supprime et confirme, alors liste et marqueur disparaissent', async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);
        await page
            .locator('.barre-actions')
            .getByRole('button', { name: 'Ajouter un point' })
            .click();
        await cliquerSurLImage(page, 0.25);
        await choisirUneCoordonneePourUnPoint(page);

        page.once('dialog', (dialogue) => void dialogue.accept());
        await page
            .locator('#liste-points')
            .getByRole('button', { name: 'Supprimer le point 1' })
            .click();

        await expect(page.locator('.description-point')).toHaveCount(0);
        await expect(page.locator('.marqueur-point')).toHaveCount(0);
    });

    test('Étant donné un point, quand je le supprime via le bouton flottant sur le marqueur, alors liste et marqueur disparaissent sans point parasite ajouté', async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);
        await page
            .locator('.barre-actions')
            .getByRole('button', { name: 'Ajouter un point' })
            .click();
        await cliquerSurLImage(page, 0.25);
        await choisirUneCoordonneePourUnPoint(page);

        page.once('dialog', (dialogue) => void dialogue.accept());
        await page
            .locator('.marqueur-point')
            .getByRole('button', { name: 'Supprimer le point 1' })
            .click();

        // Le bouton flottant est posé sur la zone cliquable de l'image : sans
        // stopPropagation, ce clic remonterait et ajouterait un point parasite.
        await expect(page.locator('.description-point')).toHaveCount(0);
        await expect(page.locator('.marqueur-point')).toHaveCount(0);
    });

    test('Étant donné une image, quand je fais un clic droit dessus, alors un point est ajouté directement à cet endroit puis la coordonnée se choisit sur la carte', async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);

        await clicDroitSurLImage(page, 0.6);
        await choisirUneCoordonneePourUnPoint(page);

        await expect(page.locator('.description-point')).toHaveCount(1);
        await expect(page.locator('.description-point')).toHaveText(
            /^Point 1 — page-1\.png à (5[8-9]|6[0-2]) % — -?\d+\.\d{4}, -?\d+\.\d{4}$/,
        );
        await expect(page.locator('.marqueur-point')).toHaveCount(1);
    });

    test('Étant donné un long défilement dans la page, quand j’ajoute un point via le bouton flottant, alors il reste accessible sans remonter en haut et le point est créé', async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);
        // Deux images de plus (donc trois au total) pour garantir un contenu
        // plus haut que le viewport, y compris sur les projets mobiles.
        await page
            .locator('#input-images')
            .setInputFiles([fichierPng('page-2.png'), fichierPng('page-3.png')]);
        // La pile s'affiche comme le document se lit (de bas en haut) : la
        // première page du voyage tout en bas, la dernière tout en haut.
        await expect(page.locator('.nom-image')).toHaveText([
            'page-3.png',
            'page-2.png',
            'page-1.png',
        ]);

        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        const boutonFlottant = page.locator('#bouton-ajouter-point-flottant');
        await expect(boutonFlottant).toBeInViewport();

        await boutonFlottant.click();
        await cliquerSurLImage(page, 0.5);
        await choisirUneCoordonneePourUnPoint(page);

        await expect(page.locator('.description-point')).toHaveCount(1);
        await expect(page.locator('.marqueur-point')).toHaveCount(1);
    });

    test('Étant donné le choix sur carte, quand je saisis latitude et longitude à la main, alors le point est créé avec ces valeurs', async ({
        page,
    }) => {
        test.skip(
            page.viewportSize()!.width >= 900,
            'La saisie manuelle lat/lon vit dans la carte plein écran : sur grand écran, la coordonnée se choisit directement sur la carte intégrée.',
        );
        await ouvrirUnTrajetAvecUnePage(page);
        await page
            .locator('.barre-actions')
            .getByRole('button', { name: 'Ajouter un point' })
            .click();
        await cliquerSurLImage(page, 0.5);
        await expect(page.locator('#ecran-carte')).toBeVisible();

        await page.getByLabel('Latitude').fill('46.5802');
        await page.getByLabel('Longitude').fill('0.3404');
        await page.getByRole('button', { name: 'Placer' }).click();
        await page.getByRole('button', { name: 'Valider' }).click();

        await expect(page.locator('.description-point')).toHaveText(
            /^Point 1 — page-1\.png à (49|50|51) % — 46\.5802, 0\.3404$/,
        );
    });
});
