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
    test('Étant donné un trajet vierge, quand j’importe deux images, alors la première du voyage est en bas de la pile', async ({
        page,
    }) => {
        await ouvrirUnTrajetVierge(page);

        await importerDeuxPages(page);

        await expect(page.locator('#images-stack img')).toHaveCount(2);
    });

    test('Étant donné deux images, quand je monte visuellement celle du bas, alors elle devient la fin du voyage', async ({
        page,
    }) => {
        await ouvrirUnTrajetVierge(page);
        await importerDeuxPages(page);

        await page.getByRole('button', { name: 'Monter page-2.png' }).click();

        await expect(page.locator('.image-name')).toHaveText(['page-2.png', 'page-1.png']);
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
        await expect(page.locator('.point-description')).toHaveCount(1);
        // …puis un point sur la page du bas (début du voyage).
        await clicDroitSurLImage(page, 0.5, 1);
        await choisirUneCoordonneePourUnPoint(page, 150);

        // La liste suit l'ordre du voyage…
        await expect(page.locator('.point-description')).toHaveText([
            /^Point 1 — page-2\.png à \d+ % — -?\d+\.\d{4}, -?\d+\.\d{4}$/,
            /^Point 2 — page-1\.png à \d+ % — -?\d+\.\d{4}, -?\d+\.\d{4}$/,
        ]);
        // …et à l'écran, de haut en bas, on lit « 2 » puis « 1 » : continu en
        // remontant, fini le zigzag « 2 1 / 4 3 » d'un empilement à l'envers.
        await expect(page.locator('.point-number')).toHaveText(['2', '1']);
    });

    test('Étant donné deux images, quand j’en supprime une et confirme, alors elle disparaît durablement', async ({
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

    test('Étant donné l’éditeur, quand je reviens à la liste, alors le compte d’images est à jour', async ({
        page,
    }) => {
        await ouvrirUnTrajetVierge(page);
        await importerDeuxPages(page);

        await page.getByRole('button', { name: '🔙 Trajets' }).click();

        await expect(page.getByText('2 image(s) · 0 point(s)')).toBeVisible();
    });
});
