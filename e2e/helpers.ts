import { expect, type Page } from '@playwright/test';

/** PNG transparent de 1×1 pixel : suffisant pour tester l'import sans fixture lourde. */
export const PNG_1X1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
);

export function pngFile(nom: string): { name: string; mimeType: string; buffer: Buffer } {
    return { name: nom, mimeType: 'image/png', buffer: PNG_1X1 };
}

/**
 * Ouvre l'application, tuiles OpenStreetMap coupées : la carte reste grise mais
 * fonctionne, les tests ne dépendent pas du réseau — et n'aillent pas solliciter
 * les serveurs de l'OSMF à chaque exécution, sur chaque navigateur.
 *
 * **Tout** parcours de test passe par ici : une variante recopiée avait perdu ce
 * blocage, et cinq tests × cinq navigateurs téléchargeaient des tuiles pour rien.
 */
export async function preparerLApplication(page: Page): Promise<void> {
    await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
    await page.goto('./');
}

/** Crée un trajet et l'ouvre dans l'éditeur, sans page importée. */
export async function ouvrirUnTrajetVierge(page: Page): Promise<void> {
    await preparerLApplication(page);
    page.once('dialog', (dialog) => void dialog.accept('Paris → Bordeaux'));
    await page.getByRole('button', { name: 'Nouveau trajet' }).click();
    await page.getByRole('button', { name: 'Paris → Bordeaux', exact: true }).click();
    // L'éditeur charge le trajet en asynchrone : attendre qu'il soit prêt
    // (le titre apparaît en fin de chargement) avant d'agir.
    await expect(page.getByRole('heading', { name: 'Paris → Bordeaux' })).toBeVisible();
}

/** Crée un trajet, l'ouvre dans l'éditeur et importe une page. */
export async function ouvrirUnTrajetAvecUnePage(page: Page): Promise<void> {
    await ouvrirUnTrajetVierge(page);
    await page.locator('#input-images').setInputFiles([pngFile('page-1.png')]);
    await expect(page.locator('.image-name')).toHaveText(['page-1.png']);
}

/** Renvoie une valeur attendue (cadre, viewport, texte, correspondance…) ou échoue clairement. */
export function requireDefined<T>(value: T | null | undefined, label: string): T {
    if (value === null || value === undefined) {
        throw new Error(`Valeur attendue absente : ${label}.`);
    }
    return value;
}

/** Centre la fraction visée de l'image dans le viewport et renvoie ses coordonnées écran. */
async function positionOnImage(
    page: Page,
    fractionOfHeight: number,
    visualIndex: number,
): Promise<{ x: number; y: number }> {
    const area = page.locator('.image-area').nth(visualIndex);
    await area.scrollIntoViewIfNeeded();
    // L'image de test s'étire en pleine largeur : le point visé peut être sous
    // le pli. On centre la cible dans le viewport avant de cliquer.
    const viewport = requireDefined(page.viewportSize(), 'viewport');
    let frame = requireDefined(await area.boundingBox(), 'cadre de la zone');
    const decalage = frame.y + frame.height * fractionOfHeight - viewport.height / 2;
    await page.evaluate((delta) => {
        window.scrollBy(0, delta);
    }, decalage);
    frame = requireDefined(await area.boundingBox(), 'cadre de la zone');
    return { x: frame.x + frame.width / 2, y: frame.y + frame.height * fractionOfHeight };
}

/** Clique sur l'image de l'éditeur à une fraction de sa hauteur. */
export async function cliquerSurLImage(
    page: Page,
    fractionOfHeight: number,
    visualIndex = 0,
): Promise<void> {
    const { x, y } = await positionOnImage(page, fractionOfHeight, visualIndex);
    await page.mouse.click(x, y);
}

/** Clic droit sur l'image de l'éditeur : ajoute un point directement à cette fraction. */
export async function clicDroitSurLImage(
    page: Page,
    fractionOfHeight: number,
    visualIndex = 0,
): Promise<void> {
    const { x, y } = await positionOnImage(page, fractionOfHeight, visualIndex);
    await page.mouse.click(x, y, { button: 'right' });
}

