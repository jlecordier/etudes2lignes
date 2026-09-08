import { expect, test, type Page } from '@playwright/test';
import {
    ajouterUnPoint,
    ouvrirUnTrajetAvecUnePage,
    preparerLApplication,
    requireDefined,
} from './helpers';

/** Les largeurs qui comptent : le plus petit iPhone courant, le courant, et un
 *  grand. C'est a 360 px que les deux defauts de septembre se voyaient. */
const LARGEURS = [360, 390, 430];

async function hauteurDeLaBarre(page: Page): Promise<number> {
    const boite = await page.locator('.header, .suivi-bar').first().boundingBox();
    return Math.round(requireDefined(boite, 'barre').height);
}

test.describe('La geometrie du systeme', () => {
    test.describe('La hauteur de la barre', () => {
        // `.suivi-bar` affiche son etat dans un texte (`#suivi-status`) que
        // `.header` n'a pas, et elle porte `flex-wrap: wrap` la ou `.header`
        // ne le porte jamais (voir le commentaire sur `.header` dans
        // legacy.css). Sans geolocalisation mockee, le texte affiche varie
        // d'une execution a l'autre — vide, « Acces a la position refuse… »,
        // selon le moment ou l'API resout — et sa longueur decide parfois la
        // barre a passer sur deux lignes (71 px, mesure). Geolocalisation
        // accordee et pilotee, comme `gps.spec.ts` le fait deja pour les memes
        // deux points : le texte se stabilise sur le court « En attente du
        // signal GPS… », et c'est cet etat normal que la mesure du 3
        // septembre decrivait.
        test.use({
            geolocation: { latitude: 46.6042, longitude: 2.395 },
            permissions: ['geolocation'],
        });

        test('Étant donné les trois ecrans, quand je mesure leur barre, alors elle a partout la meme hauteur', async ({
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

            // Mesuré le 3 septembre : l'en-tete faisait 44 px et la barre de suivi
            // 62, parce que chacune ecrivait son rembourrage de son cote. Une seule
            // valeur distincte, ou la derive est revenue.
            expect([...new Set(Object.values(hauteurs))]).toHaveLength(1);
        });
    });

    test("Étant donné les controles de l'application, quand je mesure leur cible, alors aucun n'est sous 44 px", async ({
        page,
    }) => {
        await preparerLApplication(page);
        await ouvrirUnTrajetAvecUnePage(page);
        await page.setViewportSize({ width: 360, height: 780 });

        const trop_petits: string[] = [];
        // Les controles de carte sont exclus, et c'est motive : voir le test
        // suivant, qui leur applique le plancher que la HIG leur laisse — un
        // second regime, 28 px, distinct du 44 px de l'application.
        for (const cible of await page.locator('button:visible').all()) {
            if (await cible.evaluate((n) => n.closest('.leaflet-control') !== null)) {
                continue;
            }
            const boite = requireDefined(await cible.boundingBox(), 'cible');
            if (boite.width < 44 || boite.height < 44) {
                const nom = (await cible.getAttribute('aria-label')) ?? '';
                trop_petits.push(`${nom} ${Math.round(boite.width)}x${Math.round(boite.height)}`);
            }
        }

        // « The minimum tappable area for any control is 44x44 pt. »
        expect(trop_petits).toEqual([]);
    });

    test('Étant donné les controles de carte, quand je mesure le groupe, alors lui seul porte le materiau', async ({
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
        // than to each control. » Le groupe porte le rayon et decoupe ; les
        // enfants n'ont ni rayon ni fond, sans quoi ce serait du verre sur du
        // verre.
        expect(mesures.rayonDuGroupe).not.toBe('0px');
        expect(mesures.decoupe).toBe('hidden');
        expect(mesures.rayonDeLEnfant).toBe('0px');
        expect(mesures.fondDeLEnfant).toBe('rgba(0, 0, 0, 0)');
        // Le plancher absolu de la HIG — 28 px, le second regime — et non les
        // 44 px de l'application : une colonne de controles a 44 px mangerait
        // la vignette de carte qu'elle recouvre.
        expect(boite.height).toBeGreaterThanOrEqual(28);
    });

    test('Étant donné une surface en verre, quand je cherche ses ancetres, alors aucune ne flotte sur une autre', async ({
        page,
    }) => {
        await preparerLApplication(page);
        await ouvrirUnTrajetAvecUnePage(page);

        const empilements = await page.evaluate(() => {
            const flou = (n: Element): boolean => {
                const style = getComputedStyle(n);
                // `getPropertyValue` plutot que l'accesseur camelCase : celui
                // du prefixe WebKit n'est pas dans les types DOM standard, et
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
        // flous empiles ne floutent pas deux fois : le second echantillonne le
        // premier, et le materiau devient laiteux.
        expect(empilements).toEqual([]);
    });

    test('Étant donné les pastilles numerotees, quand je les mesure ici et la, alors elles ont la meme taille', async ({
        page,
    }) => {
        await preparerLApplication(page);
        await ouvrirUnTrajetAvecUnePage(page);
        // `.point-number` ne parait qu'une fois un point pose : sans lui, le
        // selecteur ne rencontre rien et `length > 0` echouerait pour une
        // raison etrangere a la geometrie qu'on veut mesurer.
        await ajouterUnPoint(page, 0.5, 0);
        // La pastille se peint apres la resolution de la promesse : sur
        // certains moteurs le marqueur n'est pas encore rendu au retour
        // d'`ajouterUnPoint`. Attendre son attachement plutot que de mesurer
        // une pile pas encore a jour.
        await page.locator('.point-number').first().waitFor({ state: 'attached' });

        const tailles = await page.evaluate(() =>
            Array.from(document.querySelectorAll('.point-number, .carte-marker')).map((n) => {
                const r = n.getBoundingClientRect();
                return `${Math.round(r.width)}x${Math.round(r.height)}`;
            }),
        );

        // Mesuré : la pastille du schema faisait 44 px et celle de la carte
        // 27,6 — le minimum de 44 px de la regle du bouton s'appliquait a l'une
        // et pas a l'autre. Une seule taille, ou l'ecart est revenu.
        expect(tailles.length).toBeGreaterThan(0);
        expect([...new Set(tailles)]).toHaveLength(1);
    });
});
