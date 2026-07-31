import { expect, type Page } from '@playwright/test';

/** PNG transparent de 1×1 pixel : suffisant pour tester l'import sans fixture lourde. */
export const PNG_1X1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
);

export function fichierPng(nom: string): { name: string; mimeType: string; buffer: Buffer } {
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
    page.once('dialog', (dialogue) => void dialogue.accept('Paris → Bordeaux'));
    await page.getByRole('button', { name: 'Nouveau trajet' }).click();
    await page.getByRole('button', { name: 'Paris → Bordeaux', exact: true }).click();
    // L'éditeur charge le trajet en asynchrone : attendre qu'il soit prêt
    // (le titre apparaît en fin de chargement) avant d'agir.
    await expect(page.getByRole('heading', { name: 'Paris → Bordeaux' })).toBeVisible();
}

/** Crée un trajet, l'ouvre dans l'éditeur et importe une page. */
export async function ouvrirUnTrajetAvecUnePage(page: Page): Promise<void> {
    await ouvrirUnTrajetVierge(page);
    await page.locator('#input-images').setInputFiles([fichierPng('page-1.png')]);
    await expect(page.locator('.nom-image')).toHaveText(['page-1.png']);
}

/** Renvoie une valeur attendue (cadre, viewport, texte, correspondance…) ou échoue clairement. */
export function mesure<T>(valeur: T | null | undefined, quoi: string): T {
    if (valeur === null || valeur === undefined) {
        throw new Error(`Valeur attendue absente : ${quoi}.`);
    }
    return valeur;
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
    const viewport = mesure(page.viewportSize(), 'viewport');
    let cadre = mesure(await zone.boundingBox(), 'cadre de la zone');
    const decalage = cadre.y + cadre.height * fractionDeHauteur - viewport.height / 2;
    await page.evaluate((delta) => {
        window.scrollBy(0, delta);
    }, decalage);
    cadre = mesure(await zone.boundingBox(), 'cadre de la zone');
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
    const carte = mesure(await page.locator('#conteneur-carte').boundingBox(), 'cadre de la carte');
    await page.mouse.click(carte.x + carte.width / 2 + decalageX, carte.y + carte.height / 2);
    // Le clic n'est pris en compte que lorsque le marqueur a bougé : attendre
    // que la saisie reflète la nouvelle longitude avant de valider.
    await expect(champLongitude).not.toHaveValue(valeurAvant);
    await page.getByRole('button', { name: 'Valider' }).click();
    await expect(page.locator('#ecran-carte')).toBeHidden();
}

/** Le seuil du grand écran n'est écrit qu'une fois, dans la feuille de style. */
function surGrandEcran(page: Page): Promise<boolean> {
    return page.evaluate(
        () =>
            getComputedStyle(document.documentElement).getPropertyValue('--grand-ecran').trim() ===
            '1',
    );
}

/**
 * Choisit la coordonnée d'un point de l'éditeur : sur grand écran, un simple
 * clic sur la carte intégrée suffit ; sur mobile, c'est la carte plein écran
 * habituelle. C'est le CSS qui dit lequel des deux, comme pour l'application.
 */
export async function choisirUneCoordonneePourUnPoint(page: Page, decalageX = 0): Promise<void> {
    if (await surGrandEcran(page)) {
        const carte = mesure(
            await page.locator('#carte-points').boundingBox(),
            'cadre de la carte intégrée',
        );
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

/**
 * Défilement attendu pour amener une fraction de l'image sur le repère.
 *
 * La fraction d'écran visée n'est pas recopiée ici : elle vient du domaine
 * (`FRACTION_D_ECRAN_DE_LA_POSITION`), que l'écran de suivi pose sur `:root`.
 * Un test qui répète la règle qu'il vérifie ne vérifie rien.
 */
export async function defilementAttendu(page: Page, fractionDeLImage: number): Promise<number> {
    // L'écran de suivi charge le trajet en asynchrone : attendre la pile d'images.
    await page.locator('#pile-suivi img').first().waitFor({ state: 'attached' });
    return page.evaluate((fraction) => {
        const image = document.querySelector<HTMLImageElement>('#pile-suivi img');
        if (image === null) {
            throw new Error('#pile-suivi img introuvable');
        }
        const fractionDEcran = Number.parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue('--fraction-position'),
        );
        if (!Number.isFinite(fractionDEcran)) {
            throw new Error('--fraction-position absente : l’écran de suivi ne l’a pas posée.');
        }
        const cadre = image.getBoundingClientRect();
        const cible = cadre.top + window.scrollY + fraction * cadre.height;
        const defilement = cible - fractionDEcran * window.innerHeight;
        const maximum = document.documentElement.scrollHeight - window.innerHeight;
        return Math.min(Math.max(0, maximum), Math.max(0, defilement));
    }, fractionDeLImage);
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
