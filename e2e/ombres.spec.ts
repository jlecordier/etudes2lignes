import { expect, test, type Locator } from '@playwright/test';
import { ajouterUnPoint, ouvrirUnTrajetAvecUnePage } from './helpers';

/**
 * Ce fichier lit une valeur **calculée**, pas le texte source de la feuille —
 * et c'est une garantie réelle, mais **incomplète**, qu'il faut lire avec sa
 * limite plutôt qu'à sa place.
 *
 * Il affirme le contrat rendu : qu'une pastille et le bouton flottant portent
 * bien une ombre, dans les trois apparences, avec la bonne géométrie. Il ne
 * peut en revanche **pas** attraper une `light-dark()` mal formée — enveloppant
 * un `box-shadow` entier plutôt que sa seule couleur, ce que sa grammaire
 * interdit (`light-dark(<color>, <color>)`) — parce que `pnpm test:e2e`
 * exerce le **build de production** (`pnpm build && vite preview`), où le
 * transformateur CSS de Vite (`lightningcss`) réécrit systématiquement tout
 * `light-dark(A, B)` en une paire de `var()` de secours, **sans valider que
 * `A` et `B` sont chacun une couleur**. Mesuré : rejouer ce fichier contre la
 * forme invalide, dans ce même pipeline de build, rend exactement les mêmes
 * valeurs — le bundler « répare » l'une comme l'autre.
 *
 * Cette faute-là ne se voit donc qu'en développement (`pnpm dev`, CSS servi
 * brut) ou par lecture du texte source : c'est l'invariant de grammaire dans
 * `styles.test.ts` (« La grammaire de light-dark() ») qui la couvre, pas ce
 * fichier. Les deux témoins sont complémentaires, ni l'un ni l'autre
 * redondant : celui-ci prouve que le rendu fonctionne, l'autre que le texte
 * source ne dépend pas d'une tolérance de bundler pour fonctionner.
 */

async function boiteAOmbre(locator: Locator): Promise<string> {
    return locator.evaluate((element) => getComputedStyle(element).boxShadow);
}

test.describe("L'ombre calculée, dans les trois apparences", () => {
    test("Étant donné la pastille d'un point, quand l'apparence change, alors son ombre est peinte, jamais none", async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);
        await ajouterUnPoint(page, 0.5, 0);
        const pastille = page.locator('#images-stack .point-number');

        await page.emulateMedia({ colorScheme: 'light' });
        const clair = await boiteAOmbre(pastille);

        await page.emulateMedia({ colorScheme: 'dark' });
        const sombre = await boiteAOmbre(pastille);

        await page.emulateMedia({ colorScheme: 'light', contrast: 'more' });
        const contraste = await boiteAOmbre(pastille);

        for (const [nom, valeur] of [
            ['clair', clair],
            ['sombre', sombre],
            ['contraste', contraste],
        ] as const) {
            expect(valeur, `apparence ${nom}`).not.toBe('none');
            expect(valeur, `apparence ${nom}`).not.toBe('');
        }

        // Même géométrie des deux côtés (0 1px 4px) — seule la teinte varie,
        // donc les deux chaînes calculées doivent différer : c'est
        // `light-dark()` qui a joué, et non une valeur figée par accident.
        expect(clair).not.toBe(sombre);
        // 40 % d'opacité en clair, 60 % en sombre : présents tels quels dans
        // la couleur calculée, sous une forme ou une autre selon le moteur.
        expect(clair).toMatch(/0\.4|40%/);
        expect(sombre).toMatch(/0\.6|60%/);
    });

    test("Étant donné le bouton flottant « Ajouter un point », quand l'apparence change, alors son reflet et son ombre sont peints ensemble, jamais none", async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);
        const bouton = page.locator('#floating-add-point-button');

        await page.emulateMedia({ colorScheme: 'light' });
        const clair = await boiteAOmbre(bouton);

        await page.emulateMedia({ colorScheme: 'dark' });
        const sombre = await boiteAOmbre(bouton);

        await page.emulateMedia({ colorScheme: 'light', contrast: 'more' });
        const contraste = await boiteAOmbre(bouton);

        for (const [nom, valeur] of [
            ['clair', clair],
            ['sombre', sombre],
            ['contraste', contraste],
        ] as const) {
            expect(valeur, `apparence ${nom}`).not.toBe('none');
            expect(valeur, `apparence ${nom}`).not.toBe('');
            // Deux ombres dans la même déclaration (`--verre-reflet`, puis
            // `--ombre-flottante`) : c'est justement le site où le second
            // devenu `none` aurait aussi effacé le premier, tant la
            // déclaration entière retombe sur `unset`. Sa présence ici prouve
            // que les deux survivent ensemble.
            expect(valeur, `apparence ${nom}`).toContain('inset');
        }

        // La géométrie de `--ombre-flottante` diffère réellement selon
        // l'apparence — 8px de flou en clair, 12px en sombre — et n'est donc
        // pas dans `light-dark()` : c'est ce que ce couple de chaînes vérifie.
        expect(clair).toContain('8px');
        expect(sombre).toContain('12px');
        expect(clair).not.toBe(sombre);
    });
});
