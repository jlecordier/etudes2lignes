// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { createPageStack, type DisplayablePage, type ObjectUrls } from './pageStack';

/** URL d'objet à la main : le test observe ce qui est réellement libéré. */
class TrackedUrls implements ObjectUrls {
    private next = 1;
    private readonly vivantes = new Set<string>();

    create(): string {
        const url = `blob:page-${String(this.next++)}`;
        this.vivantes.add(url);
        return url;
    }

    revoke(url: string): void {
        this.vivantes.delete(url);
    }

    aliveUrls(): string[] {
        return [...this.vivantes];
    }
}

function page(id: string, nom = `${id}.jpg`): DisplayablePage {
    return { id, nom, blob: new Blob(['page']), largeur: 2481, hauteur: 3508 };
}

let container: HTMLDivElement;
let urls: TrackedUrls;

beforeEach(() => {
    container = document.createElement('div');
    document.body.replaceChildren(container);
    urls = new TrackedUrls();
});

describe('pageStack', () => {
    describe('Étant donné deux pages, quand je les rends', () => {
        it('alors le conteneur porte leurs images, dans l’ordre donné', () => {
            const stack = createPageStack(container, urls);

            stack.render([page('a', 'page-1.jpg'), page('b', 'page-2.jpg')]);

            const images = [...container.querySelectorAll('img')];
            expect(images.map((image) => image.alt)).toEqual(['page-1.jpg', 'page-2.jpg']);
        });

        it('alors les dimensions sont réservées avant tout décodage', () => {
            const stack = createPageStack(container, urls);

            stack.render([page('a')]);

            const image = stack.pageElement('a');
            expect([image.width, image.height]).toEqual([2481, 3508]);
            expect(image.loading).toBe('lazy');
        });
    });

    describe('Étant donné une pile rendue, quand je la rends à nouveau', () => {
        it('alors les URL du rendu précédent sont libérées, pas celles du nouveau', () => {
            const stack = createPageStack(container, urls);

            stack.render([page('a'), page('b')]);
            const afterFirstRender = urls.aliveUrls();
            stack.render([page('c')]);

            expect(afterFirstRender).toHaveLength(2);
            expect(urls.aliveUrls()).toEqual(['blob:page-3']);
        });
    });

    describe('Étant donné une pile rendue, quand je la détruis', () => {
        it('alors les URL sont libérées ET le conteneur est vidé', () => {
            const stack = createPageStack(container, urls);
            stack.render([page('a'), page('b')]);

            stack.destroy();

            expect(urls.aliveUrls()).toEqual([]);
            // Le cœur du correctif : révoquer sans retirer les <img> ne libérait
            // pas les pages décodées, qui pèsent des dizaines de mégaoctets.
            expect(container.querySelectorAll('img')).toHaveLength(0);
        });
    });

    describe('Étant donné une pile rendue, quand je demande l’image d’une page', () => {
        it('alors j’obtiens celle qui est affichée', () => {
            const stack = createPageStack(container, urls);
            stack.render([page('a'), page('b')]);

            expect(stack.pageElement('b').alt).toBe('b.jpg');
        });

        it('alors une page absente de la pile est refusée en la nommant', () => {
            const stack = createPageStack(container, urls);
            stack.render([page('a')]);

            expect(() => stack.pageElement('inconnue')).toThrow(
                'Page absente de la pile affichée : inconnue',
            );
        });

        it('alors une page retirée par un nouveau rendu n’est plus trouvée', () => {
            const stack = createPageStack(container, urls);
            stack.render([page('a')]);
            stack.render([page('b')]);

            expect(() => stack.pageElement('a')).toThrow('Page absente');
        });
    });

    describe('Étant donné un habillage, quand je rends les pages', () => {
        it('alors chaque image est posée dans son habillage, et reste retrouvable', () => {
            const stack = createPageStack(container, urls);

            stack.render([page('a'), page('b')], (pageToDecorate, image) => {
                const frame = document.createElement('div');
                frame.className = 'image-frame';
                frame.dataset['page'] = pageToDecorate.id;
                frame.append(image);
                return frame;
            });

            const frames = [...container.querySelectorAll('.image-frame')];
            expect(frames.map((frame) => frame.getAttribute('data-page'))).toEqual(['a', 'b']);
            expect(stack.pageElement('a').parentElement?.className).toBe('image-frame');
        });

        it('alors détruire vide tout l’habillage, pas seulement les images', () => {
            const stack = createPageStack(container, urls);
            stack.render([page('a')], (_page, image) => {
                const frame = document.createElement('div');
                frame.append(image);
                return frame;
            });

            stack.destroy();

            expect(container.children).toHaveLength(0);
            expect(urls.aliveUrls()).toEqual([]);
        });
    });

    describe('Étant donné une pile détruite, quand je la détruis encore', () => {
        it('alors rien ne casse et rien n’est libéré deux fois', () => {
            const stack = createPageStack(container, urls);
            stack.render([page('a')]);

            stack.destroy();
            stack.destroy();

            expect(urls.aliveUrls()).toEqual([]);
        });
    });
});
