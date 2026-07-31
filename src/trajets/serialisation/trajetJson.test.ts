import { describe, expect, it } from 'vitest';
import { elementA } from '../../commun/tableau';
import { Coordonnee } from '../domain/Coordonnee';
import { FractionVerticale } from '../domain/FractionVerticale';
import { NomDeTrajet } from '../domain/NomDeTrajet';
import { Trajet } from '../domain/Trajet';
import { exporterTrajetEnJson, importerTrajetDepuisJson } from './trajetJson';

function trajetComplet(): Trajet {
    const trajet = Trajet.creer(NomDeTrajet.creer('Paris → Bordeaux'));
    const page1 = trajet.ajouterImage({
        nom: 'page-1.jpg',
        blob: new Blob(['contenu de la page 1'], { type: 'image/jpeg' }),
        largeur: 2481,
        hauteur: 3508,
    });
    const page2 = trajet.ajouterImage({
        nom: 'page-2.png',
        blob: new Blob(['page 2'], { type: 'image/png' }),
        largeur: 100,
        hauteur: 200,
    });
    trajet.ajouterPoint({
        imageId: page1,
        fraction: FractionVerticale.creer(0.42),
        coordonnee: Coordonnee.creer(46.5802, 0.3404),
    });
    trajet.ajouterPoint({
        imageId: page2,
        fraction: FractionVerticale.creer(0.9),
        coordonnee: Coordonnee.creer(45.6484, 0.1562),
    });
    return trajet;
}

