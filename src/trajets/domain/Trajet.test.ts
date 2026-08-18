import { describe, expect, it } from 'vitest';
import { Coordonnee } from './Coordonnee';
import { FractionVerticale } from './FractionVerticale';
import { NomDeTrajet } from './NomDeTrajet';
import { requireElementAt } from '../../shared/array';
import { Trajet, type ImageFile } from './Trajet';

function newTrajet(nom = 'Paris → Bordeaux'): Trajet {
    return Trajet.create(NomDeTrajet.create(nom));
}

function imageFile(nom = 'page-1.jpg'): ImageFile {
    return { nom, blob: new Blob(['fausse image']), largeur: 2481, hauteur: 3508 };
}

function imageNoms(images: readonly { nom: string }[]): string[] {
    return images.map((image) => image.nom);
}

const massy = Coordonnee.create(48.7266, 2.2617);
const poitiers = Coordonnee.create(46.5802, 0.3404);
const angouleme = Coordonnee.create(45.6484, 0.1562);

describe('Trajet', () => {
    describe('Étant donné un nom valide, quand je crée un trajet', () => {
        it('alors il a ce nom, un identifiant, et ni image ni point', () => {
            const trajet = newTrajet('Paris → Bordeaux');

            expect(trajet.id).toBeTruthy();
            expect(trajet.nom.value).toBe('Paris → Bordeaux');
            expect(trajet.images).toHaveLength(0);
            expect(trajet.points).toHaveLength(0);
        });
    });

    describe('Étant donné un trajet, quand je le renomme', () => {
        it('alors son nom change', () => {
            const trajet = newTrajet();

            trajet.rename(NomDeTrajet.create('Bordeaux → Paris'));

            expect(trajet.nom.value).toBe('Bordeaux → Paris');
        });
    });

    describe("Étant donné un trajet, quand j'ajoute des images", () => {
        it("alors elles apparaissent dans l'ordre d'ajout (ordre du voyage)", () => {
            const trajet = newTrajet();

            trajet.addImage(imageFile('page-1.jpg'));
            trajet.addImage(imageFile('page-2.jpg'));

            expect(trajet.images.map((image) => image.nom)).toEqual(['page-1.jpg', 'page-2.jpg']);
        });

        it('alors une image aux dimensions invalides est refusée', () => {
            const trajet = newTrajet();

            expect(() => trajet.addImage({ ...imageFile(), largeur: 0 })).toThrow(
                "Dimensions d'image invalides",
            );
        });
    });

    describe("Étant donné un trajet vierge, quand j'importe un lot de pages", () => {
        it("alors la pile les lit dans l'ordre du lot, et la dernière ouvre le voyage", () => {
            const trajet = newTrajet();

            trajet.addImagesInReadingOrder([
                imageFile('page-1.jpg'),
                imageFile('page-2.jpg'),
                imageFile('page-3.jpg'),
            ]);

            expect(imageNoms(trajet.imagesInReadingOrder())).toEqual([
                'page-1.jpg',
                'page-2.jpg',
                'page-3.jpg',
            ]);
            expect(imageNoms(trajet.images)).toEqual(['page-3.jpg', 'page-2.jpg', 'page-1.jpg']);
        });

        it('alors une page aux dimensions invalides est refusée', () => {
            const trajet = newTrajet();

            expect(() => trajet.addImagesInReadingOrder([{ ...imageFile(), largeur: 0 }])).toThrow(
                "Dimensions d'image invalides",
            );
        });
    });

    describe("Étant donné un trajet qui a déjà des pages, quand j'importe un second lot", () => {
        it('alors il se lit sous les pages existantes, et sa dernière page ouvre le voyage', () => {
            const trajet = newTrajet();
            trajet.addImagesInReadingOrder([imageFile('page-1.jpg'), imageFile('page-2.jpg')]);

            trajet.addImagesInReadingOrder([imageFile('page-3.jpg'), imageFile('page-4.jpg')]);

            expect(imageNoms(trajet.imagesInReadingOrder())).toEqual([
                'page-1.jpg',
                'page-2.jpg',
                'page-3.jpg',
                'page-4.jpg',
            ]);
            expect(imageNoms(trajet.images)).toEqual([
                'page-4.jpg',
                'page-3.jpg',
                'page-2.jpg',
                'page-1.jpg',
            ]);
        });

        it('alors un lot vide laisse le trajet inchangé', () => {
            const trajet = newTrajet();
            trajet.addImagesInReadingOrder([imageFile('page-1.jpg')]);

            trajet.addImagesInReadingOrder([]);

            expect(imageNoms(trajet.images)).toEqual(['page-1.jpg']);
        });
    });

    describe('Étant donné un trajet de trois images', () => {
        it('quand je recule la troisième dans le voyage, alors elle passe deuxième', () => {
            const trajet = newTrajet();
            trajet.addImage(imageFile('a.jpg'));
            trajet.addImage(imageFile('b.jpg'));
            const idC = trajet.addImage(imageFile('c.jpg'));

            trajet.moveImageBackwardInVoyage(idC);

            expect(imageNoms(trajet.images)).toEqual(['a.jpg', 'c.jpg', 'b.jpg']);
        });

        it("quand j'avance la première dans le voyage, alors elle passe deuxième", () => {
            const trajet = newTrajet();
            const idA = trajet.addImage(imageFile('a.jpg'));
            trajet.addImage(imageFile('b.jpg'));
            trajet.addImage(imageFile('c.jpg'));

            trajet.moveImageForwardInVoyage(idA);

            expect(imageNoms(trajet.images)).toEqual(['b.jpg', 'a.jpg', 'c.jpg']);
        });

        it('quand je recule la première ou avance la dernière, alors rien ne change', () => {
            const trajet = newTrajet();
            const idA = trajet.addImage(imageFile('a.jpg'));
            trajet.addImage(imageFile('b.jpg'));
            const idC = trajet.addImage(imageFile('c.jpg'));

            trajet.moveImageBackwardInVoyage(idA);
            trajet.moveImageForwardInVoyage(idC);

            expect(imageNoms(trajet.images)).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
        });

        it("quand je demande les images dans l'ordre de lecture, alors la première du voyage vient en dernier (tout en bas de la pile)", () => {
            const trajet = newTrajet();
            trajet.addImage(imageFile('a.jpg'));
            trajet.addImage(imageFile('b.jpg'));
            trajet.addImage(imageFile('c.jpg'));

            expect(imageNoms(trajet.imagesInReadingOrder())).toEqual(['c.jpg', 'b.jpg', 'a.jpg']);
            expect(imageNoms(trajet.images)).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
        });

        it('quand je supprime la deuxième, alors ses points disparaissent et les autres restent', () => {
            const trajet = newTrajet();
            const idA = trajet.addImage(imageFile('a.jpg'));
            const idB = trajet.addImage(imageFile('b.jpg'));
            const pointOnA = trajet.addPoint({
                imageId: idA,
                fraction: FractionVerticale.create(0.5),
                coordonnee: massy,
            });
            trajet.addPoint({
                imageId: idB,
                fraction: FractionVerticale.create(0.2),
                coordonnee: poitiers,
            });

            trajet.deleteImage(idB);

            expect(imageNoms(trajet.images)).toEqual(['a.jpg']);
            expect(trajet.points.map((point) => point.id)).toEqual([pointOnA]);
        });
    });

    describe('Étant donné un trajet à deux images portant chacune des points', () => {
        it("quand je demande les points de la première image, alors je n'obtiens que les siens", () => {
            const trajet = newTrajet();
            const page1 = trajet.addImage(imageFile('page-1.jpg'));
            const page2 = trajet.addImage(imageFile('page-2.jpg'));
            const onPage1 = trajet.addPoint({
                imageId: page1,
                fraction: FractionVerticale.create(0.5),
                coordonnee: massy,
            });
            trajet.addPoint({
                imageId: page2,
                fraction: FractionVerticale.create(0.5),
                coordonnee: poitiers,
            });

            expect(trajet.pointsOfImage(page1).map((point) => point.id)).toEqual([onPage1]);
        });
    });

    describe('Étant donné une image absente du trajet', () => {
        it("quand je demande ses points, alors c'est refusé", () => {
            const otherTrajet = newTrajet('Autre');
            const imageAilleurs = otherTrajet.addImage(imageFile());
            const trajet = newTrajet();
            trajet.addImage(imageFile());

            expect(() => trajet.pointsOfImage(imageAilleurs)).toThrow('Image inconnue');
        });
    });

    describe('Étant donné un trajet à trois points sur deux images', () => {
        it("quand je demande les points numérotés, alors les numéros suivent l'ordre du voyage sans trou", () => {
            const trajet = newTrajet();
            const page1 = trajet.addImage(imageFile('page-1.jpg'));
            const page2 = trajet.addImage(imageFile('page-2.jpg'));
            const topPage1 = trajet.addPoint({
                imageId: page1,
                fraction: FractionVerticale.create(0.1),
                coordonnee: poitiers,
            });
            const bottomPage1 = trajet.addPoint({
                imageId: page1,
                fraction: FractionVerticale.create(0.9),
                coordonnee: massy,
            });
            const bottomPage2 = trajet.addPoint({
                imageId: page2,
                fraction: FractionVerticale.create(0.8),
                coordonnee: angouleme,
            });

            const numerotes = trajet.numberedPointsInOrdreDuVoyage();

            expect(numerotes.map(({ point, number }) => [point.id, number])).toEqual([
                [bottomPage1, 1],
                [topPage1, 2],
                [bottomPage2, 3],
            ]);
        });
    });

    describe("Étant donné un point visant une image qui n'appartient pas au trajet", () => {
        it("alors l'ajout est refusé", () => {
            const otherTrajet = newTrajet('Autre');
            const imageAilleurs = otherTrajet.addImage(imageFile());
            const trajet = newTrajet();

            expect(() =>
                trajet.addPoint({
                    imageId: imageAilleurs,
                    fraction: FractionVerticale.create(0.5),
                    coordonnee: massy,
                }),
            ).toThrow('Image inconnue');
        });
    });

    describe('Étant donné un trajet avec un point', () => {
        it("quand je déplace le point sur l'image, alors sa hauteur (et son image) changent", () => {
            const trajet = newTrajet();
            const idA = trajet.addImage(imageFile('a.jpg'));
            const idB = trajet.addImage(imageFile('b.jpg'));
            const pointId = trajet.addPoint({
                imageId: idA,
                fraction: FractionVerticale.create(0.5),
                coordonnee: massy,
            });

            trajet.movePointOnImage(pointId, idB, FractionVerticale.create(0.9));

            const point = requireElementAt(trajet.points, 0);
            expect(point.imageId).toBe(idB);
            expect(point.fraction.value).toBe(0.9);
            expect(point.coordonnee.equals(massy)).toBe(true);
        });

        it('quand je déplace le point sur la carte, alors seule sa coordonnée change', () => {
            const trajet = newTrajet();
            const idA = trajet.addImage(imageFile());
            const pointId = trajet.addPoint({
                imageId: idA,
                fraction: FractionVerticale.create(0.5),
                coordonnee: massy,
            });

            trajet.movePointOnCarte(pointId, poitiers);

            const point = requireElementAt(trajet.points, 0);
            expect(point.coordonnee.equals(poitiers)).toBe(true);
            expect(point.fraction.value).toBe(0.5);
        });

        it('quand je supprime le point, alors il disparaît', () => {
            const trajet = newTrajet();
            const idA = trajet.addImage(imageFile());
            const pointId = trajet.addPoint({
                imageId: idA,
                fraction: FractionVerticale.create(0.5),
                coordonnee: massy,
            });

            trajet.deletePoint(pointId);

            expect(trajet.points).toHaveLength(0);
        });
    });

    describe('Étant donné des points répartis sur deux pages lues de bas en haut', () => {
        it("alors l'ordre du voyage va du bas de la première page au haut de la dernière", () => {
            const trajet = newTrajet();
            const page1 = trajet.addImage(imageFile('page-1.jpg'));
            const page2 = trajet.addImage(imageFile('page-2.jpg'));
            const topPage1 = trajet.addPoint({
                imageId: page1,
                fraction: FractionVerticale.create(0.1),
                coordonnee: poitiers,
            });
            const bottomPage1 = trajet.addPoint({
                imageId: page1,
                fraction: FractionVerticale.create(0.9),
                coordonnee: massy,
            });
            const bottomPage2 = trajet.addPoint({
                imageId: page2,
                fraction: FractionVerticale.create(0.8),
                coordonnee: angouleme,
            });

            const ordre = trajet.pointsInOrdreDuVoyage().map((point) => point.id);

            expect(ordre).toEqual([bottomPage1, topPage1, bottomPage2]);
        });

        it("quand je réordonne les images, alors l'ordre du voyage suit le nouvel ordre", () => {
            const trajet = newTrajet();
            const page1 = trajet.addImage(imageFile('page-1.jpg'));
            const page2 = trajet.addImage(imageFile('page-2.jpg'));
            const pointPage1 = trajet.addPoint({
                imageId: page1,
                fraction: FractionVerticale.create(0.5),
                coordonnee: massy,
            });
            const pointPage2 = trajet.addPoint({
                imageId: page2,
                fraction: FractionVerticale.create(0.5),
                coordonnee: poitiers,
            });

            trajet.moveImageBackwardInVoyage(page2);

            expect(trajet.pointsInOrdreDuVoyage().map((point) => point.id)).toEqual([
                pointPage2,
                pointPage1,
            ]);
        });

        it("quand je supprime la première page, alors l'ordre du voyage ne garde que les points des pages restantes", () => {
            const trajet = newTrajet();
            const page1 = trajet.addImage(imageFile('page-1.jpg'));
            const page2 = trajet.addImage(imageFile('page-2.jpg'));
            trajet.addPoint({
                imageId: page1,
                fraction: FractionVerticale.create(0.9),
                coordonnee: massy,
            });
            const topPage2 = trajet.addPoint({
                imageId: page2,
                fraction: FractionVerticale.create(0.2),
                coordonnee: angouleme,
            });
            const bottomPage2 = trajet.addPoint({
                imageId: page2,
                fraction: FractionVerticale.create(0.8),
                coordonnee: poitiers,
            });

            trajet.deleteImage(page1);

            expect(trajet.pointsInOrdreDuVoyage().map((point) => point.id)).toEqual([
                bottomPage2,
                topPage2,
            ]);
        });
    });

    describe('Étant donné une pile de trois pages', () => {
        it('quand je demande leurs numéros, alors elles sont comptées depuis le haut, où le voyage finit', () => {
            const trajet = newTrajet();
            trajet.addImage(imageFile('a.jpg'));
            trajet.addImage(imageFile('b.jpg'));
            trajet.addImage(imageFile('c.jpg'));

            const numerotees = trajet.numberedImagesInReadingOrder();

            // La première page du voyage s'affiche tout en bas : c'est donc la
            // dernière du voyage que l'œil compte en premier.
            expect(numerotees.map(({ image, number }) => [image.nom, number])).toEqual([
                ['c.jpg', 1],
                ['b.jpg', 2],
                ['a.jpg', 3],
            ]);
        });

        it("quand j'avance une page dans le voyage, alors son numéro décroît : elle monte dans la pile", () => {
            const trajet = newTrajet();
            const idA = trajet.addImage(imageFile('a.jpg'));
            trajet.addImage(imageFile('b.jpg'));
            trajet.addImage(imageFile('c.jpg'));

            trajet.moveImageForwardInVoyage(idA);

            expect(trajet.numberedImagesInReadingOrder().map(({ image }) => image.nom)).toEqual([
                'c.jpg',
                'a.jpg',
                'b.jpg',
            ]);
        });
    });

    describe('Étant donné un trajet sauvegardé, quand je le réhydrate', () => {
        it('alors il est identique (images, points, ordre)', () => {
            const original = newTrajet();
            const idA = original.addImage(imageFile('a.jpg'));
            original.addPoint({
                imageId: idA,
                fraction: FractionVerticale.create(0.3),
                coordonnee: angouleme,
            });

            const copy = Trajet.rehydrate({
                id: original.id,
                nom: original.nom,
                creeLe: original.creeLe,
                images: original.images,
                points: original.points,
            });

            expect(copy.id).toBe(original.id);
            expect(copy.nom.value).toBe(original.nom.value);
            expect(copy.images).toEqual(original.images);
            expect(copy.points).toEqual(original.points);
        });

        it('alors un point orphelin (image absente) est refusé', () => {
            const original = newTrajet();
            const idA = original.addImage(imageFile());
            original.addPoint({
                imageId: idA,
                fraction: FractionVerticale.create(0.3),
                coordonnee: massy,
            });

            expect(() =>
                Trajet.rehydrate({
                    id: original.id,
                    nom: original.nom,
                    creeLe: original.creeLe,
                    images: [],
                    points: original.points,
                }),
            ).toThrow('Image inconnue');
        });

        it("alors un enregistrement d'image de largeur 0 est refusé, dimensions nommées", () => {
            const original = newTrajet();
            const idA = original.addImage(imageFile());

            expect(() =>
                Trajet.rehydrate({
                    id: original.id,
                    nom: original.nom,
                    creeLe: original.creeLe,
                    images: [
                        {
                            id: idA,
                            nom: 'page-1.jpg',
                            blob: new Blob(['fausse image']),
                            largeur: 0,
                            hauteur: 3508,
                        },
                    ],
                    points: [],
                }),
            ).toThrow("Dimensions d'image invalides : 0×3508");
        });
    });
});
