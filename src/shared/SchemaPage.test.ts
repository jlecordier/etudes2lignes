// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { DisplayablePage } from './DisplayedPage';
import { SchemaPageElement, createSchemaPage, type ObjectUrls } from './SchemaPage';

/** URL d'objet à la main : le test observe ce qui est réellement créé et libéré. */
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

/** L'image montée dans le shadow root, ou l'échec de la trouver. */
function image(element: SchemaPageElement): HTMLImageElement {
    const trouvee = element.shadowRoot?.querySelector('img');
    if (!(trouvee instanceof HTMLImageElement)) {
        throw new Error('La page affichée ne porte aucune image.');
    }
    return trouvee;
}

/** Laisse passer la microtâche qui décide de libérer, ou non, l'URL. */
function laisserPasserLaMicrotache(): Promise<void> {
    return Promise.resolve();
}

let container: HTMLDivElement;
let urls: TrackedUrls;

beforeEach(() => {
    container = document.createElement('div');
    document.body.replaceChildren(container);
    urls = new TrackedUrls();
});

describe('schema-page', () => {
    describe('Étant donné une page, quand je l’attache au document', () => {
        it('alors elle affiche l’image de la page, sous son nom', () => {
            const element = createSchemaPage(page('a', 'page-1.jpg'), urls);

            container.append(element);

            expect(image(element).alt).toBe('page-1.jpg');
            expect(image(element).getAttribute('src')).toBe('blob:page-1');
        });

        it('alors les dimensions sont réservées avant tout décodage', () => {
            const element = createSchemaPage(page('a'), urls);

            container.append(element);

            expect([image(element).width, image(element).height]).toEqual([2481, 3508]);
            // Lus sur l'attribut : le gabarit les porte, et jsdom ne reflète pas
            // toutes les propriétés IDL — l'attribut, lui, est vrai partout.
            expect(image(element).getAttribute('loading')).toBe('lazy');
            expect(image(element).getAttribute('decoding')).toBe('async');
        });

        it('alors l’image n’est pas glissable nativement', () => {
            const element = createSchemaPage(page('a'), urls);

            container.append(element);

            // Une image l'est par défaut : sans ce `false`, saisir la pastille
            // d'un point posée dessus et bouger la souris démarre le glisser
            // natif de l'image plutôt que celui du point — le navigateur répond
            // par un `pointercancel` qui tue le geste avant son premier
            // mouvement (mesuré sur cinq navigateurs, voir SchemaPage.html).
            expect(image(element).draggable).toBe(false);
        });
    });

    describe('Étant donné une page attachée, quand je la détache', () => {
        it('alors son URL d’objet est libérée', async () => {
            const element = createSchemaPage(page('a'), urls);
            container.append(element);

            element.remove();
            await laisserPasserLaMicrotache();

            expect(urls.aliveUrls()).toEqual([]);
        });

        it('alors son image quitte le document : révoquer seul ne libère rien', async () => {
            const element = createSchemaPage(page('a'), urls);
            container.append(element);

            element.remove();
            await laisserPasserLaMicrotache();

            // Le cœur de l'affaire : une page décodée pèse une trentaine de
            // mégaoctets, et elle reste en mémoire tant que le <img> est là.
            expect(element.shadowRoot?.querySelector('img')).toBeNull();
        });
    });

    describe('Étant donné une page attachée, quand je la déplace dans le document', () => {
        it('alors son URL survit au déplacement', async () => {
            const element = createSchemaPage(page('a'), urls);
            container.append(element);
            const avant = image(element);
            const ailleurs = document.createElement('div');
            document.body.append(ailleurs);

            // Détachement puis rattachement dans la même tâche : c'est ce que
            // fait replaceChildren, et ce que `moveBefore()` fera proprement.
            ailleurs.append(element);
            await laisserPasserLaMicrotache();

            expect(urls.aliveUrls()).toEqual(['blob:page-1']);
            expect(image(element)).toBe(avant);
        });
    });

    describe('Étant donné une page détachée, quand je la rattache', () => {
        it('alors elle reprend une URL neuve, et une seule', async () => {
            const element = createSchemaPage(page('a'), urls);
            container.append(element);
            element.remove();
            await laisserPasserLaMicrotache();

            container.append(element);

            expect(urls.aliveUrls()).toEqual(['blob:page-2']);
            expect(image(element).getAttribute('src')).toBe('blob:page-2');
        });
    });

    describe('Étant donné plusieurs pages rendues d’un coup', () => {
        it('alors remplacer la pile libère les anciennes et pas les nouvelles', async () => {
            container.replaceChildren(
                createSchemaPage(page('a'), urls),
                createSchemaPage(page('b'), urls),
            );

            container.replaceChildren(createSchemaPage(page('c'), urls));
            await laisserPasserLaMicrotache();

            expect(urls.aliveUrls()).toEqual(['blob:page-3']);
        });
    });

    describe('Étant donné une page, quand je demande son identifiant', () => {
        it('alors elle rend celui de la page affichée', () => {
            const element = createSchemaPage(page('a'), urls);

            expect(element.pageId).toBe('a');
        });

        it('alors un élément fabriqué à la main, sans page, le dit clairement', () => {
            const nu = new SchemaPageElement();

            expect(() => nu.pageId).toThrow('sans sa configuration');
        });
    });
});
