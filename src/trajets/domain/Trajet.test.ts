import { describe, expect, it } from 'vitest';
import { Coordonnee } from './Coordonnee';
import { FractionVerticale } from './FractionVerticale';
import { NomDeTrajet } from './NomDeTrajet';
import { elementA } from '../../commun/tableau';
import { Trajet } from './Trajet';

function nouveauTrajet(nom = 'Paris → Bordeaux'): Trajet {
    return Trajet.creer(NomDeTrajet.creer(nom));
}

function fichierImage(nom = 'page-1.jpg'): {
    nom: string;
    blob: Blob;
    largeur: number;
    hauteur: number;
} {
    return { nom, blob: new Blob(['fausse image']), largeur: 2481, hauteur: 3508 };
}

const massy = Coordonnee.creer(48.7266, 2.2617);
const poitiers = Coordonnee.creer(46.5802, 0.3404);
const angouleme = Coordonnee.creer(45.6484, 0.1562);

describe('Trajet', () => {
    describe('Étant donné un nom valide, quand je crée un trajet', () => {
        it('alors il a ce nom, un identifiant, et ni image ni point', () => {
            const trajet = nouveauTrajet('Paris → Bordeaux');

            expect(trajet.id).toBeTruthy();
            expect(trajet.nom.valeur).toBe('Paris → Bordeaux');
            expect(trajet.images).toHaveLength(0);
            expect(trajet.points).toHaveLength(0);
        });
    });

    describe('Étant donné un trajet, quand je le renomme', () => {
        it('alors son nom change', () => {
            const trajet = nouveauTrajet();

            trajet.renommer(NomDeTrajet.creer('Bordeaux → Paris'));

            expect(trajet.nom.valeur).toBe('Bordeaux → Paris');
        });
    });

    describe('Étant donné un trajet, quand j’ajoute des images', () => {
        it('alors elles apparaissent dans l’ordre d’ajout (ordre du voyage)', () => {
            const trajet = nouveauTrajet();

            trajet.ajouterImage(fichierImage('page-1.jpg'));
            trajet.ajouterImage(fichierImage('page-2.jpg'));

            expect(trajet.images.map((image) => image.nom)).toEqual(['page-1.jpg', 'page-2.jpg']);
        });

        it('alors une image aux dimensions invalides est refusée', () => {
            const trajet = nouveauTrajet();

            expect(() => trajet.ajouterImage({ ...fichierImage(), largeur: 0 })).toThrow(
                'Dimensions d’image invalides',
            );
        });
    });

    describe('Étant donné un trajet de trois images', () => {
        it('quand je monte la troisième, alors elle passe deuxième', () => {
            const trajet = nouveauTrajet();
            trajet.ajouterImage(fichierImage('a.jpg'));
            trajet.ajouterImage(fichierImage('b.jpg'));
            const idC = trajet.ajouterImage(fichierImage('c.jpg'));

            trajet.monterImage(idC);

            expect(trajet.images.map((image) => image.nom)).toEqual(['a.jpg', 'c.jpg', 'b.jpg']);
        });

        it('quand je monte la première ou descends la dernière, alors rien ne change', () => {
            const trajet = nouveauTrajet();
            const idA = trajet.ajouterImage(fichierImage('a.jpg'));
            trajet.ajouterImage(fichierImage('b.jpg'));
            const idC = trajet.ajouterImage(fichierImage('c.jpg'));

            trajet.monterImage(idA);
            trajet.descendreImage(idC);

            expect(trajet.images.map((image) => image.nom)).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
        });

        it('quand je supprime la deuxième, alors ses points disparaissent et les autres restent', () => {
            const trajet = nouveauTrajet();
            const idA = trajet.ajouterImage(fichierImage('a.jpg'));
            const idB = trajet.ajouterImage(fichierImage('b.jpg'));
            const pointSurA = trajet.ajouterPoint({
                imageId: idA,
                fraction: FractionVerticale.creer(0.5),
                coordonnee: massy,
            });
            trajet.ajouterPoint({
                imageId: idB,
                fraction: FractionVerticale.creer(0.2),
                coordonnee: poitiers,
            });

            trajet.supprimerImage(idB);

            expect(trajet.images.map((image) => image.nom)).toEqual(['a.jpg']);
            expect(trajet.points.map((point) => point.id)).toEqual([pointSurA]);
        });
    });

    describe('Étant donné un point visant une image qui n’appartient pas au trajet', () => {
        it('alors l’ajout est refusé', () => {
            const autreTrajet = nouveauTrajet('Autre');
            const imageAilleurs = autreTrajet.ajouterImage(fichierImage());
            const trajet = nouveauTrajet();

            expect(() =>
                trajet.ajouterPoint({
                    imageId: imageAilleurs,
                    fraction: FractionVerticale.creer(0.5),
                    coordonnee: massy,
                }),
            ).toThrow('Image inconnue');
        });
    });

    describe('Étant donné un trajet avec un point', () => {
        it('quand je déplace le point sur l’image, alors sa hauteur (et son image) changent', () => {
            const trajet = nouveauTrajet();
            const idA = trajet.ajouterImage(fichierImage('a.jpg'));
            const idB = trajet.ajouterImage(fichierImage('b.jpg'));
            const pointId = trajet.ajouterPoint({
                imageId: idA,
                fraction: FractionVerticale.creer(0.5),
                coordonnee: massy,
            });

            trajet.deplacerPointSurImage(pointId, idB, FractionVerticale.creer(0.9));

            const point = elementA(trajet.points, 0);
            expect(point.imageId).toBe(idB);
            expect(point.fraction.valeur).toBe(0.9);
            expect(point.coordonnee.egale(massy)).toBe(true);
        });

        it('quand je déplace le point sur la carte, alors seule sa coordonnée change', () => {
            const trajet = nouveauTrajet();
            const idA = trajet.ajouterImage(fichierImage());
            const pointId = trajet.ajouterPoint({
                imageId: idA,
                fraction: FractionVerticale.creer(0.5),
                coordonnee: massy,
            });

            trajet.deplacerPointSurCarte(pointId, poitiers);

            const point = elementA(trajet.points, 0);
            expect(point.coordonnee.egale(poitiers)).toBe(true);
            expect(point.fraction.valeur).toBe(0.5);
        });

        it('quand je supprime le point, alors il disparaît', () => {
            const trajet = nouveauTrajet();
            const idA = trajet.ajouterImage(fichierImage());
            const pointId = trajet.ajouterPoint({
                imageId: idA,
                fraction: FractionVerticale.creer(0.5),
                coordonnee: massy,
            });

            trajet.supprimerPoint(pointId);

            expect(trajet.points).toHaveLength(0);
        });
    });

    describe('Étant donné des points répartis sur deux pages lues de bas en haut', () => {
        it('alors l’ordre du voyage va du bas de la première page au haut de la dernière', () => {
            const trajet = nouveauTrajet();
            const page1 = trajet.ajouterImage(fichierImage('page-1.jpg'));
            const page2 = trajet.ajouterImage(fichierImage('page-2.jpg'));
            const hautPage1 = trajet.ajouterPoint({
                imageId: page1,
                fraction: FractionVerticale.creer(0.1),
                coordonnee: poitiers,
            });
            const basPage1 = trajet.ajouterPoint({
                imageId: page1,
                fraction: FractionVerticale.creer(0.9),
                coordonnee: massy,
            });
            const basPage2 = trajet.ajouterPoint({
                imageId: page2,
                fraction: FractionVerticale.creer(0.8),
                coordonnee: angouleme,
            });

            const ordre = trajet.ordreVoyageDesPoints().map((point) => point.id);

            expect(ordre).toEqual([basPage1, hautPage1, basPage2]);
        });

        it('quand je réordonne les images, alors l’ordre du voyage suit le nouvel ordre', () => {
            const trajet = nouveauTrajet();
            const page1 = trajet.ajouterImage(fichierImage('page-1.jpg'));
            const page2 = trajet.ajouterImage(fichierImage('page-2.jpg'));
            const pointPage1 = trajet.ajouterPoint({
                imageId: page1,
                fraction: FractionVerticale.creer(0.5),
                coordonnee: massy,
            });
            const pointPage2 = trajet.ajouterPoint({
                imageId: page2,
                fraction: FractionVerticale.creer(0.5),
                coordonnee: poitiers,
            });

            trajet.monterImage(page2);

            expect(trajet.ordreVoyageDesPoints().map((point) => point.id)).toEqual([
                pointPage2,
                pointPage1,
            ]);
        });
    });

    describe('Étant donné un trajet sauvegardé, quand je le réhydrate', () => {
        it('alors il est identique (images, points, ordre)', () => {
            const original = nouveauTrajet();
            const idA = original.ajouterImage(fichierImage('a.jpg'));
            original.ajouterPoint({
                imageId: idA,
                fraction: FractionVerticale.creer(0.3),
                coordonnee: angouleme,
            });

            const copie = Trajet.rehydrater({
                id: original.id,
                nom: original.nom,
                creeLe: original.creeLe,
                images: original.images,
                points: original.points,
            });

            expect(copie.id).toBe(original.id);
            expect(copie.nom.valeur).toBe(original.nom.valeur);
            expect(copie.images).toEqual(original.images);
            expect(copie.points).toEqual(original.points);
        });

        it('alors un point orphelin (image absente) est refusé', () => {
            const original = nouveauTrajet();
            const idA = original.ajouterImage(fichierImage());
            original.ajouterPoint({
                imageId: idA,
                fraction: FractionVerticale.creer(0.3),
                coordonnee: massy,
            });

            expect(() =>
                Trajet.rehydrater({
                    id: original.id,
                    nom: original.nom,
                    creeLe: original.creeLe,
                    images: [],
                    points: original.points,
                }),
            ).toThrow('Image inconnue');
        });
    });
});
