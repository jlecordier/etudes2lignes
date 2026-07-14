import { expect, type Page } from '@playwright/test';

/** PNG transparent de 1×1 pixel : suffisant pour tester l'import sans fixture lourde. */
export const PNG_1X1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
);

export function fichierPng(nom: string): { name: string; mimeType: string; buffer: Buffer } {
    return { name: nom, mimeType: 'image/png', buffer: PNG_1X1 };
}

/** Crée un trajet, l'ouvre dans l'éditeur et importe une page. */
export async function ouvrirUnTrajetAvecUnePage(page: Page): Promise<void> {
    // Les tuiles OSM sont bloquées : la carte reste grise mais fonctionne,
    // et les tests ne dépendent pas du réseau.
    await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
    await page.goto('./');
    page.once('dialog', (dialogue) => void dialogue.accept('Paris → Bordeaux'));
    await page.getByRole('button', { name: 'Nouveau trajet' }).click();
    await page.getByRole('button', { name: 'Paris → Bordeaux', exact: true }).click();
    // L'éditeur charge le trajet en asynchrone : attendre qu'il soit prêt
    // (le titre apparaît en fin de chargement) avant d'importer.
    await expect(page.getByRole('heading', { name: 'Paris → Bordeaux' })).toBeVisible();
    await page.locator('#input-images').setInputFiles([fichierPng('page-1.png')]);
    await expect(page.locator('.nom-image')).toHaveText(['page-1.png']);
}

/** Centre la fraction visée de l'image dans le viewport et renvoie ses coordonnées écran. */
async function positionSurLImage(
    page: Page,
    fractionDeHauteur: number,
    indexVisuel: number,
): Promise<{ x: number; y: number }> {
    const zone = page.locator('.zone-image').nth(indexVisuel);
    await zone.scrollIntoViewIfNeeded();
    // L'image de test s'étire en pleine largeur : le point visé peut être sous
    // le pli. On centre la cible dans le viewport avant de cliquer.
    const viewport = page.viewportSize()!;
    let cadre = (await zone.boundingBox())!;
    const decalage = cadre.y + cadre.height * fractionDeHauteur - viewport.height / 2;
    await page.evaluate((delta) => window.scrollBy(0, delta), decalage);
    cadre = (await zone.boundingBox())!;
    return { x: cadre.x + cadre.width / 2, y: cadre.y + cadre.height * fractionDeHauteur };
}

/** Clique sur l'image de l'éditeur à une fraction de sa hauteur. */
export async function cliquerSurLImage(
    page: Page,
    fractionDeHauteur: number,
    indexVisuel = 0,
): Promise<void> {
    const { x, y } = await positionSurLImage(page, fractionDeHauteur, indexVisuel);
    await page.mouse.click(x, y);
}

/** Clic droit sur l'image de l'éditeur : ajoute un point directement à cette fraction. */
export async function clicDroitSurLImage(
    page: Page,
    fractionDeHauteur: number,
    indexVisuel = 0,
): Promise<void> {
    const { x, y } = await positionSurLImage(page, fractionDeHauteur, indexVisuel);
    await page.mouse.click(x, y, { button: 'right' });
}

/** Choisit une coordonnée sur la carte ouverte (clic au centre + décalage). */
export async function choisirUneCoordonneeSurLaCarte(page: Page, decalageX = 0): Promise<void> {
    await expect(page.locator('#ecran-carte')).toBeVisible();
    // Le décalage du clic est horizontal : c'est la longitude qui doit changer.
    const champLongitude = page.getByLabel('Longitude');
    const valeurAvant = await champLongitude.inputValue();
    const carte = (await page.locator('#conteneur-carte').boundingBox())!;
    await page.mouse.click(carte.x + carte.width / 2 + decalageX, carte.y + carte.height / 2);
    // Le clic n'est pris en compte que lorsque le marqueur a bougé : attendre
    // que la saisie reflète la nouvelle longitude avant de valider.
    await expect(champLongitude).not.toHaveValue(valeurAvant);
    await page.getByRole('button', { name: 'Valider' }).click();
    await expect(page.locator('#ecran-carte')).toBeHidden();
}

/**
 * Choisit la coordonnée d'un point de l'éditeur : sur grand écran (≥ 900 px,
 * même seuil que le CSS) un simple clic sur la carte intégrée suffit ; sur
 * mobile, c'est la carte plein écran habituelle.
 */
export async function choisirUneCoordonneePourUnPoint(page: Page, decalageX = 0): Promise<void> {
    if (page.viewportSize()!.width >= 900) {
        const carte = (await page.locator('#carte-points').boundingBox())!;
        await page.mouse.click(carte.x + carte.width / 2 + decalageX, carte.y + carte.height / 2);
        return;
    }
    await choisirUneCoordonneeSurLaCarte(page, decalageX);
}

/** Ajoute un point : clic sur l'image à la fraction donnée, puis choix de la coordonnée. */
export async function ajouterUnPoint(
    page: Page,
    fractionDeHauteur: number,
    decalageCarteX = 0,
): Promise<void> {
    // Scopé à la barre d'actions : le bouton flottant sur l'image partage le
    // même intitulé (voir e2e/points.spec.ts pour un test dédié à ce dernier).
    await page.locator('.barre-actions').getByRole('button', { name: 'Ajouter un point' }).click();
    await cliquerSurLImage(page, fractionDeHauteur);
    await choisirUneCoordonneePourUnPoint(page, decalageCarteX);
}

/** Défilement attendu pour placer une fraction de l'image à 75 % de l'écran. */
export async function defilementAttendu(page: Page, fraction: number): Promise<number> {
    // L'écran de suivi charge le trajet en asynchrone : attendre la pile d'images.
    await page.locator('#pile-suivi img').first().waitFor({ state: 'attached' });
    return page.evaluate((f) => {
        const image = document.querySelector<HTMLImageElement>('#pile-suivi img')!;
        const cadre = image.getBoundingClientRect();
        const cible = cadre.top + window.scrollY + f * cadre.height;
        const defilement = cible - 0.75 * window.innerHeight;
        const maximum = document.documentElement.scrollHeight - window.innerHeight;
        return Math.min(Math.max(0, maximum), Math.max(0, defilement));
    }, fraction);
}

export function defilementCourant(page: Page): Promise<number> {
    return page.evaluate(() => window.scrollY);
}

/** Attend que le défilement se stabilise sur la valeur attendue (scroll fluide). */
export async function attendreLeDefilement(page: Page, attendu: number): Promise<void> {
    await expect
        .poll(async () => Math.abs((await defilementCourant(page)) - attendu), { timeout: 15_000 })
        .toBeLessThan(15);
}
