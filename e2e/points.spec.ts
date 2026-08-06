import { expect, test } from '@playwright/test';
import {
    ajouterUnPoint,
    choisirUneCoordonneePourUnPoint,
    coordonneeDuPoint,
    clicDroitSurLImage,
    cliquerSurLImage,
    pngFile,
    requireDefined,
    ouvrirUnTrajetAvecUnePage,
} from './helpers';

test.describe('Géoréférencement des points', () => {
    test('Étant donné une image, quand j’ajoute un point (image puis carte), alors il apparaît en liste et en marqueur', async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);

        // Les trois étapes restent écrites ici : c'est ce test qui spécifie le
        // parcours d'ajout d'un point. Les autres passent par `ajouterUnPoint`.
        await page.locator('.action-bar').getByRole('button', { name: 'Ajouter un point' }).click();
        await cliquerSurLImage(page, 0.25);
        await choisirUneCoordonneePourUnPoint(page);

        await expect(page.locator('.point-description')).toHaveCount(1);
        await expect(page.locator('.point-description')).toHaveText(
            /^7[4-6] % du trajet · page 1$/,
        );
        // La coordonnée a quitté la phrase : elle vit en infobulle sur la ligne.
        await expect(page.locator('point-row')).toHaveAttribute(
            'title',
            /^Coordonnée : -?\d+\.\d{4}, -?\d+\.\d{4}$/,
        );
        await expect(page.locator('point-marker')).toHaveCount(1);
    });

    test('Étant donné un point, quand je le déplace sur l’image, alors sa hauteur change sans ouvrir la carte', async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);
        await ajouterUnPoint(page, 0.25);

        await page
            .locator('#points-list')
            .getByRole('button', { name: "Déplacer le point 1 sur l'image" })
            .click();
        await cliquerSurLImage(page, 0.75);

        await expect(page.locator('#screen-carte')).toBeHidden();
        await expect(page.locator('.point-description')).toHaveText(
            /^2[4-6] % du trajet · page 1$/,
        );
    });

    test('Étant donné un point, quand je le déplace sur l’image via le bouton flottant sur le marqueur, alors sa hauteur change sans remonter à la liste', async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);
        await ajouterUnPoint(page, 0.25);

        await page
            .locator('point-marker')
            .getByRole('button', { name: "Déplacer le point 1 sur l'image" })
            .click();
        await cliquerSurLImage(page, 0.75);

        await expect(page.locator('#screen-carte')).toBeHidden();
        await expect(page.locator('.point-description')).toHaveText(
            /^2[4-6] % du trajet · page 1$/,
        );
    });

    test('Étant donné un point, quand je le déplace sur la carte, alors sa coordonnée change', async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);
        await ajouterUnPoint(page, 0.25);
        const before = await coordonneeDuPoint(page);

        await page
            .locator('#points-list')
            .getByRole('button', { name: 'Déplacer le point 1 sur la carte' })
            .click();
        await choisirUneCoordonneePourUnPoint(page, 150);

        // Assertion qui réessaie : la sauvegarde et le re-rendu sont asynchrones.
        await expect(page.locator('point-row')).not.toHaveAttribute('title', before);
    });

    test('Étant donné un point, quand je le déplace sur la carte via le bouton flottant sur le marqueur, alors sa coordonnée change', async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);
        await ajouterUnPoint(page, 0.25);
        const before = await coordonneeDuPoint(page);

        await page
            .locator('point-marker')
            .getByRole('button', { name: 'Déplacer le point 1 sur la carte' })
            .click();
        await choisirUneCoordonneePourUnPoint(page, 150);

        await expect(page.locator('point-row')).not.toHaveAttribute('title', before);
    });

    test('Étant donné un point, quand je le supprime et confirme, alors liste et marqueur disparaissent', async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);
        await ajouterUnPoint(page, 0.25);

        page.once('dialog', (dialog) => void dialog.accept());
        await page
            .locator('#points-list')
            .getByRole('button', { name: 'Supprimer le point 1' })
            .click();

        await expect(page.locator('.point-description')).toHaveCount(0);
        await expect(page.locator('point-marker')).toHaveCount(0);
    });

    test('Étant donné un point, quand je le supprime via le bouton flottant sur le marqueur, alors liste et marqueur disparaissent sans point parasite ajouté', async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);
        await ajouterUnPoint(page, 0.25);

        page.once('dialog', (dialog) => void dialog.accept());
        await page
            .locator('point-marker')
            .getByRole('button', { name: 'Supprimer le point 1' })
            .click();

        // Le bouton flottant est posé sur la zone cliquable de l'image : sans
        // stopPropagation, ce clic remonterait et ajouterait un point parasite.
        await expect(page.locator('.point-description')).toHaveCount(0);
        await expect(page.locator('point-marker')).toHaveCount(0);
    });

    test('Étant donné une image, quand je fais un clic droit dessus, alors un point est ajouté directement à cet endroit puis la coordonnée se choisit sur la carte', async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);

        await clicDroitSurLImage(page, 0.6);
        await choisirUneCoordonneePourUnPoint(page);

        await expect(page.locator('.point-description')).toHaveCount(1);
        await expect(page.locator('.point-description')).toHaveText(
            /^(3[8-9]|4[0-2]) % du trajet · page 1$/,
        );
        await expect(page.locator('point-marker')).toHaveCount(1);
    });

    test('Étant donné un long défilement dans la page, quand j’ajoute un point via le bouton flottant, alors il reste accessible sans remonter en haut et le point est créé', async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);
        // Deux images de plus (donc trois au total) pour garantir un contenu
        // plus haut que le viewport, y compris sur les projets mobiles.
        await page
            .locator('#input-images')
            .setInputFiles([pngFile('page-2.png'), pngFile('page-3.png')]);
        // Le lot importé se pose sous les pages déjà présentes, dans l'ordre de
        // l'explorateur : le document se lit d'une traite, page-1 tout en haut.
        await expect(page.locator('.image-name')).toHaveText([
            'page-1.png',
            'page-2.png',
            'page-3.png',
        ]);

        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });
        const floatingButton = page.locator('#floating-add-point-button');
        await expect(floatingButton).toBeInViewport();

        await floatingButton.click();
        await cliquerSurLImage(page, 0.5);
        await choisirUneCoordonneePourUnPoint(page);

        await expect(page.locator('.point-description')).toHaveCount(1);
        await expect(page.locator('point-marker')).toHaveCount(1);
    });

    test('Étant donné un point loin dans la pile, quand je clique sa ligne, alors son repère vient à l’écran', async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);
        // Trois pages pour un document plus haut que le viewport, sur mobile aussi.
        await page
            .locator('#input-images')
            .setInputFiles([pngFile('page-2.png'), pngFile('page-3.png')]);
        await expect(page.locator('.image-name')).toHaveText([
            'page-1.png',
            'page-2.png',
            'page-3.png',
        ]);
        // Le point se pose sur la page du bas — la première du voyage, la plus
        // loin de la liste, qui est tout en haut de l'écran.
        await clicDroitSurLImage(page, 0.5, 2);
        await choisirUneCoordonneePourUnPoint(page);
        await expect(page.locator('.point-description')).toHaveText(
            /^1[6-8] % du trajet · page 3$/,
        );

        await page.evaluate(() => {
            window.scrollTo(0, 0);
        });
        const pastille = page.locator('#images-stack .point-number');
        await expect(pastille).not.toBeInViewport();

        await page.locator('.point-description').click();

        // Le défilement est fluide : l'assertion réessaie jusqu'à ce qu'il aboutisse.
        await expect(pastille).toBeInViewport();
    });

    test('Étant donné le choix sur carte, quand je saisis latitude et longitude à la main, alors le point est créé avec ces valeurs', async ({
        page,
    }) => {
        test.skip(
            requireDefined(page.viewportSize(), 'viewport').width >= 900,
            'La saisie manuelle lat/lon vit dans la carte plein écran : sur grand écran, la coordonnée se choisit directement sur la carte intégrée.',
        );
        await ouvrirUnTrajetAvecUnePage(page);
        await page.locator('.action-bar').getByRole('button', { name: 'Ajouter un point' }).click();
        await cliquerSurLImage(page, 0.5);
        await expect(page.locator('#screen-carte')).toBeVisible();

        await page.getByLabel('Latitude').fill('46.5802');
        await page.getByLabel('Longitude').fill('0.3404');
        await page.getByRole('button', { name: 'Placer' }).click();
        await page.getByRole('button', { name: 'Valider' }).click();

        await expect(page.locator('.point-description')).toHaveText(
            /^(49|50|51) % du trajet · page 1$/,
        );
        await expect(page.locator('point-row')).toHaveAttribute(
            'title',
            'Coordonnée : 46.5802, 0.3404',
        );
    });
});
