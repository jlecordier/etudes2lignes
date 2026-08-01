import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { ajouterUnPoint, ouvrirUnTrajetAvecUnePage, preparerLApplication } from './helpers';

/** Prépare un trajet géoréférencé et revient à la liste. */
async function preparerUnTrajetEtRevenirALaListe(page: Page): Promise<void> {
    await ouvrirUnTrajetAvecUnePage(page);
    await ajouterUnPoint(page, 0.5, 0);
    await expect(page.locator('.point-description')).toHaveCount(1);
    await page.getByRole('button', { name: '🔙 Trajets' }).click();
    await expect(page.getByText('1 image(s) · 1 point(s)')).toBeVisible();
}

async function exporterLePremierTrajet(page: Page): Promise<string> {
    const telechargement = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exporter Paris → Bordeaux' }).click();
    const file = await (await telechargement).path();
    return file;
}

test.describe('Import / export JSON', () => {
    test('Étant donné un trajet exporté, alors le fichier JSON est autonome (nom, image en base64, point)', async ({
        page,
    }) => {
        await preparerUnTrajetEtRevenirALaListe(page);

        const file = await exporterLePremierTrajet(page);

        const content: unknown = JSON.parse(await readFile(file, 'utf-8'));
        expect(content).toMatchObject({
            application: 'etudes2lignes',
            version: 1,
            trajet: {
                nom: 'Paris → Bordeaux',
                images: [{ nom: 'page-1.png', donneesBase64: expect.stringMatching(/.+/) }],
                points: [{ image: 0 }],
            },
        });
    });

    test('Étant donné un fichier exporté, quand je l’importe, alors un nouveau trajet identique apparaît', async ({
        page,
    }) => {
        await preparerUnTrajetEtRevenirALaListe(page);
        const file = await exporterLePremierTrajet(page);

        await page.locator('#input-import-trajet').setInputFiles(file);

        // Deux trajets du même nom : l'import crée toujours un nouveau trajet.
        await expect(
            page.getByRole('button', { name: 'Paris → Bordeaux', exact: true }),
        ).toHaveCount(2);
        await expect(page.getByText('1 image(s) · 1 point(s)')).toHaveCount(2);

        // Le trajet importé s'ouvre avec son image et son point.
        await page.getByRole('button', { name: 'Paris → Bordeaux', exact: true }).nth(1).click();
        await expect(page.locator('.image-name')).toHaveText(['page-1.png']);
        await expect(page.locator('.point-description')).toHaveCount(1);
    });

    test('Étant donné un fichier qui n’est pas un export, quand je l’importe, alors un message l’explique et rien n’est créé', async ({
        page,
    }) => {
        await preparerLApplication(page);
        const invalidFile = join(tmpdir(), 'pas-un-export.json');
        await writeFile(invalidFile, '{"application":"autre"}');

        const messages: string[] = [];
        page.once('dialog', (dialog) => {
            messages.push(dialog.message());
            void dialog.accept();
        });
        await page.locator('#input-import-trajet').setInputFiles(invalidFile);

        await expect.poll(() => messages).toEqual(['Ce fichier ne vient pas d’Etudes2Lignes.']);
        await expect(page.locator('#empty-list')).toBeVisible();
    });
});
