// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { creerPileDePages, type PageAAfficher, type UrlsDObjet } from './pileDePages';

/** URL d'objet à la main : le test observe ce qui est réellement libéré. */
class UrlsSuivies implements UrlsDObjet {
    private suivante = 1;
    private readonly vivantes = new Set<string>();

    creer(): string {
        const url = `blob:page-${String(this.suivante++)}`;
        this.vivantes.add(url);
        return url;
    }

    revoquer(url: string): void {
        this.vivantes.delete(url);
    }

    urlsVivantes(): string[] {
        return [...this.vivantes];
    }
}

function page(id: string, nom = `${id}.jpg`): PageAAfficher {
    return { id, nom, blob: new Blob(['page']), largeur: 2481, hauteur: 3508 };
}

let conteneur: HTMLDivElement;
let urls: UrlsSuivies;

beforeEach(() => {
    conteneur = document.createElement('div');
    document.body.replaceChildren(conteneur);
    urls = new UrlsSuivies();
});

describe('pileDePages', () => {
    describe('Étant donné deux pages, quand je les rends', () => {
        it('alors le conteneur porte leurs images, dans l’ordre donné', () => {
            const pile = creerPileDePages(conteneur, urls);

            pile.rendre([page('a', 'page-1.jpg'), page('b', 'page-2.jpg')]);

            const images = [...conteneur.querySelectorAll('img')];
            expect(images.map((image) => image.alt)).toEqual(['page-1.jpg', 'page-2.jpg']);
        });

        it('alors les dimensions sont réservées avant tout décodage', () => {
            const pile = creerPileDePages(conteneur, urls);

            pile.rendre([page('a')]);

            const image = pile.elementDeLaPage('a');
            expect([image.width, image.height]).toEqual([2481, 3508]);
            expect(image.loading).toBe('lazy');
        });
    });

    describe('Étant donné une pile rendue, quand je la rends à nouveau', () => {
        it('alors les URL du rendu précédent sont libérées, pas celles du nouveau', () => {
            const pile = creerPileDePages(conteneur, urls);

            pile.rendre([page('a'), page('b')]);
            const apresLePremierRendu = urls.urlsVivantes();
            pile.rendre([page('c')]);

            expect(apresLePremierRendu).toHaveLength(2);
            expect(urls.urlsVivantes()).toEqual(['blob:page-3']);
        });
    });

    describe('Étant donné une pile rendue, quand je la détruis', () => {
        it('alors les URL sont libérées ET le conteneur est vidé', () => {
            const pile = creerPileDePages(conteneur, urls);
            pile.rendre([page('a'), page('b')]);

            pile.detruire();

            expect(urls.urlsVivantes()).toEqual([]);
            // Le cœur du correctif : révoquer sans retirer les <img> ne libérait
            // pas les pages décodées, qui pèsent des dizaines de mégaoctets.
            expect(conteneur.querySelectorAll('img')).toHaveLength(0);
        });
    });

    describe('Étant donné une pile rendue, quand je demande l’image d’une page', () => {
        it('alors j’obtiens celle qui est affichée', () => {
            const pile = creerPileDePages(conteneur, urls);
            pile.rendre([page('a'), page('b')]);

            expect(pile.elementDeLaPage('b').alt).toBe('b.jpg');
        });

        it('alors une page absente de la pile est refusée en la nommant', () => {
            const pile = creerPileDePages(conteneur, urls);
            pile.rendre([page('a')]);

            expect(() => pile.elementDeLaPage('inconnue')).toThrow(
                'Page absente de la pile affichée : inconnue',
            );
        });

        it('alors une page retirée par un nouveau rendu n’est plus trouvée', () => {
            const pile = creerPileDePages(conteneur, urls);
            pile.rendre([page('a')]);
            pile.rendre([page('b')]);

            expect(() => pile.elementDeLaPage('a')).toThrow('Page absente');
        });
    });

    describe('Étant donné un habillage, quand je rends les pages', () => {
        it('alors chaque image est posée dans son habillage, et reste retrouvable', () => {
            const pile = creerPileDePages(conteneur, urls);

            pile.rendre([page('a'), page('b')], (pageAHabiller, image) => {
                const cadre = document.createElement('div');
                cadre.className = 'cadre-image';
                cadre.dataset['page'] = pageAHabiller.id;
                cadre.append(image);
                return cadre;
            });

            const cadres = [...conteneur.querySelectorAll('.cadre-image')];
            expect(cadres.map((cadre) => cadre.getAttribute('data-page'))).toEqual(['a', 'b']);
            expect(pile.elementDeLaPage('a').parentElement?.className).toBe('cadre-image');
        });

        it('alors détruire vide tout l’habillage, pas seulement les images', () => {
            const pile = creerPileDePages(conteneur, urls);
            pile.rendre([page('a')], (_page, image) => {
                const cadre = document.createElement('div');
                cadre.append(image);
                return cadre;
            });

            pile.detruire();

            expect(conteneur.children).toHaveLength(0);
            expect(urls.urlsVivantes()).toEqual([]);
        });
    });

    describe('Étant donné une pile détruite, quand je la détruis encore', () => {
        it('alors rien ne casse et rien n’est libéré deux fois', () => {
            const pile = creerPileDePages(conteneur, urls);
            pile.rendre([page('a')]);

            pile.detruire();
            pile.detruire();

            expect(urls.urlsVivantes()).toEqual([]);
        });
    });
});
