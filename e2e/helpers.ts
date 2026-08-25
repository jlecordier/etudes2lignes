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

/**
 * La coordonnée d'un point, telle que son repère la porte : « 44.826,-0.556 ».
 *
 * Elle ne s'affiche nulle part — ni en clair dans l'écran, ni au survol : une
 * suite de décimales n'apprend rien à qui la lit. Elle reste sur le repère, où
 * le point est posé, et c'est ici que les scénarios la relisent. L'index compte
 * les repères dans l'ordre du document, de haut en bas.
 */
export async function coordonneeDuPoint(page: Page, index = 0): Promise<string> {
    return requireDefined(
        await page.locator('point-marker').nth(index).getAttribute('data-coordonnee'),
        `coordonnée du repère ${String(index + 1)}`,
    );
}

/**
 * Distance, en pixels, entre le marqueur numéroté demandé et le centre de la
 * carte intégrée. Zéro quand la carte est calée sur ce point.
 *
 * Les deux cadres sont mesurés dans la même image : le geste qui recentre la
 * carte lance aussi le défilement du schéma, et deux mesures successives
 * compareraient deux instants. Rend l'infini si l'un des deux manque, ce qui
 * fait échouer l'assertion au lieu de la faire passer par accident.
 */
export function ecartAuCentreDeLaCarte(page: Page, numero: string): Promise<number> {
    return page.evaluate((cherche) => {
        const carte = document.querySelector('#carte-points');
        const marqueur = [...document.querySelectorAll('#carte-points .carte-marker')].find(
            (candidat) => candidat.textContent === cherche,
        );
        if (carte === null || marqueur === undefined) {
            return Number.POSITIVE_INFINITY;
        }
        const cadreDeLaCarte = carte.getBoundingClientRect();
        const cadreDuMarqueur = marqueur.getBoundingClientRect();
        return Math.hypot(
            cadreDuMarqueur.x +
                cadreDuMarqueur.width / 2 -
                (cadreDeLaCarte.x + cadreDeLaCarte.width / 2),
            cadreDuMarqueur.y +
                cadreDuMarqueur.height / 2 -
                (cadreDeLaCarte.y + cadreDeLaCarte.height / 2),
        );
    }, numero);
}

/**
 * La hauteur d'un repère sur sa page, en pourcentage — ce que la liste des points
 * annonçait en toutes lettres, et qui se mesure désormais là où le point est
 * posé. L'index compte les repères de haut en bas dans le document.
 */
export async function hauteurDuRepere(page: Page, index = 0): Promise<number> {
    // Rend -1 plutôt que de lever quand les cadres manquent : chaque écriture
    // reconstruit la pile, et une mesure prise entre deux rendus doit être
    // réessayée par `expect.poll`, pas faire échouer le scénario.
    const repere = await page.locator('point-marker').nth(index).boundingBox();
    const zone = await page.locator('.image-area').nth(index).boundingBox();
    if (repere === null || zone === null || zone.height === 0) {
        return -1;
    }
    return Math.round(((repere.y - zone.y) / zone.height) * 100);
}

/** Une boîte mesurée à l'écran : de quoi dire « au-dessus de » et « centré sur ». */
export interface BoiteMesuree {
    readonly top: number;
    readonly bottom: number;
    readonly milieu: number;
    readonly width: number;
    readonly height: number;
}

/** Le repère d'un point sur l'image, pièce par pièce, et la pastille du même numéro sur la carte. */
export interface MesuresDuRepere {
    /** Le trait qui traverse la page à la hauteur du point. */
    readonly trait: BoiteMesuree;
    /** La pastille numérotée posée sur ce trait. */
    readonly pastille: BoiteMesuree;
    /** Les trois boutons flottants du repère. */
    readonly boutons: BoiteMesuree;
    /** La pastille du **même numéro** sur la carte intégrée. */
    readonly pastilleDeLaCarte: BoiteMesuree;
}

/**
 * Mesure le repère d'un point et la pastille du même point sur la carte.
 *
 * Les quatre boîtes sont prises dans la même image : schéma et carte répondent au
 * même geste, et quatre mesures successives compareraient quatre instants. Lève
 * dès qu'une pièce manque, plutôt que de rendre une comparaison vide qui
 * passerait toute seule. L'index compte les repères de haut en bas.
 */
