import { expect, test, type Page } from '@playwright/test';
import {
    ajouterUnPoint,
    ouvrirUnTrajetAvecUnePage,
    preparerLApplication,
    requireDefined,
} from './helpers';

/** Les largeurs qui comptent : le plus petit iPhone courant, le courant, et un
 *  grand. C'est à 360 px que les deux défauts de septembre se voyaient. */
const LARGEURS = [360, 390, 430];

async function hauteurDeLaBarre(page: Page): Promise<number> {
    const boite = await page.locator('.header, .suivi-bar').first().boundingBox();
    return Math.round(requireDefined(boite, 'barre').height);
}

test.describe('La géométrie du système', () => {
    test.describe('La hauteur de la barre', () => {
        // `.suivi-bar` affiche son état dans un texte (`#suivi-status`) que
        // `.header` n'a pas, et elle porte `flex-wrap: wrap` là où `.header`
        // ne le porte jamais (voir le commentaire sur `.header` dans
        // legacy.css). Sans géolocalisation mockée, le texte affiché varie
        // d'une exécution à l'autre — vide, « Accès à la position refusé… »,
        // selon le moment où l'API résout — et sa longueur décide parfois la
        // barre à passer sur deux lignes (71 px, mesuré). Géolocalisation
        // accordée et pilotée, comme `gps.spec.ts` le fait déjà pour les mêmes
        // deux points : le texte se stabilise sur le court « En attente du
        // signal GPS… », et c'est cet état normal que la mesure du 3
        // septembre décrivait.
        test.use({
            geolocation: { latitude: 46.6042, longitude: 2.395 },
            permissions: ['geolocation'],
        });

        test('Étant donné les trois écrans, quand je mesure leur barre, alors elle a partout la même hauteur', async ({
            page,
        }) => {
            await preparerLApplication(page);
            await ouvrirUnTrajetAvecUnePage(page);
            await ajouterUnPoint(page, 0.8, 0);
            await ajouterUnPoint(page, 0.2, 150);

            const hauteurs: Record<string, number> = {};
            for (const largeur of LARGEURS) {
                await page.setViewportSize({ width: largeur, height: 780 });
                hauteurs[`editeur-${largeur}`] = await hauteurDeLaBarre(page);

                await page.getByRole('button', { name: 'Trajets' }).click();
                hauteurs[`liste-${largeur}`] = await hauteurDeLaBarre(page);

                await page.locator('.trajet-name').first().click();
                await page.locator('#suivre-button').click();
                await expect(page.locator('suivi-screen')).toBeVisible();
                hauteurs[`suivi-${largeur}`] = await hauteurDeLaBarre(page);

                await page.getByRole('button', { name: 'Éditer' }).click();
            }

            // Mesuré le 3 septembre : l'en-tête faisait 44 px et la barre de suivi
            // 62, parce que chacune écrivait son rembourrage de son côté. Une seule
            // valeur distincte, où la dérive est revenue.
            expect([...new Set(Object.values(hauteurs))]).toHaveLength(1);
        });
    });

    test("Étant donné les contrôles de l'application, dont ceux d'un point posé, quand je mesure leur cible, alors aucun n'est sous 44 px", async ({
        page,
    }) => {
        await preparerLApplication(page);
        await ouvrirUnTrajetAvecUnePage(page);
        // Un point posé fait apparaître ses boutons flottants (« Déplacer sur
        // l'image », « Déplacer sur la carte », « Supprimer ») : sans lui, ce
        // témoin ne les voit jamais, et un remaniement qui les ferait rétrécir
        // sous 44 px passerait sans bruit — le filet aurait un trou à
        // l'endroit précis où on croit qu'il couvre.
        await ajouterUnPoint(page, 0.5, 0);
        await page.setViewportSize({ width: 360, height: 780 });

        const trop_petits: string[] = [];
        // Deux régimes exclus, et c'est motivé pour chacun. Les contrôles de
        // carte : voir le test suivant, qui leur applique le plancher que la
        // HIG leur laisse — 28 px, distinct du 44 px de l'application. La
        // pastille numérotée (`.point-number`) : c'est aussi un `<button>`,
        // mais son `min-inline-size` est neutralisé à 0 dans legacy.css — la
        // seule fois de la feuille — pour qu'elle garde le même dessin que sa
        // jumelle de la carte, un `div` hors de portée de cette règle ; le
        // témoin qui compare les deux tailles est le suivant après celui de
        // carte, pas celui-ci.
        for (const cible of await page.locator('button:visible').all()) {
            const exclu = await cible.evaluate(
                (n) =>
                    n.closest('.leaflet-control') !== null || n.classList.contains('point-number'),
            );
            if (exclu) {
                continue;
            }
            const boite = requireDefined(await cible.boundingBox(), 'cible');
            // Arrondi avant de comparer, pas seulement avant d'afficher : Firefox
            // rend certains de ces boutons à 43,999998 px (mesuré) une fois un
            // point posé ailleurs sur l'écran — un résidu de sous-pixel, pas un
            // écart de conception. Comparer la valeur brute aurait dénoncé une
            // capsule de 44 px pour une raison étrangère à sa géométrie.
            const largeur = Math.round(boite.width);
            const hauteur = Math.round(boite.height);
            if (largeur < 44 || hauteur < 44) {
                const nom = (await cible.getAttribute('aria-label')) ?? '';
                trop_petits.push(`${nom} ${largeur}x${hauteur}`);
            }
        }

        // « The minimum tappable area for any control is 44x44 pt. »
        expect(trop_petits).toEqual([]);
    });

    test('Étant donné les contrôles de carte, quand je mesure le groupe, alors lui seul porte le matériau', async ({
        page,
    }) => {
        await preparerLApplication(page);
        await ouvrirUnTrajetAvecUnePage(page);

        const groupe = page.locator('.leaflet-bar').first();
        const mesures = await groupe.evaluate((n) => {
            const style = getComputedStyle(n);
            const enfant = n.querySelector('a');
            const styleEnfant = enfant === null ? null : getComputedStyle(enfant);
            return {
                rayonDuGroupe: style.borderRadius,
                decoupe: style.overflow,
                rayonDeLEnfant: styleEnfant?.borderRadius ?? '',
                fondDeLEnfant: styleEnfant?.backgroundColor ?? '',
            };
        });
        const boite = requireDefined(
            await groupe.locator('a').first().boundingBox(),
            'enfant du groupe',
        );

        // « Group related controls and apply Liquid Glass to the group rather
        // than to each control. » Le groupe porte le rayon et découpe ; les
        // enfants n'ont ni rayon ni fond, sans quoi ce serait du verre sur du
        // verre.
        expect(mesures.rayonDuGroupe).not.toBe('0px');
        expect(mesures.decoupe).toBe('hidden');
        expect(mesures.rayonDeLEnfant).toBe('0px');
        expect(mesures.fondDeLEnfant).toBe('rgba(0, 0, 0, 0)');
        // Le plancher absolu de la HIG — 28 px, le second régime — et non les
        // 44 px de l'application : une colonne de contrôles à 44 px mangerait
        // la vignette de carte qu'elle recouvre.
        expect(boite.height).toBeGreaterThanOrEqual(28);
    });

    test('Étant donné une surface en verre, quand je cherche ses ancêtres, alors aucune ne flotte sur une autre', async ({
        page,
    }) => {
        await preparerLApplication(page);
        await ouvrirUnTrajetAvecUnePage(page);

        const empilements = await page.evaluate(() => {
            const flou = (n: Element): boolean => {
                const style = getComputedStyle(n);
                // `getPropertyValue` plutôt que l'accesseur camelCase : celui
                // du préfixe WebKit n'est pas dans les types DOM standard, et
                // un `as` pour l'atteindre serait le cast que l'ADR 0002 interdit.
                const valeur = `${style.getPropertyValue('backdrop-filter')} ${style.getPropertyValue('-webkit-backdrop-filter')}`;
                return valeur.includes('blur');
            };
            const coupables: string[] = [];
            for (const element of Array.from(document.querySelectorAll('*'))) {
                if (!flou(element)) {
                    continue;
                }
                let parent = element.parentElement;
                while (parent !== null) {
                    if (flou(parent)) {
                        coupables.push(`${element.className} dans ${parent.className}`);
                        break;
                    }
                    parent = parent.parentElement;
                }
            }
            return coupables;
        });

        // « Avoid placing Liquid Glass on top of other Liquid Glass. » Deux
        // flous empilés ne floutent pas deux fois : le second échantillonne le
        // premier, et le matériau devient laiteux.
        expect(empilements).toEqual([]);
    });

    test('Étant donné les pastilles numérotées, quand je les mesure ici et là, alors elles ont la même taille', async ({
        page,
    }) => {
        await preparerLApplication(page);
        await ouvrirUnTrajetAvecUnePage(page);
        // `.point-number` ne paraît qu'une fois un point posé : sans lui, le
        // sélecteur ne rencontre rien et `length > 0` échouerait pour une
        // raison étrangère à la géométrie qu'on veut mesurer.
        //
        // Un seul point, délibérément : `LeafletCoordonneeSelector.placeReperes`
        // (src/carte/adapters/LeafletCoordonneeSelector.ts) ajoute un marqueur
        // `.carte-marker` dans #carte-container pour chaque point *déjà*
        // géo-référencé quand la carte plein écran s'ouvre pour en placer un
        // nouveau — et ne le retire jamais à la fermeture, seul le nouveau
        // marqueur l'est. Un deuxième point poserait donc ce repère résiduel,
        // invisible mais toujours dans le document, et ce témoin le compterait
        // par la même requête globale que les pastilles qu'il veut comparer —
        // un échec intermittent (sur les projets mobiles, qui seuls empruntent
        // cette carte plein écran) sans aucun rapport avec leur géométrie.
        await ajouterUnPoint(page, 0.5, 0);
        // La pastille se peint après la résolution de la promesse : sur
        // certains moteurs le marqueur n'est pas encore rendu au retour
        // d'`ajouterUnPoint`. Attendre son attachement plutôt que de mesurer
        // une pile pas encore à jour.
        await page.locator('.point-number').first().waitFor({ state: 'attached' });

        const tailles = await page.evaluate(() =>
            Array.from(document.querySelectorAll('.point-number, .carte-marker')).map((n) => {
                const r = n.getBoundingClientRect();
                return `${Math.round(r.width)}x${Math.round(r.height)}`;
            }),
        );

        // Mesuré : la pastille du schéma faisait 44 px et celle de la carte
        // 27,6 — le minimum de 44 px de la règle du bouton s'appliquait à l'une
        // et pas à l'autre. Une seule taille, où l'écart est revenu.
        expect(tailles.length).toBeGreaterThan(0);
        expect([...new Set(tailles)]).toHaveLength(1);
    });
});
