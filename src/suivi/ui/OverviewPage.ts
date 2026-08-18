/**
 * Une page du schéma dans l'aperçu du trajet : une **vignette**, peinte une fois
 * dans un canevas, et non l'image entière une seconde fois.
 *
 * Mesuré sur un trajet réel (`PMP-BX`, 6 pages de 2481 × 3508) : afficher les
 * mêmes `<img>` une seconde fois dans l'aperçu coûtait **+183 Mo** de mémoire de
 * rendu, et ne les rendait pas en refermant l'aperçu — le navigateur décode à la
 * taille source, pas à celle de l'affichage. Une page décodée pèse 35 Mo, et la
 * colonne les montre toutes à la fois là où la pile qui défile n'en décode que ce
 * qui approche du pli.
 *
 * Le canevas retourne le problème : la page pleine taille ne vit que le temps de
 * peindre sa vignette, puis est relâchée (`ImageBitmap.close()`). Ce qui reste
 * tient dans `OVERVIEW_BACKING_WIDTH × ratio × 4` octets par page — quelques
 * centaines de kilo-octets pour tout un trajet.
 *
 * Un canevas **par page**, et non un seul pour la pile : l'aperçu garde ainsi un
 * élément mesurable par page, donc la barre de position continue de se placer sur
 * des offsets mesurés, exactement comme dans la pile qui défile.
 *
 * La vignette est **bâtie par sa fabrique**, sans `connectedCallback` : elle ne
 * retient rien qu'il faille relâcher en partant, et l'[ADR 0008](../../../docs/adr/0008-interface-en-custom-elements-natifs.md)
 * réserve le cycle de vie aux feuilles qui, comme `schema-page`, possèdent une
 * ressource. Rien n'est donc différé, et une vignette ne peut pas exister sans
 * savoir quelle page elle montre.
 */
import type { DisplayablePage } from '../../shared/DisplayedPage';
import { query } from '../../shared/dom';

/**
 * Largeur du fond de canevas : deux fois le plafond d'affichage de la colonne
 * (`12rem`), de quoi rester net sur un écran à 2× sans payer la page entière.
 * La colonne fait le plus souvent moins de 100 px de large.
 */
export const OVERVIEW_BACKING_WIDTH = 384;

/** Une page du schéma en réduction dans l'aperçu. */
export class OverviewPageElement extends HTMLElement {}

customElements.define('overview-page', OverviewPageElement);

/**
 * La vignette d'une page : sa boîte est réservée tout de suite, depuis les
 * dimensions que porte l'agrégat. **Rien n'est décodé ici** — la géométrie est
 * donc figée avant la première vignette, ce qui garde stables les offsets que
 * l'aperçu mesure.
 */
export function createOverviewPage(page: DisplayablePage): OverviewPageElement {
    const element = new OverviewPageElement();
    element.dataset['pageId'] = page.id;

    const canvas = document.createElement('canvas');
    canvas.width = OVERVIEW_BACKING_WIDTH;
    canvas.height = Math.max(1, Math.round((OVERVIEW_BACKING_WIDTH * page.hauteur) / page.largeur));
    element.append(canvas);
    return element;
}

/** L'identifiant de la page qu'une vignette montre, pour la retrouver dans la pile. */
export function overviewPageId(element: OverviewPageElement): string {
    const pageId = element.dataset['pageId'];
    if (pageId === undefined) {
        throw new Error(
            "Vignette d'aperçu sans identifiant de page : sa fabrique est le seul moyen d'en obtenir une.",
        );
    }
    return pageId;
}

/**
 * Décode la page, en peint la vignette, et relâche le décodage.
 *
 * À appeler **une page à la fois** : c'est ce qui garde le pic mémoire à une seule
 * page pleine taille, là où des vignettes construites en parallèle décoderaient
 * tout le trajet d'un coup — précisément ce que le canevas évite.
 */
export async function paintOverviewPage(element: OverviewPageElement, blob: Blob): Promise<void> {
    const canvas = query('canvas', HTMLCanvasElement, element);
    const bitmap = await createImageBitmap(blob);
    try {
        // Absent hors navigateur : la vignette ne se peint pas, la boîte reste
        // réservée, et rien ne casse.
        canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    } finally {
        bitmap.close();
    }
}