/** Choisit une coordonnée sur la carte ouverte (clic au centre + décalage). */
export async function choisirUneCoordonneeSurLaCarte(page: Page, shiftX = 0): Promise<void> {
    await expect(page.locator('#screen-carte')).toBeVisible();
    // Le décalage du clic est horizontal : c'est la longitude qui doit changer.
    const longitudeInput = page.getByLabel('Longitude');
    const valueBefore = await longitudeInput.inputValue();
    const carte = requireDefined(
        await page.locator('#carte-container').boundingBox(),
        'cadre de la carte',
    );
    await page.mouse.click(carte.x + carte.width / 2 + shiftX, carte.y + carte.height / 2);
    // Le clic n'est pris en compte que lorsque le marqueur a bougé : attendre
    // que la saisie reflète la nouvelle longitude avant de valider.
    await expect(longitudeInput).not.toHaveValue(valueBefore);
    await page.getByRole('button', { name: 'Valider' }).click();
    await expect(page.locator('#screen-carte')).toBeHidden();
}

/** Le seuil du grand écran n'est écrit qu'une fois, dans la feuille de style. */
function isLargeScreen(page: Page): Promise<boolean> {
    return page.evaluate(
        () =>
            getComputedStyle(document.documentElement).getPropertyValue('--large-screen').trim() ===
            '1',
    );
}

/**
 * Choisit la coordonnée d'un point de l'éditeur : sur grand écran, un simple
 * clic sur la carte intégrée suffit ; sur mobile, c'est la carte plein écran
 * habituelle. C'est le CSS qui dit lequel des deux, comme pour l'application.
 */
export async function choisirUneCoordonneePourUnPoint(page: Page, shiftX = 0): Promise<void> {
    if (await isLargeScreen(page)) {
        const carte = requireDefined(
            await page.locator('#carte-points').boundingBox(),
            'cadre de la carte intégrée',
        );
        await page.mouse.click(carte.x + carte.width / 2 + shiftX, carte.y + carte.height / 2);
        return;
    }
    await choisirUneCoordonneeSurLaCarte(page, shiftX);
}

/** Ajoute un point : clic sur l'image à la fraction donnée, puis choix de la coordonnée. */
export async function ajouterUnPoint(
    page: Page,
    fractionOfHeight: number,
    carteShiftX = 0,
): Promise<void> {
    // Scopé à la barre d'actions : le bouton flottant sur l'image partage le
    // même intitulé (voir e2e/points.spec.ts pour un test dédié à ce dernier).
    await page.locator('.action-bar').getByRole('button', { name: 'Ajouter un point' }).click();
    await cliquerSurLImage(page, fractionOfHeight);
    await choisirUneCoordonneePourUnPoint(page, carteShiftX);
}

/**
 * Défilement attendu pour amener une fraction de l'image sur le repère.
 *
 * La fraction d'écran visée n'est pas recopiée ici : elle vient du domaine
 * (`POSITION_VIEWPORT_FRACTION`), que l'écran de suivi pose sur `:root`.
 * Un test qui répète la règle qu'il vérifie ne vérifie rien.
 */
export async function expectedScroll(page: Page, imageFraction: number): Promise<number> {
    // L'écran de suivi charge le trajet en asynchrone : attendre la pile d'images.
    await page.locator('#suivi-stack schema-page').first().waitFor({ state: 'attached' });
    return page.evaluate((fraction) => {
        // On mesure la page, pas l'image qu'elle contient : celle-ci vit dans un
        // shadow root, que `querySelector` ne traverse pas. Les deux boîtes sont
        // la même (l'hôte est en `display: block`, l'image le remplit), et c'est
        // bien la page que l'écran de suivi mesure lui aussi.
        const image = document.querySelector('#suivi-stack schema-page');
        if (image === null) {
            throw new Error('#suivi-stack schema-page introuvable');
        }
        const screenFraction = Number.parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue('--fraction-position'),
        );
        if (!Number.isFinite(screenFraction)) {
            throw new Error('--fraction-position absente : l’écran de suivi ne l’a pas posée.');
        }
        const frame = image.getBoundingClientRect();
        const target = frame.top + window.scrollY + fraction * frame.height;
        const scroll = target - screenFraction * window.innerHeight;
        const maximum = document.documentElement.scrollHeight - window.innerHeight;
        return Math.min(Math.max(0, maximum), Math.max(0, scroll));
    }, imageFraction);
}

export function currentScroll(page: Page): Promise<number> {
    return page.evaluate(() => window.scrollY);
}

/** Attend que le défilement se stabilise sur la valeur attendue (scroll fluide). */
export async function waitForScroll(page: Page, attendu: number): Promise<void> {
    await expect
        .poll(async () => Math.abs((await currentScroll(page)) - attendu), { timeout: 15_000 })
        .toBeLessThan(15);
}
