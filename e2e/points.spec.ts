import { expect, test } from '@playwright/test';
import {
    ajouterUnPoint,
    hauteurDuRepere,
    choisirUneCoordonneePourUnPoint,
    coordonneeDuPoint,
    clicDroitSurLImage,
    cliquerSurLImage,
    ecartAuCentreDeLaCarte,
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
        // La coordonnée, elle, reste portée par le repère — sans s'afficher.
        await expect(page.locator('point-marker')).toHaveAttribute(
            'data-coordonnee',
            /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/,
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
        await expect(page.locator('point-marker').first()).not.toHaveAttribute(
            'data-coordonnee',
            before,
        );
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

        await expect(page.locator('point-marker').first()).not.toHaveAttribute(
            'data-coordonnee',
            before,
        );
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
            'data-coordonnee',
            '46.5802,0.3404',
        );
    });

    test('Étant donné un point posé sur le schéma, quand je clique sa pastille, alors la carte se cale sur lui', async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);
        // Deux points, et c'est essentiel : avec un seul, la carte se serait
        // déjà cadrée dessus toute seule et le geste ne prouverait rien. À deux,
        // le cadrage d'ensemble les met de part et d'autre du centre.
        await ajouterUnPoint(page, 0.8, 0);
        await ajouterUnPoint(page, 0.2, 150);
        // Les deux marqueurs existent avant de lire l'écart : sans ce compte,
        // un marqueur manquant ferait passer la pré-assertion pour la
        // mauvaise raison — `ecartAuCentreDeLaCarte` rend l'infini quand elle
        // ne trouve rien, ce qui satisfait aussi `toBeGreaterThan`.
        await expect(page.locator('#carte-points .carte-marker')).toHaveCount(2);
        // Le document se lit de bas en haut : le point le plus bas sur la page
        // ouvre le voyage, c'est donc lui le numéro 1.
        await expect.poll(() => ecartAuCentreDeLaCarte(page, '1')).toBeGreaterThan(10);

        await page.getByRole('button', { name: 'Voir le point 1 sur la carte' }).click();

        // « Zéro quand la carte est calée sur ce point » : quelques pixels de
        // tolérance pour l'arrondi au pixel des marqueurs Leaflet. La pastille
        // en fait 26 : à 4 px, elle couvre toujours le centre.
        await expect.poll(() => ecartAuCentreDeLaCarte(page, '1')).toBeLessThanOrEqual(4);
    });

    test('Étant donné un petit écran où la carte est repliée, quand je clique la pastille d’un point, alors la carte vient par-dessus le schéma', async ({
        page,
    }) => {
        test.skip(
            requireDefined(page.viewportSize(), 'viewport').width >= 900,
            'Au-dessus de 900 px la carte est déjà à côté de la pile : rien à mettre par-dessus.',
        );
        await ouvrirUnTrajetAvecUnePage(page);
        // Deux pages de plus : sans un document plus haut que l'écran, la carte
        // resterait visible et le geste ne prouverait rien.
        await page
            .locator('#input-images')
            .setInputFiles([pngFile('page-2.png'), pngFile('page-3.png')]);
        await expect(page.locator('.image-name')).toHaveCount(3);
        // Le point se pose sur la page du bas — la plus loin de la carte, qui
        // est tout en haut : le repère est à l'écran, la carte non.
        await clicDroitSurLImage(page, 0.5, 2);
        await choisirUneCoordonneePourUnPoint(page);
        await expect(page.locator('point-marker')).toHaveCount(1);
        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });
        const carte = page.locator('#carte-points');
        await expect(carte).not.toBeInViewport();

        await page.getByRole('button', { name: 'Voir le point 1 sur la carte' }).click();

        // Par-dessus le schéma, quel que soit le défilement. Le centrage, lui,
        // est prouvé par le scénario précédent : avec un seul point, la carte
        // s'était déjà cadrée dessus et l'assertion ne dirait rien.
        await expect(carte).toBeInViewport({ ratio: 0.9 });
    });

    test('Étant donné un grand écran où la carte est déjà à côté de la pile, quand je clique la pastille d’un point, alors elle reste à sa place sans jamais couvrir le schéma', async ({
        page,
    }) => {
        test.skip(
            requireDefined(page.viewportSize(), 'viewport').width < 900,
            'Sous 900 px la carte est repliée : c’est le scénario précédent qui la met par-dessus le schéma.',
        );
        await ouvrirUnTrajetAvecUnePage(page);
        await ajouterUnPoint(page, 0.5, 0);
        const carte = page.locator('#carte-points');
        const avant = requireDefined(await carte.boundingBox(), 'cadre de la carte avant le clic');

        await page.getByRole('button', { name: 'Voir le point 1 sur la carte' }).click();

        // Poser `carte-ouverte` ici la mettrait en plein écran — sa règle
        // l'emporte en spécificité sur celle du grand écran, qui l'épingle à
        // côté de la pile. Le cadre inchangé dit qu'elle y est restée ; le
        // recentrage lui-même est déjà prouvé, sur ce même écran, par le
        // scénario « la carte se cale sur lui » plus haut.
        const apres = requireDefined(await carte.boundingBox(), 'cadre de la carte après le clic');
        expect(apres).toEqual(avant);
    });

    test('Étant donné un placement en cours, quand je clique la pastille d’un point déjà posé, alors un point s’y pose au lieu de partir à la carte', async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);
        await ajouterUnPoint(page, 0.5, 0);

        // La cible est la pastille elle-même, pas le centre de l'image : le
        // trait du repère est inerte au clic en permanence
        // (`pointer-events: none` sur `point-marker`), seule la pastille l'est
        // *pendant un placement*. C'est donc elle qu'il faut viser pour que le
        // clic mette réellement le garde à l'épreuve.
        await page.locator('.action-bar').getByRole('button', { name: 'Ajouter un point' }).click();
        const pastilleDuPoint1 = page.locator('point-marker .point-number');
        await pastilleDuPoint1.scrollIntoViewIfNeeded();
        const pastille = requireDefined(
            await pastilleDuPoint1.boundingBox(),
            'pastille du point 1',
        );
        await page.mouse.click(pastille.x + pastille.width / 2, pastille.y + pastille.height / 2);
        await choisirUneCoordonneePourUnPoint(page, 150);

        // Le clic visé sur la pastille a traversé jusqu'à l'image plutôt que de
        // caler la carte sur le point existant : un second marqueur est né.
        await expect(page.locator('point-marker')).toHaveCount(2);
    });

    test('Étant donné un point sur le schéma, quand je glisse sa pastille, alors il change de hauteur', async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);
        await ajouterUnPoint(page, 0.3, 0);

        const pastille = requireDefined(
            await page.locator('point-marker .point-number').boundingBox(),
            'pastille du point 1',
        );
        const zone = requireDefined(
            await page.locator('.image-area').boundingBox(),
            'cadre de la page',
        );
        await page.mouse.move(pastille.x + pastille.width / 2, pastille.y + pastille.height / 2);
        await page.mouse.down();
        // Vers 60 % de la page, en plusieurs pas : un saut unique n'émet qu'un
        // `pointermove`, et le geste doit tenir sur un vrai mouvement.
        await page.mouse.move(pastille.x + pastille.width / 2, zone.y + zone.height * 0.6, {
            steps: 10,
        });
        await page.mouse.up();

        // Fenêtre 58–62, comme le clic droit à la même fraction plus haut dans
        // ce fichier : assez large pour l'arrondi pixel de `hauteurDuRepere`
        // (et pour la lecture prise pendant qu'un rendu est encore en cours),
        // assez étroite pour rater un point resté proche de son départ (30) ou
        // parti bien au-delà de sa cible.
        //
        // Les deux bornes dans le même `poll`, sur une lecture fraîche à chaque
        // essai : une bascule sur une lecture non réessayée laisserait passer
        // un `-1` (cadres pas encore montés, voir `hauteurDuRepere`) — `-1` ne
        // satisfait pas la borne basse, mais satisferait la haute toute seule.
        await expect
            .poll(async () => {
                const hauteur = await hauteurDuRepere(page);
                return hauteur >= 58 && hauteur <= 62;
            })
            .toBe(true);
    });

    test('Étant donné un glisser achevé, alors le clic qui le suit n’emmène pas à la carte', async ({
        page,
    }) => {
        test.skip(
            requireDefined(page.viewportSize(), 'viewport').width >= 900,
            'Au-dessus de 900 px la carte est déjà à côté de la pile : son ouverture ne prouverait rien.',
        );
        await ouvrirUnTrajetAvecUnePage(page);
        await ajouterUnPoint(page, 0.3, 0);
        // Lecture réessayée avant de la garder comme référence : `ajouterUnPoint`
        // ne garantit pas que le repère est déjà rendu (voir la doc de
        // `hauteurDuRepere`, e2e/helpers.ts) — une valeur prise trop tôt
        // pourrait rendre -1, et la comparaison plus bas serait satisfaite par
        // n'importe quelle hauteur, y compris celle d'un point qui n'a pas bougé.
        await expect.poll(() => hauteurDuRepere(page)).toBeGreaterThanOrEqual(0);
        const avant = await hauteurDuRepere(page);

        const pastille = requireDefined(
            await page.locator('point-marker .point-number').boundingBox(),
            'pastille du point 1',
        );
        await page.mouse.move(pastille.x + pastille.width / 2, pastille.y + pastille.height / 2);
        await page.mouse.down();
        await page.mouse.move(pastille.x + pastille.width / 2, pastille.y + 80, { steps: 10 });
        await page.mouse.up();

        // Le geste a bien déplacé le point : sans ce témoin, tout ce qui
        // avorterait le glisser avant le clic de compatibilité (un
        // `pointercancel`, par exemple) laisserait passer l'assertion
        // suivante pour la mauvaise raison — un geste mort n'avale aucun clic
        // non plus, faute d'en avoir émis un à avaler.
        await expect.poll(() => hauteurDuRepere(page)).toBeGreaterThan(avant);

        // Si le clic passait, la carte viendrait par-dessus le schéma.
        await expect(page.locator('trajet-editor-screen')).not.toHaveClass(/carte-ouverte/);
    });
});
