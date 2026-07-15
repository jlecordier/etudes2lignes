import { describe, expect, it } from 'vitest';
import { Coordonnee } from '../domain/Coordonnee';
import { FractionVerticale } from '../domain/FractionVerticale';
import { NomDeTrajet } from '../domain/NomDeTrajet';
import { Trajet } from '../domain/Trajet';
import { exporterTrajetEnJson, importerTrajetDepuisJson } from './trajetJson';

async function trajetComplet(): Promise<Trajet> {
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
            const original = await trajetComplet();

            const json = await exporterTrajetEnJson(original);
            const copie = await importerTrajetDepuisJson(json);

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
            expect(await copie.images[0]!.blob.text()).toBe('contenu de la page 1');
            expect(await copie.images[1]!.blob.text()).toBe('page 2');

            const points = copie.ordreVoyageDesPoints();
            expect(points).toHaveLength(2);
            expect(points[0]!.imageId).toBe(copie.images[0]!.id);
            expect(points[0]!.fraction.valeur).toBe(0.42);
            expect(points[0]!.coordonnee.latitude).toBe(46.5802);
            expect(points[1]!.imageId).toBe(copie.images[1]!.id);
            expect(points[1]!.coordonnee.longitude).toBe(0.1562);
        });

        it('alors deux imports du même fichier donnent deux trajets aux identifiants distincts', async () => {
            const json = await exporterTrajetEnJson(await trajetComplet());

            const premier = await importerTrajetDepuisJson(json);
            const second = await importerTrajetDepuisJson(json);

            expect(second.id).not.toBe(premier.id);
        });
    });

    describe('Étant donné le format du fichier', () => {
        it('alors il déclare l’application et la version, et les images sont en base64', async () => {
            const json = await exporterTrajetEnJson(await trajetComplet());
            const contenu = JSON.parse(json);

            expect(contenu.application).toBe('etudes2lignes');
            expect(contenu.version).toBe(1);
            expect(contenu.trajet.images[0].donneesBase64).toBe(
                Buffer.from('contenu de la page 1').toString('base64'),
            );
        });
    });

    describe('Étant donné un fichier invalide, quand je l’importe', () => {
        it('alors un texte qui n’est pas du JSON est refusé avec un message clair', async () => {
            await expect(importerTrajetDepuisJson('pas du json')).rejects.toThrow(
                'Fichier illisible : ce n’est pas un fichier JSON.',
            );
        });

        it('alors un JSON d’une autre application est refusé', async () => {
            await expect(importerTrajetDepuisJson('{"application":"autre"}')).rejects.toThrow(
                'Ce fichier ne vient pas d’Etudes2Lignes.',
            );
        });

        it('alors une version inconnue est refusée', async () => {
            await expect(
                importerTrajetDepuisJson('{"application":"etudes2lignes","version":2}'),
            ).rejects.toThrow(
                'Version de fichier inconnue (2) : cette application lit la version 1.',
            );
        });

        it('alors un point visant une image inexistante est refusé', async () => {
            const json = JSON.stringify({
                application: 'etudes2lignes',
                version: 1,
                trajet: {
                    nom: 'Cassé',
                    images: [],
                    points: [{ image: 0, fraction: 0.5, latitude: 46, longitude: 2 }],
                },
            });

            await expect(importerTrajetDepuisJson(json)).rejects.toThrow(
                'Fichier incohérent : un point vise une image absente du fichier.',
            );
        });

        it('alors une image sans données (base64 vide) est refusée plutôt que créée à 0 octet', async () => {
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

            await expect(importerTrajetDepuisJson(json)).rejects.toThrow(
                'Fichier incomplet : données d’image manquantes.',
            );
        });
    });
});
