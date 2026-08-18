import { expect, test } from '@playwright/test';
import { pngFile, preparerLApplication } from './helpers';

test.describe('Hors ligne (service worker)', () => {
    test("Étant donné l'appli visitée une fois, quand je recharge hors ligne, alors elle démarre avec mes données", async ({
        page,
        context,
        browserName,
    }) => {
        test.skip(
            browserName !== 'chromium',
            'Service worker + mode hors ligne : fiable uniquement sur Chromium dans Playwright.',
        );

        await preparerLApplication(page);
        // Le service worker doit être installé et prêt avant de couper le réseau.
        await page.evaluate(async () => {
            await navigator.serviceWorker.ready;
        });
        await expect(page.locator('#offline-indicator')).toBeVisible({ timeout: 15_000 });

        page.once('dialog', (dialog) => void dialog.accept('Paris → Bordeaux'));
        await page.getByRole('button', { name: 'Nouveau trajet' }).click();
        await page.getByRole('button', { name: 'Paris → Bordeaux', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Paris → Bordeaux' })).toBeVisible();
        await page.locator('#input-images').setInputFiles([pngFile('page-1.png')]);
        await expect(page.locator('.image-name')).toHaveText(['page-1.png']);

        await context.setOffline(true);
        await page.reload();

        // L'app shell est servi par le service worker, les données par IndexedDB,
        // et le dernier trajet ouvert est restauré directement.
        await expect(page.getByRole('heading', { name: 'Paris → Bordeaux' })).toBeVisible();
        await expect(page.locator('.image-name')).toHaveText(['page-1.png']);
    });
});
