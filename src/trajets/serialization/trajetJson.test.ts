import { describe, expect, it } from 'vitest';
import { requireElementAt } from '../../shared/array';
import { Coordonnee } from '../domain/Coordonnee';
import { FractionVerticale } from '../domain/FractionVerticale';
import { NomDeTrajet } from '../domain/NomDeTrajet';
import { Trajet } from '../domain/Trajet';
import { exportTrajetToJson, importTrajetFromJson } from './trajetJson';

function fullTrajet(): Trajet {
    const trajet = Trajet.create(NomDeTrajet.create('Paris → Bordeaux'));
    const page1 = trajet.addImage({
        nom: 'page-1.jpg',
        blob: new Blob(['contenu de la page 1'], { type: 'image/jpeg' }),
        largeur: 2481,
        hauteur: 3508,
    });
    const page2 = trajet.addImage({
        nom: 'page-2.png',
        blob: new Blob(['page 2'], { type: 'image/png' }),
        largeur: 100,
        hauteur: 200,
    });
    trajet.addPoint({
        imageId: page1,
        fraction: FractionVerticale.create(0.42),
        coordonnee: Coordonnee.create(46.5802, 0.3404),
    });
    trajet.addPoint({
        imageId: page2,
        fraction: FractionVerticale.create(0.9),
        coordonnee: Coordonnee.create(45.6484, 0.1562),
    });
    return trajet;
}

