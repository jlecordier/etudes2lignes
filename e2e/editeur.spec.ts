import { expect, test, type Page } from '@playwright/test';
import {
    choisirUneCoordonneePourUnPoint,
    clicDroitSurLImage,
    pngFile,
    ouvrirUnTrajetVierge,
} from './helpers';

async function importerDeuxPages(page: Page): Promise<void> {
    await page
        .locator('#input-images')
        .setInputFiles([pngFile('page-1.png'), pngFile('page-2.png')]);
    // Les pages s'importent de haut en bas, dans l'ordre de l'explorateur. Le
    // document se lisant de bas en haut, la dernière ouvre donc le voyage.
    await expect(page.locator('.image-name')).toHaveText(['page-1.png', 'page-2.png']);
}

test.describe("Éditeur d'un trajet — les images", () => {
    test("Étant donné un trajet vierge, quand j'importe deux images, alors la première du voyage est en bas de la pile", async ({
        page,
    }) => {
        await ouvrirUnTrajetVierge(page);

        await importerDeuxPages(page);

        await expect(page.locator('#images-stack schema-page')).toHaveCount(2);
        // Les pages se comptent depuis le haut de la pile — l'ordre dans lequel
        // l'explorateur les a livrées, et celui que la liste des points annonce.
        await expect(page.locator('.page-number')).toHaveText(['1', '2']);
    });

    test('Étant donné deux images, quand je monte visuellement celle du bas, alors elle devient la fin du voyage', async ({
        page,
    }) => {
        await ouvrirUnTrajetVierge(page);
        await importerDeuxPages(page);

        await page.getByRole('button', { name: 'Monter page-2.png' }).click();

        await expect(page.locator('.image-name')).toHaveText(['page-2.png', 'page-1.png']);
        // Le numéro dit la rangée, pas le fichier : c'est la page du haut qui
        // porte le 1, quelle qu'elle soit.
        await expect(page.locator('.page-number')).toHaveText(['1', '2']);
    });

    test('Étant donné un point sur chaque page, alors les numéros croissent en remontant la pile, comme les PK', async ({
        page,
    }) => {
        await ouvrirUnTrajetVierge(page);
        await importerDeuxPages(page);

        // Un point sur la page du haut (fin du voyage)…
        await clicDroitSurLImage(page, 0.5, 0);
        await choisirUneCoordonneePourUnPoint(page);
        // La sauvegarde et le re-rendu sont asynchrones : attendre que le
        // point soit affiché avant de recliquer sur la pile (re-rendue).
        await expect(page.locator('point-marker')).toHaveCount(1);
        // …puis un point sur la page du bas (début du voyage).
        await clicDroitSurLImage(page, 0.5, 1);
        await choisirUneCoordonneePourUnPoint(page, 150);

        // À l'écran, de haut en bas, on lit « 2 » puis « 1 » : continu en
        // remontant, fini le zigzag « 2 1 / 4 3 » d'un empilement à l'envers.
        // Le voyage part du bas, donc le premier point est celui de la page du
        // bas — dont le numéro de page, lui, est le plus grand.
        await expect(page.locator('#images-stack .point-number')).toHaveText(['2', '1']);
    });

    test("Étant donné deux images, quand j'en supprime une et confirme, alors elle disparaît durablement", async ({
        page,
    }) => {
        await ouvrirUnTrajetVierge(page);
        await importerDeuxPages(page);

        page.once('dialog', (dialog) => void dialog.accept());
        await page.getByRole('button', { name: 'Supprimer page-1.png' }).click();
        await expect(page.locator('.image-name')).toHaveText(['page-2.png']);

        // La suppression survit à un rechargement (persistance IndexedDB), et
        // le dernier trajet ouvert est restauré directement dans l'éditeur.
        await page.reload();
        await expect(page.locator('.image-name')).toHaveText(['page-2.png']);
    });

    test("Étant donné l'éditeur, quand je reviens à la liste, alors le compte d'images est à jour", async ({
        page,
    }) => {
        await ouvrirUnTrajetVierge(page);
        await importerDeuxPages(page);

        await page.getByRole('button', { name: 'Trajets' }).click();

        await expect(page.getByText('2 images · aucun point')).toBeVisible();
    });
});
