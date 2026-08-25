import { expect, test } from '@playwright/test';
import { ouvrirUnTrajetAvecUnePage } from './helpers';

test.describe('Gestes natifs neutralisés', () => {
    test("Étant donné l'application ouverte, alors le corps n'accorde au doigt que le défilement", async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);

        const touchAction = await page.evaluate(() => getComputedStyle(document.body).touchAction);

        // `pan-x pan-y` et non `none` : la pile se lit au doigt. Ce qui part,
        // c'est le pincement et le double-tap-zoom.
        expect(touchAction).toBe('pan-x pan-y');
    });

    test("Étant donné une page de schéma affichée, alors son image ne se sélectionne pas — l'héritage traverse le shadow DOM", async ({
        page,
        browserName,
    }) => {
        // Mesuré, pas supposé : sur cette version de Firefox, `getComputedStyle`
        // rend `auto` pour un `user-select` hérité sans règle propre à l'élément
        // — vérifié aussi via `-moz-user-select`, même résultat. La résolution en
        // `none` n'a lieu qu'à l'usage réel (la sélection), jamais dans le CSSOM :
        // rien à lire ici sur ce moteur.
        test.skip(
            browserName === 'firefox',
            "Firefox ne résout `user-select: auto` hérité qu'à l'usage, jamais dans getComputedStyle.",
        );

        await ouvrirUnTrajetAvecUnePage(page);

        // La seule preuve possible que la règle posée sur `body` atteint une
        // image vivant dans un shadow root : la lire là où elle est.
        //
        // Webkit n'expose pas `user-select` non préfixé dans son
        // `getComputedStyle` (mesuré : `getPropertyValue('user-select')` y rend
        // une chaîne vide) ; seul `-webkit-user-select` y porte la règle héritée,
        // avec la même valeur.
        const userSelect = await page.locator('schema-page').evaluate((host, moteur) => {
            const racine = host.shadowRoot;
            if (racine === null) {
                return 'pas de shadow root';
            }
            const image = racine.querySelector('img');
            if (image === null) {
                return "pas d'image";
            }
            const style = getComputedStyle(image);
            return moteur === 'webkit' ?
                    style.getPropertyValue('-webkit-user-select')
                :   style.userSelect;
        }, browserName);

        expect(userSelect).toBe('none');
    });

    test('Étant donné le champ de latitude, alors il reste sélectionnable : corriger un chiffre le demande', async ({
        page,
        browserName,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);

        // Même limite Webkit que pour l'image du schéma, ici sans conséquence sur
        // Firefox : cette règle est déclarée directement sur l'élément, pas
        // héritée, donc `getComputedStyle` la rend normalement sur ce moteur.
        const userSelect = await page.locator('#latitude-input').evaluate((champ, moteur) => {
            const style = getComputedStyle(champ);
            return moteur === 'webkit' ?
                    style.getPropertyValue('-webkit-user-select')
                :   style.userSelect;
        }, browserName);

        expect(userSelect).toBe('text');
    });

    test("Étant donné le viewport, alors il interdit la mise à l'échelle par l'utilisateur", async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);

        const contenu = await page.locator('meta[name="viewport"]').getAttribute('content');

        expect(contenu).toContain('user-scalable=no');
        expect(contenu).toContain('maximum-scale=1');
    });
});
