import { expect, test } from '@playwright/test';

test.describe('La planche de référence', () => {
    test("Étant donné la planche, quand je l'ouvre, alors elle montre tous les jetons du système", async ({
        page,
    }) => {
        await page.goto('/design/');

        // Elle énumère les feuilles chargées : un jeton ajouté y paraît sans
        // qu'on ait pensé à l'inscrire, et un jeton absent y paraît vide.
        const pastilles = page.locator('[data-jeton]');

        await expect(pastilles.first()).toBeVisible();
        expect(await pastilles.count()).toBeGreaterThan(60);
    });

    test("Étant donné les boutons d'apparence, quand je bascule vers Sombre, alors un jeton résolu change vraiment", async ({
        page,
    }) => {
        await page.goto('/design/');

        const jetonResolu = () =>
            page.evaluate(() =>
                getComputedStyle(document.documentElement).getPropertyValue('--color-label').trim(),
            );

        // `light-dark()` est compilé au build (lightningcss) en une paire de
        // jetons internes que seule une déclaration `color-scheme` bascule —
        // c'est précisément ce que les boutons de la planche posent
        // (`[data-apparence]`), et non plus le `color-scheme` posé en ligne
        // par le script, sourd au `light-dark()` déjà abaissé. Sans la
        // déclaration CSS, les deux lectures ci-dessous seraient identiques.
        await page.getByRole('button', { name: 'Clair' }).click();
        const clair = await jetonResolu();

        await page.getByRole('button', { name: 'Sombre' }).click();
        const sombre = await jetonResolu();

        expect(clair).not.toBe('');
        expect(sombre).not.toBe('');
        expect(sombre).not.toBe(clair);
    });

    test('Étant donné la planche, quand je lis un style de texte, alors ses trois métriques y sont mesurées', async ({
        page,
    }) => {
        await page.goto('/design/');

        const mesure = page.locator('[data-style-de-texte="body"] code');
        await expect(mesure).not.toHaveText('');
        const texte = await mesure.textContent();

        // Mesurées dans le moteur, pas recopiées de la feuille : c'est la seule
        // façon de voir qu'un triplet est incomplet — un style non appliqué
        // rendrait 'normal' pour l'interligne et l'approche, que ce motif ne
        // reconnaîtrait pas.
        const correspondance = /^body — ([\d.]+)px \/ ([\d.]+)px \/ (-?[\d.]+)px$/.exec(
            texte ?? '',
        );
        expect(correspondance).not.toBeNull();
        const [, taille, interligne, approche] = correspondance ?? [];

        // Le rapport, pas le pixel absolu : `-apple-system-body` (Task 4) fait
        // dépendre la taille de base du réglage système de taille dynamique sous
        // WebKit réel — 13px dans cet environnement plutôt que le repli 17px —,
        // et les moteurs arrondissent le flottant `1.294 * taille` différemment
        // (21.998px sous Chromium/Blink, 22px pile sous Firefox). Le rapport
        // `--text-body-leading`/`--text-body-tracking` (Task 4), lui, ne bouge
        // pas : c'est ce que la planche vérifie, portable entre moteurs.
        expect(Number(interligne) / Number(taille)).toBeCloseTo(1.294, 2);
        expect(Number(approche) / Number(taille)).toBeCloseTo(-0.026, 2);
    });

    test('Étant donné la planche publiée, quand je lis le service worker, alors elle en est absente', async ({
        request,
    }) => {
        const serviceWorker = await request.get('/sw.js');
        const source = await serviceWorker.text();

        // Deux exclusions à tenir, et deux façons de les perdre : `globIgnores`
        // empêche la mise en cache préalable chez l'utilisateur, et le
        // `navigateFallbackDenylist` empêche que l'application soit servie sous
        // `/design/`. Ni l'une ni l'autre ne prévient en disparaissant.
        expect(source).not.toMatch(/["'][^"']*design\/[^"']*["']\s*,\s*revision/);
        expect(source).toContain('design');
    });

    test('Étant donné le manifeste de précache, quand je le lis, alors aucune de ses entrées ne mentionne la planche', async ({
        request,
    }) => {
        const serviceWorker = await request.get('/sw.js');
        const source = await serviceWorker.text();

        // Un motif par chemin (`design/**`) se romprait en silence si Rollup
        // rangeait un jour les morceaux de la planche autrement qu'aujourd'hui
        // — ils vivent déjà sous `assets/design-*`, pas sous `design/` — et le
        // test précédent, scopé à un seul chemin, ne le verrait pas venir. Ce
        // témoin lit chaque URL du manifeste de précache et affirme qu'aucune
        // ne mentionne « design », quel que soit son chemin, plutôt que d'en
        // supposer un.
        const urls = [...source.matchAll(/\{url:"([^"]*)",revision:[^}]*\}/g)].map(
            (correspondance) => correspondance[1] ?? '',
        );
        expect(urls.length).toBeGreaterThan(0);

        const urlsDeLaPlanche = urls.filter((url) => url.includes('design'));
        expect(urlsDeLaPlanche).toEqual([]);
    });

    test("Étant donné la planche construite, quand j'en lis la page, alors aucun lien de manifeste n'y figure, et celui de l'application reste intact", async ({
        request,
    }) => {
        const pagePlanche = await request.get('/design/');
        const htmlPlanche = await pagePlanche.text();
        const pageApplication = await request.get('/');
        const htmlApplication = await pageApplication.text();

        // VitePWA injecte `<link rel="manifest">` dans chaque entrée HTML par
        // défaut ; un greffon en post-traitement (vite.config.ts) le retire
        // pour cette seule entrée. Le lien n'existe que dans la sortie
        // construite — la source `design/index.html` n'en a jamais porté —
        // donc ce témoin lit la réponse HTTP plutôt que le fichier source.
        expect(htmlPlanche).not.toContain('rel="manifest"');

        // Le versant apparié, et pas seulement une symétrie de forme : un
        // greffon trop large — un `endsWith` qui matche autre chose, une
        // entrée déplacée, une refonte de la configuration — retirerait le
        // lien de partout. La première assertion resterait verte (la planche
        // resterait bien sans manifeste), et rien ne dirait que la PWA a
        // cessé d'être installable. Cette seconde assertion garde l'autre
        // bord : le lien doit rester présent sur l'entrée de l'application,
        // celle dont l'installation hors ligne est la raison d'être.
        expect(htmlApplication).toContain('rel="manifest"');
    });
});