describe('exporterTrajetEnJson / importerTrajetDepuisJson', () => {
    describe('Étant donné un trajet exporté, quand je le réimporte', () => {
        it('alors le trajet reconstruit est identique (nom, images, points), avec de nouveaux identifiants', async () => {
            const original = fullTrajet();

            const json = await exportTrajetToJson(original);
            const copy = importTrajetFromJson(json);

            expect(copy.id).not.toBe(original.id);
            expect(copy.nom.value).toBe('Paris → Bordeaux');

            expect(copy.images.map((image) => image.nom)).toEqual(['page-1.jpg', 'page-2.png']);
            expect(copy.images.map((image) => [image.largeur, image.hauteur])).toEqual([
                [2481, 3508],
                [100, 200],
            ]);
            expect(copy.images.map((image) => image.blob.type)).toEqual([
                'image/jpeg',
                'image/png',
            ]);
            expect(await requireElementAt(copy.images, 0).blob.text()).toBe('contenu de la page 1');
            expect(await requireElementAt(copy.images, 1).blob.text()).toBe('page 2');

            const points = copy.pointsInOrdreDuVoyage();
            expect(points).toHaveLength(2);
            expect(requireElementAt(points, 0).imageId).toBe(requireElementAt(copy.images, 0).id);
            expect(requireElementAt(points, 0).fraction.value).toBe(0.42);
            expect(requireElementAt(points, 0).coordonnee.latitude).toBe(46.5802);
            expect(requireElementAt(points, 1).imageId).toBe(requireElementAt(copy.images, 1).id);
            expect(requireElementAt(points, 1).coordonnee.longitude).toBe(0.1562);
        });

        it("alors une image binaire réelle (tous les octets 0 à 255) fait l'aller-retour bit à bit", async () => {
            // Un vrai JPEG contient des octets ≥ 128 et des 0x00 : le faux blob
            // « texte » des autres tests ne prouverait pas que l'encodage base64
            // par tranches ne corrompt pas ces octets.
            const bytes = new Uint8Array(256);
            for (let value = 0; value < 256; value++) {
                bytes[value] = value;
            }
            const trajet = Trajet.create(NomDeTrajet.create('Binaire'));
            trajet.addImage({
                nom: 'reelle.jpg',
                blob: new Blob([bytes], { type: 'image/jpeg' }),
                largeur: 10,
                hauteur: 10,
            });

            const copy = importTrajetFromJson(await exportTrajetToJson(trajet));

            const reconstruits = new Uint8Array(
                await requireElementAt(copy.images, 0).blob.arrayBuffer(),
            );
            expect(Array.from(reconstruits)).toEqual(Array.from(bytes));
        });

        it('alors deux imports du même fichier donnent deux trajets aux identifiants distincts', async () => {
            const json = await exportTrajetToJson(fullTrajet());

            const first = importTrajetFromJson(json);
            const second = importTrajetFromJson(json);

            expect(second.id).not.toBe(first.id);
        });
    });

    describe('Étant donné le format du fichier', () => {
        it("alors il déclare l'application et la version, et les images sont en base64", async () => {
            const json = await exportTrajetToJson(fullTrajet());
            const content: unknown = JSON.parse(json);

            expect(content).toMatchObject({
                application: 'etudes2lignes',
                version: 1,
                trajet: {
                    images: [
                        { donneesBase64: Buffer.from('contenu de la page 1').toString('base64') },
                        {},
                    ],
                },
            });
        });
    });

    describe("Étant donné un champ mal formé, quand j'importe le fichier", () => {
        const validImage = {
            nom: 'page-1.jpg',
            type: 'image/jpeg',
            largeur: 2481,
            hauteur: 3508,
            donneesBase64: 'AAAA',
        };
        const validPoint = { image: 0, fraction: 0.5, latitude: 46.58, longitude: 0.34 };

        function fileWith(trajet: unknown): string {
            return JSON.stringify({ application: 'etudes2lignes', version: 1, trajet });
        }

        /**
         * Le message doit dire **quel** champ ne va pas : c'est tout ce que
         * l'utilisateur a pour réparer son fichier, et il n'a pas le code sous
         * les yeux. Un libellé perdu en route donnerait « Fichier incomplet :
         * manquant ou invalide », vrai et inutilisable.
         */
        it.each([
            ['le trajet lui-même', undefined, 'trajet'],
            ['le nom du trajet', { nom: 42, images: [], points: [] }, 'nom'],
            ['la liste des images', { nom: 'X', images: 'aucune', points: [] }, 'images'],
            [
                "les données d'une image",
                { nom: 'X', images: [{ ...validImage, donneesBase64: 42 }], points: [] },
                "données d'image",
            ],
            [
                "le nom d'une image",
                { nom: 'X', images: [{ ...validImage, nom: 42 }], points: [] },
                "nom d'image",
            ],
            [
                "le type d'une image",
                { nom: 'X', images: [{ ...validImage, type: 42 }], points: [] },
                "type d'image",
            ],
            [
                "la largeur d'une image",
                { nom: 'X', images: [{ ...validImage, largeur: 'grand' }], points: [] },
                'largeur',
            ],
            [
                "la hauteur d'une image",
                { nom: 'X', images: [{ ...validImage, hauteur: null }], points: [] },
                'hauteur',
            ],
            ['la liste des points', { nom: 'X', images: [], points: 'aucun' }, 'points'],
            [
                "un point qui n'est pas un objet, en le situant",
                { nom: 'X', images: [validImage], points: ['pas un objet'] },
                'points[0]',
            ],
            [
                "l'index d'image d'un point",
                { nom: 'X', images: [validImage], points: [{ ...validPoint, image: 'la une' }] },
                "index d'image",
            ],
            [
                "la fraction d'un point",
                { nom: 'X', images: [validImage], points: [{ ...validPoint, fraction: 'mi' }] },
                'fraction',
            ],
            [
                "la latitude d'un point",
                { nom: 'X', images: [validImage], points: [{ ...validPoint, latitude: 'nord' }] },
                'latitude',
            ],
            [
                "la longitude d'un point",
                { nom: 'X', images: [validImage], points: [{ ...validPoint, longitude: null }] },
                'longitude',
            ],
        ])('alors le message nomme %s', (_case, trajet, input) => {
            expect(() => importTrajetFromJson(fileWith(trajet))).toThrow(
                `Fichier incomplet : ${input} manquant ou invalide.`,
            );
        });
    });

    describe("Étant donné un fichier invalide, quand je l'importe", () => {
        it("alors des données d'image qui ne sont pas du base64 sont refusées", () => {
            const json = JSON.stringify({
                application: 'etudes2lignes',
                version: 1,
                trajet: {
                    nom: 'Cassé',
                    images: [
                        {
                            nom: 'page-1.jpg',
                            type: 'image/jpeg',
                            largeur: 10,
                            hauteur: 20,
                            donneesBase64: '!!! pas du base64 !!!',
                        },
                    ],
                    points: [],
                },
            });

            expect(() => importTrajetFromJson(json)).toThrow(
                "Fichier incomplet : données d'image illisibles.",
            );
        });

        it("alors un texte qui n'est pas du JSON est refusé avec un message clair", () => {
            expect(() => importTrajetFromJson('pas du json')).toThrow(
                "Fichier illisible : ce n'est pas un fichier JSON.",
            );
        });

        it("alors un JSON qui n'est pas un objet (tableau, null) est refusé", () => {
            expect(() => importTrajetFromJson('[]')).toThrow(
                'Fichier incomplet : fichier manquant ou invalide.',
            );
            expect(() => importTrajetFromJson('null')).toThrow(
                'Fichier incomplet : fichier manquant ou invalide.',
            );
        });

        it('alors un trajet dont les images ne sont pas des objets est refusé', () => {
            const json = JSON.stringify({
                application: 'etudes2lignes',
                version: 1,
                trajet: { nom: 'Cassé', images: ['pas un objet'], points: [] },
            });

            expect(() => importTrajetFromJson(json)).toThrow(
                'Fichier incomplet : images[0] manquant ou invalide.',
            );
        });

        it("alors un JSON d'une autre application est refusé", () => {
            expect(() => importTrajetFromJson('{"application":"autre"}')).toThrow(
                "Ce fichier ne vient pas d'Etudes2Lignes.",
            );
        });

        it('alors une version inconnue est refusée', () => {
            expect(() =>
                importTrajetFromJson('{"application":"etudes2lignes","version":2}'),
            ).toThrow('Version de fichier inconnue (2) : cette application lit la version 1.');
        });

        it('alors un point visant une image inexistante est refusé', () => {
            const json = JSON.stringify({
                application: 'etudes2lignes',
                version: 1,
                trajet: {
                    nom: 'Cassé',
                    images: [],
                    points: [{ image: 0, fraction: 0.5, latitude: 46, longitude: 2 }],
                },
            });

            expect(() => importTrajetFromJson(json)).toThrow(
                'Fichier incohérent : un point vise une image absente du fichier.',
            );
        });

        it('alors une image sans données (base64 vide) est refusée plutôt que créée à 0 octet', () => {
            const json = JSON.stringify({
                application: 'etudes2lignes',
                version: 1,
                trajet: {
                    nom: 'Cassé',
                    images: [
                        {
                            nom: 'vide.jpg',
                            type: 'image/jpeg',
                            largeur: 100,
                            hauteur: 200,
                            donneesBase64: '',
                        },
                    ],
                    points: [],
                },
            });

            expect(() => importTrajetFromJson(json)).toThrow(
                "Fichier incomplet : données d'image manquantes.",
            );
        });
    });
});
