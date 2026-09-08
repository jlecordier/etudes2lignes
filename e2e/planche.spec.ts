import { expect, test } from '@playwright/test';

test.describe('La planche de reference', () => {
    test("Étant donné la planche, quand je l'ouvre, alors elle montre tous les jetons du systeme", async ({
        page,
    }) => {
        await page.goto('/design/');

        // Elle enumere les feuilles chargees : un jeton ajoute y parait sans
        // qu'on ait pense a l'inscrire, et un jeton absent y parait vide.
        const pastilles = page.locator('[data-jeton]');

        await expect(pastilles.first()).toBeVisible();
        expect(await pastilles.count()).toBeGreaterThan(60);
    });

    test('Étant donné la planche, quand je lis un style de texte, alors ses trois metriques y sont mesurees', async ({
        page,
    }) => {
        await page.goto('/design/');

        const mesure = page.locator('[data-style-de-texte="body"] code');
        await expect(mesure).not.toHaveText('');
        const texte = await mesure.textContent();

        // Mesurees dans le moteur, pas recopiees de la feuille : c'est la seule
        // facon de voir qu'un triplet est incomplet — un style non applique
        // rendrait 'normal' pour l'interligne et l'approche, que ce motif ne
        // reconnaitrait pas.
        const correspondance = /^body — ([\d.]+)px \/ ([\d.]+)px \/ (-?[\d.]+)px$/.exec(
            texte ?? '',
        );
        expect(correspondance).not.toBeNull();
        const [, taille, interligne, approche] = correspondance ?? [];

        // Le rapport, pas le pixel absolu : `-apple-system-body` (Task 4) fait
        // dependre la taille de base du reglage systeme de taille dynamique sous
        // WebKit reel — 13px dans cet environnement plutot que le repli 17px —,
        // et les moteurs arrondissent le flottant `1.294 * taille` differemment
        // (21.998px sous Chromium/Blink, 22px pile sous Firefox). Le rapport
        // `--text-body-leading`/`--text-body-tracking` (Task 4), lui, ne bouge
        // pas : c'est ce que la planche verifie, portable entre moteurs.
        expect(Number(interligne) / Number(taille)).toBeCloseTo(1.294, 2);
        expect(Number(approche) / Number(taille)).toBeCloseTo(-0.026, 2);
    });

    test('Étant donné la planche publiee, quand je lis le service worker, alors elle en est absente', async ({
        request,
    }) => {
        const serviceWorker = await request.get('/sw.js');
        const source = await serviceWorker.text();

        // Deux exclusions a tenir, et deux facons de les perdre : `globIgnores`
        // empeche la mise en cache prealable chez l'utilisateur, et le
        // `navigateFallbackDenylist` empeche que l'application soit servie sous
        // `/design/`. Ni l'une ni l'autre ne previent en disparaissant.
        expect(source).not.toMatch(/["'][^"']*design\/[^"']*["']\s*,\s*revision/);
        expect(source).toContain('design');
    });
});
