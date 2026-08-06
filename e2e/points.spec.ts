import { expect, test } from '@playwright/test';
import {
    ajouterUnPoint,
    hauteurDuRepere,
    choisirUneCoordonneePourUnPoint,
    coordonneeDuPoint,
    clicDroitSurLImage,
    cliquerSurLImage,
    mesuresDuRepere,
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

        await expect(page.locator('point-marker')).toHaveCount(1);
        // Le point est posé là où on a cliqué : ça se mesure sur son repère,
        // là où il est, plutôt que dans une phrase à côté.
        await expect.poll(() => hauteurDuRepere(page)).toBeGreaterThanOrEqual(24);
        expect(await hauteurDuRepere(page)).toBeLessThanOrEqual(26);
        // La coordonnée, elle, se lit en infobulle sur le repère.
        await expect(page.locator('point-marker')).toHaveAttribute(
            'title',
            /^Coordonnée : -?\d+\.\d{4}, -?\d+\.\d{4}$/,
        );
        await expect(page.locator('point-marker')).toHaveCount(1);
    });

    test('Étant donné un point posé sur l’image, alors son numéro porte le symbole de la carte, centré sur son trait', async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);
        await ajouterUnPoint(page, 0.5);
        await expect(page.locator('#carte-points .carte-marker')).toHaveText(['1']);

        const repere = await mesuresDuRepere(page);

        // Un seul symbole pour un même point : l'œil qui passe du schéma à la
        // carte doit y reconnaître la même pastille, pas une cousine. La taille
        // n'est écrite qu'une fois (`--point-badge-size`) — c'est ce que mesure
        // cette égalité, y compris pour la carte, dont `numberedIcon` ne dit plus
        // ni la taille ni l'ancre.
        expect(repere.pastille.width).toBe(repere.pastilleDeLaCarte.width);
        expect(repere.pastille.height).toBe(repere.pastilleDeLaCarte.height);
        // Centrée sur son trait : posée à côté, elle se lit comme le numéro du
        // trait voisin. Un pixel de tolérance pour l'arrondi du rendu.
        expect(Math.abs(repere.pastille.milieu - repere.trait.milieu)).toBeLessThanOrEqual(1);
    });

    test('Étant donné un point posé sur l’image, alors ses boutons se tiennent au-dessus du trait, sans couvrir ce qu’il désigne', async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);
        await ajouterUnPoint(page, 0.5);
        await expect(page.locator('point-marker')).toHaveCount(1);

        const repere = await mesuresDuRepere(page);

        // À cheval sur le trait, leur moitié basse couvrait la cote que le trait
        // désigne — exactement ce qu'on venait lire.
        expect(repere.boutons.bottom).toBeLessThanOrEqual(repere.trait.top);
        // Et jamais plus petits que le numéro dont ils portent les actions : sous
        // le pouce, ces boutons-là se manquaient.
        expect(repere.boutons.height).toBeGreaterThanOrEqual(repere.pastille.height);
    });

    test('Étant donné un point, quand je le déplace sur l’image, alors sa hauteur change sans ouvrir la carte', async ({
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
        await expect.poll(() => hauteurDuRepere(page)).toBeGreaterThanOrEqual(74);
        expect(await hauteurDuRepere(page)).toBeLessThanOrEqual(76);
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
        await expect.poll(() => hauteurDuRepere(page)).toBeGreaterThanOrEqual(74);
        expect(await hauteurDuRepere(page)).toBeLessThanOrEqual(76);
    });

    test('Étant donné un point, quand je le déplace sur la carte, alors sa coordonnée change', async ({
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

        // Assertion qui réessaie : la sauvegarde et le re-rendu sont asynchrones.
        await expect(page.locator('point-marker').first()).not.toHaveAttribute('title', before);
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

        await expect(page.locator('point-marker').first()).not.toHaveAttribute('title', before);
    });

    test('Étant donné un point, quand je le supprime et confirme, alors liste et marqueur disparaissent', async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);
        await ajouterUnPoint(page, 0.25);

        page.once('dialog', (dialog) => void dialog.accept());
        await page
            .locator('point-marker')
            .getByRole('button', { name: 'Supprimer le point 1' })
            .click();

        await expect(page.locator('point-marker')).toHaveCount(0);
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
        await expect(page.locator('point-marker')).toHaveCount(0);
        await expect(page.locator('point-marker')).toHaveCount(0);
    });

    test('Étant donné une image, quand je fais un clic droit dessus, alors un point est ajouté directement à cet endroit puis la coordonnée se choisit sur la carte', async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);

        await clicDroitSurLImage(page, 0.6);
        await choisirUneCoordonneePourUnPoint(page);

        await expect(page.locator('point-marker')).toHaveCount(1);
        await expect.poll(() => hauteurDuRepere(page)).toBeGreaterThanOrEqual(58);
        expect(await hauteurDuRepere(page)).toBeLessThanOrEqual(62);
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

        await expect(page.locator('point-marker')).toHaveCount(1);
        await expect(page.locator('point-marker')).toHaveCount(1);
    });

    test('Étant donné un point loin dans la pile, quand je le désigne sur la carte, alors son repère vient à l’écran', async ({
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
        // loin du haut de l'écran.
        await clicDroitSurLImage(page, 0.5, 2);
        await choisirUneCoordonneePourUnPoint(page);
        await expect(page.locator('point-marker')).toHaveCount(1);

        await page.evaluate(() => {
            window.scrollTo(0, 0);
        });
        const pastille = page.locator('#images-stack .point-number');
        await expect(pastille).not.toBeInViewport();

        await page.locator('#carte-points .carte-marker').first().click();

        // Le défilement est fluide : l'assertion réessaie jusqu'à ce qu'il aboutisse.
        await expect(pastille).toBeInViewport();
    });

    test('Étant donné un petit écran, quand je bascule sur la carte, alors elle couvre le schéma et un point désigné l’en retire', async ({
        page,
    }) => {
        test.skip(
            requireDefined(page.viewportSize(), 'viewport').width >= 900,
            'Au-dessus de 900 px la carte est déjà à côté de la pile : rien à aiguiller.',
        );
        await ouvrirUnTrajetAvecUnePage(page);
        // Deux pages de plus : sans un document plus haut que l'écran, la carte
        // resterait visible en bas de page et la bascule ne prouverait rien.
        await page
            .locator('#input-images')
            .setInputFiles([pngFile('page-2.png'), pngFile('page-3.png')]);
        await expect(page.locator('.image-name')).toHaveCount(3);
        await ajouterUnPoint(page, 0.8, 0);
        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });
        const carte = page.locator('#carte-points');
        await expect(carte).not.toBeInViewport();

        await page.getByRole('button', { name: '🗺️ Carte' }).click();

        // Par-dessus le schéma, quel que soit le défilement.
        await expect(carte).toBeInViewport({ ratio: 0.9 });

        await page.locator('#carte-points .carte-marker').first().click();

        // Elle se retire d'elle-même : la garder ouverte cacherait ce qu'on vient
        // de demander à voir.
        await expect(carte).not.toBeInViewport();
        await expect(page.locator('#images-stack .point-number')).toBeInViewport();
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

        await expect(page.locator('point-marker')).toHaveAttribute(
            'title',
            'Coordonnée : 46.5802, 0.3404',
        );
    });
});
