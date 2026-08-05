// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { query } from '../../shared/dom';
import {
    createOverviewPage,
    overviewPageId,
    paintOverviewPage,
    OVERVIEW_BACKING_WIDTH,
} from './OverviewPage';

/** Un bitmap qui dit quand on le relâche : c'est tout ce qu'on veut observer. */
class FauxBitmap implements ImageBitmap {
    readonly width = 2481;
    readonly height = 3508;
    ferme = false;

    close(): void {
        this.ferme = true;
    }
}

let decodages: ((bitmap: ImageBitmap) => void)[];
let decodageOriginal: typeof createImageBitmap;

function unePage(): { id: string; nom: string; blob: Blob; largeur: number; hauteur: number } {
    return {
        id: 'page-1',
        nom: 'page-1.jpg',
        blob: new Blob(['page']),
        largeur: 2481,
        hauteur: 3508,
    };
}

beforeEach(() => {
    document.body.replaceChildren();
    // jsdom n'a pas de canevas : sans cette réponse, il annonce lui-même que
    // `getContext` n'est pas implémenté, ce qui salit la sortie des tests. Le
    // `null` est justement ce que la vignette sait traiter.
    HTMLCanvasElement.prototype.getContext = () => null;
    decodages = [];
    decodageOriginal = globalThis.createImageBitmap;
    // jsdom ne décode rien : on tient la promesse à la main pour observer la
    // vignette avant **et** après l'arrivée de son décodage.
    globalThis.createImageBitmap = () =>
        new Promise((resolve) => {
            decodages.push(resolve);
        });
});

afterEach(() => {
    globalThis.createImageBitmap = decodageOriginal;
});

/** Livre la vignette au décodage en attente. */
function livrerLeDecodage(): FauxBitmap {
    const bitmap = new FauxBitmap();
    const resolve = decodages.shift();
    if (resolve === undefined) {
        throw new Error('Aucun décodage en attente.');
    }
    resolve(bitmap);
    return bitmap;
}

describe('createOverviewPage', () => {
    describe('Étant donné une page', () => {
        it('alors la boîte de la vignette est réservée, et rien n’est décodé', () => {
            const element = createOverviewPage(unePage());
            document.body.append(element);

            // La mise en page est figée tout de suite : sans cela, les offsets que
            // l'aperçu mesure changeraient à l'arrivée de chaque vignette. Et le
            // décodage n'a pas commencé — c'est l'écran qui le déclenche, page par
            // page, pour ne jamais tenir deux pages pleine taille à la fois.
            const canvas = query('canvas', HTMLCanvasElement, element);
            expect(canvas.width).toBe(OVERVIEW_BACKING_WIDTH);
            expect(canvas.height).toBe(Math.round((OVERVIEW_BACKING_WIDTH * 3508) / 2481));
            expect(decodages).toHaveLength(0);
        });

        it('alors la vignette dit quelle page elle montre', () => {
            const element = createOverviewPage(unePage());

            expect(overviewPageId(element)).toBe('page-1');
        });
    });

    describe('Étant donné une vignette fabriquée à la main, sans identifiant', () => {
        it('alors la lire échoue au lieu de rendre une page inconnue', () => {
            const element = document.createElement('overview-page');
            if (!(element instanceof HTMLElement)) {
                throw new Error('Élément inattendu.');
            }

            expect(() => overviewPageId(element)).toThrow(/identifiant de page/);
        });
    });
});

describe('paintOverviewPage', () => {
    describe('Étant donné une vignette qu’on peint', () => {
        it('alors la page pleine taille est relâchée dès son décodage obtenu', async () => {
            const page = unePage();
            const element = createOverviewPage(page);
            document.body.append(element);

            const peinture = paintOverviewPage(element, page.blob);
            const bitmap = livrerLeDecodage();
            await peinture;

            // C'est tout l'intérêt du canevas : la page pleine taille ne vit que le
            // temps de peindre sa vignette, jamais celui de l'écran.
            expect(bitmap.ferme).toBe(true);
        });

        it('alors la relâche vaut même pour une vignette détachée entre-temps', async () => {
            const page = unePage();
            const element = createOverviewPage(page);
            document.body.append(element);

            const peinture = paintOverviewPage(element, page.blob);
            element.remove();
            const bitmap = livrerLeDecodage();
            await peinture;

            expect(bitmap.ferme).toBe(true);
        });
    });
});
