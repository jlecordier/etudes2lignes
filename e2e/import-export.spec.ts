import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { ajouterUnPoint, ouvrirUnTrajetAvecUnePage } from './aides';

/** Prépare un trajet géoréférencé et revient à la liste. */
async function preparerUnTrajetEtRevenirALaListe(page: Page): Promise<void> {
    await ouvrirUnTrajetAvecUnePage(page);
    await ajouterUnPoint(page, 0.5, 0);
    await expect(page.locator('.description-point')).toHaveCount(1);
    await page.getByRole('button', { name: '🔙 Trajets' }).click();
    await expect(page.getByText('1 image(s) · 1 point(s)')).toBeVisible();
}

async function exporterLePremierTrajet(page: Page): Promise<string> {
    const telechargement = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exporter Paris → Bordeaux' }).click();
    const fichier = await (await telechargement).path();
    return fichier;
}

test.describe('Import / export JSON', () => {
    test('Étant donné un trajet exporté, alors le fichier JSON est autonome (nom, image en base64, point)', async ({
        page,
    }) => {
        await preparerUnTrajetEtRevenirALaListe(page);

        const fichier = await exporterLePremierTrajet(page);

        const contenu = JSON.parse(await readFile(fichier, 'utf-8'));
        expect(contenu.application).toBe('etudes2lignes');
        expect(contenu.version).toBe(1);
        expect(contenu.trajet.nom).toBe('Paris → Bordeaux');
        expect(contenu.trajet.images).toHaveLength(1);
        expect(contenu.trajet.images[0].nom).toBe('page-1.png');
        expect(contenu.trajet.images[0].donneesBase64.length).toBeGreaterThan(0);
        expect(contenu.trajet.points).toHaveLength(1);
        expect(contenu.trajet.points[0].image).toBe(0);
    });

    test('Étant donné un fichier exporté, quand je l’importe, alors un nouveau trajet identique apparaît', async ({
        page,
    }) => {
        await preparerUnTrajetEtRevenirALaListe(page);
        const fichier = await exporterLePremierTrajet(page);

        await page.locator('#input-import-trajet').setInputFiles(fichier);

        // Deux trajets du même nom : l'import crée toujours un nouveau trajet.
        await expect(
            page.getByRole('button', { name: 'Paris → Bordeaux', exact: true }),
        ).toHaveCount(2);
        await expect(page.getByText('1 image(s) · 1 point(s)')).toHaveCount(2);

        // Le trajet importé s'ouvre avec son image et son point.
        await page.getByRole('button', { name: 'Paris → Bordeaux', exact: true }).nth(1).click();
        await expect(page.locator('.nom-image')).toHaveText(['page-1.png']);
        await expect(page.locator('.description-point')).toHaveCount(1);
    });

    test('Étant donné un fichier qui n’est pas un export, quand je l’importe, alors un message l’explique et rien n’est créé', async ({
        page,
    }) => {
        await page.goto('./');
        const fichierInvalide = join(tmpdir(), 'pas-un-export.json');
        await writeFile(fichierInvalide, '{"application":"autre"}');

        const messages: string[] = [];
        page.once('dialog', (dialogue) => {
            messages.push(dialogue.message());
            void dialogue.accept();
        });
        await page.locator('#input-import-trajet').setInputFiles(fichierInvalide);

        await expect.poll(() => messages).toEqual(['Ce fichier ne vient pas d’Etudes2Lignes.']);
        await expect(page.locator('#liste-vide')).toBeVisible();
    });
});
