import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { elementA } from '../../commun/tableau';
import { Coordonnee } from '../domain/Coordonnee';
import { FractionVerticale } from '../domain/FractionVerticale';
import { NomDeTrajet } from '../domain/NomDeTrajet';
import { Trajet } from '../domain/Trajet';
import { IdbTrajetRepository } from './IdbTrajetRepository';

let repository: IdbTrajetRepository;

beforeEach(() => {
    repository = new IdbTrajetRepository(`test-${crypto.randomUUID()}`);
});

function trajetAvecImageEtPoint(creeLe = new Date('2026-07-10T10:00:00Z')): Trajet {
    const trajet = Trajet.creer(NomDeTrajet.creer('Paris → Bordeaux'), creeLe);
    const imageId = trajet.ajouterImage({
        nom: 'page-1.jpg',
        blob: new Blob(['contenu de la page 1'], { type: 'image/jpeg' }),
        largeur: 2481,
        hauteur: 3508,
    });
    trajet.ajouterPoint({
        imageId,
        fraction: FractionVerticale.creer(0.42),
        coordonnee: Coordonnee.creer(46.5802, 0.3404),
    });
    return trajet;
}

describe('IdbTrajetRepository', () => {
    describe('Étant donné un trajet sauvegardé, quand je le charge', () => {
        it('alors je retrouve son nom, ses images (ordre, dimensions, contenu) et ses points', async () => {
            const original = trajetAvecImageEtPoint();

            await repository.sauvegarder(original);
            const charge = await repository.charger(original.id);

            expect(charge).not.toBeNull();
            if (charge === null) {
                throw new Error('Le trajet sauvegardé devrait être rechargeable.');
            }
            expect(charge.nom.valeur).toBe('Paris → Bordeaux');
            expect(charge.images).toHaveLength(1);
            const image = elementA(charge.images, 0);
            expect(image.nom).toBe('page-1.jpg');
            expect(image.largeur).toBe(2481);
            expect(image.hauteur).toBe(3508);
            expect(await image.blob.text()).toBe('contenu de la page 1');
            const point = elementA(charge.points, 0);
            expect(point.imageId).toBe(image.id);
            expect(point.fraction.valeur).toBe(0.42);
            expect(point.coordonnee.latitude).toBe(46.5802);
        });
    });

    describe('Étant donné un identifiant inconnu, quand je charge', () => {
        it('alors je reçois null', async () => {
            const inexistant = Trajet.creer(NomDeTrajet.creer('Fantôme'));

            expect(await repository.charger(inexistant.id)).toBeNull();
        });
    });

    describe('Étant donné un trajet modifié (renommé, image supprimée), quand je le resauvegarde', () => {
        it('alors le chargement reflète la modification et la cascade', async () => {
            const trajet = trajetAvecImageEtPoint();
            await repository.sauvegarder(trajet);

            trajet.renommer(NomDeTrajet.creer('Bordeaux → Paris'));
            trajet.supprimerImage(elementA(trajet.images, 0).id);
            await repository.sauvegarder(trajet);

            const charge = await repository.charger(trajet.id);
            expect(charge).not.toBeNull();
            if (charge === null) {
                throw new Error('Le trajet modifié devrait être rechargeable.');
            }
            expect(charge.nom.valeur).toBe('Bordeaux → Paris');
            expect(charge.images).toHaveLength(0);
            expect(charge.points).toHaveLength(0);
        });
    });

    describe('Étant donné deux trajets sauvegardés', () => {
        it('alors la liste des résumés les rend du plus ancien au plus récent, avec leurs comptes', async () => {
            const premier = trajetAvecImageEtPoint(new Date('2026-07-10T10:00:00Z'));
            const second = Trajet.creer(
                NomDeTrajet.creer('Paris → Marseille'),
                new Date('2026-07-10T11:00:00Z'),
            );
            await repository.sauvegarder(premier);
            await repository.sauvegarder(second);

            const resumes = await repository.listerResumes();

            expect(resumes.map((resume) => resume.nom)).toEqual([
                'Paris → Bordeaux',
                'Paris → Marseille',
            ]);
            expect(elementA(resumes, 0).nombreDImages).toBe(1);
            expect(elementA(resumes, 0).nombreDePoints).toBe(1);
            expect(elementA(resumes, 1).nombreDImages).toBe(0);
        });

        it('quand j’en supprime un, alors lui seul disparaît, avec ses images et ses points', async () => {
            const aSupprimer = trajetAvecImageEtPoint();
            const aGarder = trajetAvecImageEtPoint();
            await repository.sauvegarder(aSupprimer);
            await repository.sauvegarder(aGarder);

            await repository.supprimer(aSupprimer.id);

            expect(await repository.charger(aSupprimer.id)).toBeNull();
            const garde = await repository.charger(aGarder.id);
            expect(garde).not.toBeNull();
            if (garde === null) {
                throw new Error('Le trajet conservé devrait être rechargeable.');
            }
            expect(garde.images).toHaveLength(1);
            expect(garde.points).toHaveLength(1);
            expect(await repository.listerResumes()).toHaveLength(1);
        });
    });
});