export function mesuresDuRepere(page: Page, index = 0): Promise<MesuresDuRepere> {
    return page.evaluate((rang) => {
        const boite = (element: Element | null | undefined, quoi: string): BoiteMesuree => {
            if (element === null || element === undefined) {
                throw new Error(`${quoi} : rien à mesurer.`);
            }
            const cadre = element.getBoundingClientRect();
            return {
                top: cadre.top,
                bottom: cadre.bottom,
                milieu: cadre.top + cadre.height / 2,
                width: cadre.width,
                height: cadre.height,
            };
        };
        const reperes = document.querySelectorAll('point-marker');
        const repere = reperes[rang];
        if (repere === undefined) {
            throw new Error(`Repère ${rang + 1} introuvable : ${reperes.length} sur la page.`);
        }
        const pastille = repere.querySelector('.point-number');
        const numero = pastille?.textContent ?? '';
        return {
            trait: boite(repere, 'Trait du repère'),
            pastille: boite(pastille, 'Pastille du repère'),
            boutons: boite(repere.querySelector('.point-actions'), 'Boutons du repère'),
            pastilleDeLaCarte: boite(
                [...document.querySelectorAll('#carte-points .carte-marker')].find(
                    (candidat) => candidat.textContent === numero,
                ),
                `Pastille ${numero} sur la carte`,
            ),
        };
    }, index);
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

/**
 * L'identifiant du doigt synthétique de ces gestes — délibérément pas `1`.
 *
 * Mesuré sur WebKit (et donc sur `iphone`, qui en hérite) : après le défilement
 * programmatique de `positionOnImage`, le moteur ré-évalue le survol sous la
 * souris réelle de Playwright et lui fait émettre un `pointermove` — un
 * comportement WebKit connu, indépendant de cette suite. Ce pointeur-là porte
 * l'identifiant `1`, et `addsOnStack` (src/trajets/ui/addPointOnStack.ts)
 * suit un doigt par son `pointerId` : sous `1`, ce mouvement de souris
 * intégrait le geste et le faisait dériver hors de son seuil avant même
 * l'armement, sans qu'aucun doigt n'ait bougé. Rien à corriger côté
 * application — juste un identifiant de test qui n'a pas à collisionner avec
 * un pointeur réel du navigateur.
 */
const TOUCH_POINTER_ID = 1001;

/**
 * Arme un appui long sur l'image de l'éditeur, doigt encore posé : au retour,
 * le fantôme est monté et rien n'est encore décidé — c'est `relacherAppuiLong`
 * qui pose le point, à l'endroit renvoyé ici.
 *
 * Séparée du relâchement pour que les scénarios puissent observer l'état
 * intermédiaire — c'est exactement ce que fait le témoin du contextmenu
 * d'Android, dans `e2e/points.spec.ts`.
 *
 * Les événements sont **synthétisés**, et il n'y a pas d'alternative : Playwright
 * n'a aucune API pour maintenir un doigt — `touchscreen.tap` est instantané et
 * mono-doigt. `isTrusted` est donc faux, ce qui n'a pas d'incidence ici (aucun
 * code de l'application ne le lit), mais interdit de croire ce scénario
 * équivalent à un vrai doigt. La vérification réelle est un appareil.
 */
export async function armerAppuiLongSurLImage(
    page: Page,
    fractionOfHeight: number,
    visualIndex = 0,
): Promise<{ x: number; y: number }> {
    const { x, y } = await positionOnImage(page, fractionOfHeight, visualIndex);
    const cible = page.locator('schema-page').nth(visualIndex);
    await cible.dispatchEvent('pointerdown', {
        pointerId: TOUCH_POINTER_ID,
        pointerType: 'touch',
        clientX: x,
        clientY: y,
        button: 0,
        isPrimary: true,
    });
    // Plus que les 500 ms de LONG_PRESS_DELAY, pour laisser l'armement arriver.
    await page.waitForTimeout(700);
    // Témoin déplacé ici depuis la tâche 4 : jsdom ne charge aucune feuille de
    // style, donc les tests unitaires resteraient verts si `.point-ghost`
    // disparaissait de la règle de pointillé qu'il partage avec `point-marker`
    // (src/style.css) — le fantôme deviendrait invisible dans une vraie page
    // sans qu'aucun test ne le remarque. Lu ici, entre l'appui et le
    // relâchement, pendant que le fantôme existe encore. Précédent : commit
    // d98f179, qui fait constater un marqueur par un vrai navigateur.
    await expect(page.locator('.point-ghost')).toHaveCSS('border-top-style', 'dashed');
    return { x, y };
}

/** Relâche le doigt d'un appui long armé par `armerAppuiLongSurLImage`, à la position rendue. */
export async function relacherAppuiLong(
    page: Page,
    position: { x: number; y: number },
    visualIndex = 0,
): Promise<void> {
    const cible = page.locator('schema-page').nth(visualIndex);
    await cible.dispatchEvent('pointerup', {
        pointerId: TOUCH_POINTER_ID,
        pointerType: 'touch',
        clientX: position.x,
        clientY: position.y,
    });
}

/** Un appui long sur l'image de l'éditeur, du doigt posé au doigt relâché : pose un point à cette fraction. */
export async function appuiLongSurLImage(
    page: Page,
    fractionOfHeight: number,
    visualIndex = 0,
): Promise<void> {
    const position = await armerAppuiLongSurLImage(page, fractionOfHeight, visualIndex);
    await relacherAppuiLong(page, position, visualIndex);
}

/**
 * Le `contextmenu` qu'Android émet nativement pendant un appui long, doigt
 * encore posé — synthétisé, pour dispatcher un événement à la position
 * voulue **pendant** un geste armé par `armerAppuiLongSurLImage`.
 *
 * Construit à la main plutôt que via `dispatchEvent` de Playwright :
 * `contextmenu` est absent de la table d'événements qu'il connait (mesuré
 * dans ses sources), donc il retombe sur un `Event` nu — sans `clientX` ni
 * `clientY` — et l'application levait alors « Fraction verticale invalide :
 * NaN » en tentant de situer un événement sans position.
 */
export async function dispatcherContextmenu(
    page: Page,
    position: { x: number; y: number },
    visualIndex = 0,
): Promise<void> {
    const cible = page.locator('schema-page').nth(visualIndex);
    await cible.evaluate((element, { x, y }) => {
        element.dispatchEvent(
            new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                clientX: x,
                clientY: y,
                button: 2,
            }),
        );
    }, position);
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
export function isLargeScreen(page: Page): Promise<boolean> {
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
            throw new Error("--fraction-position absente : l'écran de suivi ne l'a pas posée.");
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