describe('exporterTrajetEnJson / importerTrajetDepuisJson', () => {
    describe('Étant donné un trajet exporté, quand je le réimporte', () => {
        it('alors le trajet reconstruit est identique (nom, images, points), avec de nouveaux identifiants', async () => {
            const original = trajetComplet();

            const json = await exporterTrajetEnJson(original);
            const copie = importerTrajetDepuisJson(json);

            expect(copie.id).not.toBe(original.id);
            expect(copie.nom.valeur).toBe('Paris → Bordeaux');

            expect(copie.images.map((image) => image.nom)).toEqual(['page-1.jpg', 'page-2.png']);
            expect(copie.images.map((image) => [image.largeur, image.hauteur])).toEqual([
                [2481, 3508],
                [100, 200],
            ]);
            expect(copie.images.map((image) => image.blob.type)).toEqual([
                'image/jpeg',
                'image/png',
            ]);
            expect(await elementA(copie.images, 0).blob.text()).toBe('contenu de la page 1');
            expect(await elementA(copie.images, 1).blob.text()).toBe('page 2');

            const points = copie.ordreVoyageDesPoints();
            expect(points).toHaveLength(2);
            expect(elementA(points, 0).imageId).toBe(elementA(copie.images, 0).id);
            expect(elementA(points, 0).fraction.valeur).toBe(0.42);
            expect(elementA(points, 0).coordonnee.latitude).toBe(46.5802);
            expect(elementA(points, 1).imageId).toBe(elementA(copie.images, 1).id);
            expect(elementA(points, 1).coordonnee.longitude).toBe(0.1562);
        });

        it('alors une image binaire réelle (tous les octets 0 à 255) fait l’aller-retour bit à bit', async () => {
            // Un vrai JPEG contient des octets ≥ 128 et des 0x00 : le faux blob
            // « texte » des autres tests ne prouverait pas que l'encodage base64
            // par tranches ne corrompt pas ces octets.
            const octets = new Uint8Array(256);
            for (let valeur = 0; valeur < 256; valeur++) {
                octets[valeur] = valeur;
            }
            const trajet = Trajet.creer(NomDeTrajet.creer('Binaire'));
            trajet.ajouterImage({
                nom: 'reelle.jpg',
                blob: new Blob([octets], { type: 'image/jpeg' }),
                largeur: 10,
                hauteur: 10,
            });

            const copie = importerTrajetDepuisJson(await exporterTrajetEnJson(trajet));

            const reconstruits = new Uint8Array(await elementA(copie.images, 0).blob.arrayBuffer());
            expect(Array.from(reconstruits)).toEqual(Array.from(octets));
        });

        it('alors deux imports du même fichier donnent deux trajets aux identifiants distincts', async () => {
            const json = await exporterTrajetEnJson(trajetComplet());

            const premier = importerTrajetDepuisJson(json);
            const second = importerTrajetDepuisJson(json);

            expect(second.id).not.toBe(premier.id);
        });
    });

    describe('Étant donné le format du fichier', () => {
        it('alors il déclare l’application et la version, et les images sont en base64', async () => {
            const json = await exporterTrajetEnJson(trajetComplet());
            const contenu: unknown = JSON.parse(json);

            expect(contenu).toMatchObject({
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

    describe('Étant donné un champ mal formé, quand j’importe le fichier', () => {
        const imageValide = {
            nom: 'page-1.jpg',
            type: 'image/jpeg',
            largeur: 2481,
            hauteur: 3508,
            donneesBase64: 'AAAA',
        };
        const pointValide = { image: 0, fraction: 0.5, latitude: 46.58, longitude: 0.34 };

        function fichierDont(trajet: unknown): string {
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
                'les données d’une image',
                { nom: 'X', images: [{ ...imageValide, donneesBase64: 42 }], points: [] },
                'données d’image',
            ],
            [
                'le nom d’une image',
                { nom: 'X', images: [{ ...imageValide, nom: 42 }], points: [] },
                'nom d’image',
            ],
            [
                'le type d’une image',
                { nom: 'X', images: [{ ...imageValide, type: 42 }], points: [] },
                'type d’image',
            ],
            [
                'la largeur d’une image',
                { nom: 'X', images: [{ ...imageValide, largeur: 'grand' }], points: [] },
                'largeur',
            ],
            [
                'la hauteur d’une image',
                { nom: 'X', images: [{ ...imageValide, hauteur: null }], points: [] },
                'hauteur',
            ],
            ['la liste des points', { nom: 'X', images: [], points: 'aucun' }, 'points'],
            [
                'un point qui n’est pas un objet, en le situant',
                { nom: 'X', images: [imageValide], points: ['pas un objet'] },
                'points[0]',
            ],
            [
                'l’index d’image d’un point',
                { nom: 'X', images: [imageValide], points: [{ ...pointValide, image: 'la une' }] },
                'index d’image',
            ],
            [
                'la fraction d’un point',
                { nom: 'X', images: [imageValide], points: [{ ...pointValide, fraction: 'mi' }] },
                'fraction',
            ],
            [
                'la latitude d’un point',
                { nom: 'X', images: [imageValide], points: [{ ...pointValide, latitude: 'nord' }] },
                'latitude',
            ],
            [
                'la longitude d’un point',
                { nom: 'X', images: [imageValide], points: [{ ...pointValide, longitude: null }] },
                'longitude',
            ],
        ])('alors le message nomme %s', (_cas, trajet, champ) => {
            expect(() => importerTrajetDepuisJson(fichierDont(trajet))).toThrow(
                `Fichier incomplet : ${champ} manquant ou invalide.`,
            );
        });
    });

    describe('Étant donné un fichier invalide, quand je l’importe', () => {
        it('alors des données d’image qui ne sont pas du base64 sont refusées', () => {
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

            expect(() => importerTrajetDepuisJson(json)).toThrow(
                'Fichier incomplet : données d’image illisibles.',
            );
        });

        it('alors un texte qui n’est pas du JSON est refusé avec un message clair', () => {
            expect(() => importerTrajetDepuisJson('pas du json')).toThrow(
                'Fichier illisible : ce n’est pas un fichier JSON.',
            );
        });

        it('alors un JSON qui n’est pas un objet (tableau, null) est refusé', () => {
            expect(() => importerTrajetDepuisJson('[]')).toThrow(
                'Fichier incomplet : fichier manquant ou invalide.',
            );
            expect(() => importerTrajetDepuisJson('null')).toThrow(
                'Fichier incomplet : fichier manquant ou invalide.',
            );
        });

        it('alors un trajet dont les images ne sont pas des objets est refusé', () => {
            const json = JSON.stringify({
                application: 'etudes2lignes',
                version: 1,
                trajet: { nom: 'Cassé', images: ['pas un objet'], points: [] },
            });

            expect(() => importerTrajetDepuisJson(json)).toThrow(
                'Fichier incomplet : images[0] manquant ou invalide.',
            );
        });

        it('alors un JSON d’une autre application est refusé', () => {
            expect(() => importerTrajetDepuisJson('{"application":"autre"}')).toThrow(
                'Ce fichier ne vient pas d’Etudes2Lignes.',
            );
        });

        it('alors une version inconnue est refusée', () => {
            expect(() =>
                importerTrajetDepuisJson('{"application":"etudes2lignes","version":2}'),
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

            expect(() => importerTrajetDepuisJson(json)).toThrow(
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

            expect(() => importerTrajetDepuisJson(json)).toThrow(
                'Fichier incomplet : données d’image manquantes.',
            );
        });
    });
});
