import 'fake-indexeddb/auto';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { beforeEach, describe, expect, it } from 'vitest';
import { elementA } from '../../commun/tableau';
import { Coordonnee } from '../domain/Coordonnee';
import { FractionVerticale } from '../domain/FractionVerticale';
import { NomDeTrajet } from '../domain/NomDeTrajet';
import { Trajet } from '../domain/Trajet';
import type { TrajetId } from '../domain/ids';
import { IdbTrajetRepository } from './IdbTrajetRepository';

let repository: IdbTrajetRepository;
let nomDeBase: string;

beforeEach(() => {
    nomDeBase = `test-${crypto.randomUUID()}`;
    repository = new IdbTrajetRepository(nomDeBase);
});

/**
 * Vue directe du stockage : elle sert à poser des enregistrements à la main
 * (y compris invalides, ce que le repository ne saurait pas écrire) et à
 * observer l'état réel du magasin.
 */
interface SchemaDeTest extends DBSchema {
    trajets: { key: string; value: Record<string, unknown> };
    images: { key: string; value: Record<string, unknown>; indexes: { parTrajet: string } };
    points: { key: string; value: Record<string, unknown>; indexes: { parTrajet: string } };
}

async function surLaBase<T>(action: (db: IDBPDatabase<SchemaDeTest>) => Promise<T>): Promise<T> {
    const db = await openDB<SchemaDeTest>(nomDeBase);
    try {
        return await action(db);
    } finally {
        db.close();
    }
}

/**
 * Rendez-vous manuel : le code retardé signale son passage puis attend l'ordre
 * du test. C'est ce qui rend l'entrelacement de deux sauvegardes déterministe.
 */
function rendezVous(): {
    atteint: Promise<void>;
    attendre: () => Promise<void>;
    laisserPasser: () => void;
} {
    let signaler: (() => void) | undefined;
    let ouvrir: (() => void) | undefined;
    const atteint = new Promise<void>((resoudre) => {
        signaler = resoudre;
    });
    const ouvert = new Promise<void>((resoudre) => {
        ouvrir = resoudre;
    });
    return {
        atteint,
        attendre: async () => {
            signaler?.();
            await ouvert;
        },
        laisserPasser: () => {
            ouvrir?.();
        },
    };
}

/** Image dont la conversion en octets ne s'achève que sur ordre du test. */
class BlobRetarde extends Blob {
    constructor(
        private readonly barriere: () => Promise<void>,
        parties: BlobPart[],
        type: string,
    ) {
        super(parties, { type });
    }

    override async arrayBuffer(): Promise<ArrayBuffer> {
        await this.barriere();
        return super.arrayBuffer();
    }
}

/** Blob qui compte ses conversions en octets, pour observer ce qui est réécrit. */
class BlobCompte extends Blob {
    conversions = 0;

    override arrayBuffer(): Promise<ArrayBuffer> {
        this.conversions++;
        return super.arrayBuffer();
    }
}

async function chargerObligatoire(id: TrajetId): Promise<Trajet> {
    const trajet = await repository.charger(id);
    if (trajet === null) {
        throw new Error('Ce trajet devrait être en base.');
    }
    return trajet;
}

function enregistrementDImage(
    trajetId: TrajetId,
    id: string,
    remplacements: Record<string, unknown> = {},
): Record<string, unknown> {
    return {
        id,
        trajetId,
        nom: 'page-1.jpg',
        donnees: new ArrayBuffer(8),
        type: 'image/jpeg',
        largeur: 2481,
        hauteur: 3508,
        ...remplacements,
    };
}

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
            // Le type est reconstruit à la relecture (les octets sont stockés nus,
            // cf. ADR 0005) : sans lui, le navigateur devinerait le format de la
            // page à l'affichage.
            expect(image.blob.type).toBe('image/jpeg');
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

    describe('Étant donné un trajet déjà en base, quand je le resauvegarde', () => {
        it('alors les octets des images déjà stockées ne sont pas reconvertis', async () => {
            const page = new BlobCompte(['contenu de la page 1'], { type: 'image/jpeg' });
            const trajet = Trajet.creer(NomDeTrajet.creer('Paris → Bordeaux'));
            trajet.ajouterImage({ nom: 'page-1.jpg', blob: page, largeur: 2481, hauteur: 3508 });
            await repository.sauvegarder(trajet);

            trajet.renommer(NomDeTrajet.creer('Bordeaux → Paris'));
            await repository.sauvegarder(trajet);

            // Une page de schéma pèse des dizaines de mégaoctets : la relire à
            // chaque enregistrement, pour des octets qui n'ont pas changé,
            // rendrait le moindre déplacement de point pénible sur mobile.
            expect(page.conversions).toBe(1);
            expect((await chargerObligatoire(trajet.id)).nom.valeur).toBe('Bordeaux → Paris');
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

        it('alors l’ordre vient des dates, jamais de l’ordre des clés en base', async () => {
            // `getAll` rend les enregistrements dans l'ordre de leurs clés — des
            // identifiants aléatoires en production. On pose donc des clés dont
            // l'ordre ne suit ni les dates ni leur inverse : seul un vrai tri
            // par date peut alors rendre la liste attendue.
            await surLaBase(async (db) => {
                await db.put('trajets', {
                    id: 'a',
                    nom: 'Milieu',
                    creeLe: new Date('2026-07-11T10:00:00Z'),
                    imageIds: [],
                });
                await db.put('trajets', {
                    id: 'b',
                    nom: 'Récent',
                    creeLe: new Date('2026-07-12T10:00:00Z'),
                    imageIds: [],
                });
                await db.put('trajets', {
                    id: 'c',
                    nom: 'Ancien',
                    creeLe: new Date('2026-07-10T10:00:00Z'),
                    imageIds: [],
                });
            });

            const resumes = await repository.listerResumes();

            expect(resumes.map((resume) => resume.nom)).toEqual(['Ancien', 'Milieu', 'Récent']);
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

        it('quand j’en supprime un, alors ses images et ses points quittent vraiment les magasins', async () => {
            const aSupprimer = trajetAvecImageEtPoint();
            const aGarder = trajetAvecImageEtPoint();
            await repository.sauvegarder(aSupprimer);
            await repository.sauvegarder(aGarder);

            await repository.supprimer(aSupprimer.id);

            // Un trajet effacé dont les enregistrements restent laisserait des
            // pages de plusieurs dizaines de mégaoctets sans propriétaire : le
            // quota déborderait sans que l'utilisateur puisse rien libérer,
            // puisque le trajet a disparu de sa liste. `charger` rendant `null`
            // ne le dit pas — il faut regarder les magasins.
            const restants = await surLaBase(async (db) => ({
                images: await db.getAllKeysFromIndex('images', 'parTrajet', aSupprimer.id),
                points: await db.getAllKeysFromIndex('points', 'parTrajet', aSupprimer.id),
            }));

            expect(restants).toEqual({ images: [], points: [] });
            const conserves = await surLaBase(async (db) => ({
                images: await db.getAllKeysFromIndex('images', 'parTrajet', aGarder.id),
                points: await db.getAllKeysFromIndex('points', 'parTrajet', aGarder.id),
            }));
            expect(conserves.images).toHaveLength(1);
            expect(conserves.points).toHaveLength(1);
        });
    });

    describe('Étant donné deux sauvegardes du même trajet qui s’entrelacent', () => {
        it('alors le magasin d’images ne garde que les images du trajet enregistré en dernier', async () => {
            const trajet = trajetAvecImageEtPoint();
            await repository.sauvegarder(trajet);
            const copieA = await chargerObligatoire(trajet.id);
            const copieB = await chargerObligatoire(trajet.id);

            // A ajoute une image dont la conversion en octets est retenue : sa
            // pré-lecture des clés est donc faite, mais sa transaction n'est pas
            // encore ouverte quand B écrit.
            const barriere = rendezVous();
            copieA.ajouterImage({
                nom: 'page-2.png',
                blob: new BlobRetarde(barriere.attendre, ['page 2'], 'image/png'),
                largeur: 100,
                hauteur: 200,
            });
            const sauvegardeDeA = repository.sauvegarder(copieA);
            await barriere.atteint;

            copieB.ajouterImage({
                nom: 'page-3.png',
                blob: new Blob(['page 3'], { type: 'image/png' }),
                largeur: 300,
                hauteur: 400,
            });
            await repository.sauvegarder(copieB);

            barriere.laisserPasser();
            await sauvegardeDeA;

            const charge = await chargerObligatoire(trajet.id);
            expect(charge.images.map((image) => image.nom)).toEqual(['page-1.jpg', 'page-2.png']);
            const clesEnBase = await surLaBase((db) =>
                db.getAllKeysFromIndex('images', 'parTrajet', trajet.id),
            );
            expect([...clesEnBase].sort()).toEqual([...copieA.images.map((i) => i.id)].sort());
        });
    });

    describe('Étant donné un enregistrement d’image que le trajet ne liste pas', () => {
        it('alors il est ignoré : ni compté dans le résumé, ni chargé', async () => {
            const trajet = trajetAvecImageEtPoint();
            await repository.sauvegarder(trajet);

            await surLaBase((db) =>
                db.put('images', enregistrementDImage(trajet.id, 'orpheline', {})),
            );

            expect(elementA(await repository.listerResumes(), 0).nombreDImages).toBe(1);
            const charge = await chargerObligatoire(trajet.id);
            expect(charge.images.map((image) => image.nom)).toEqual(['page-1.jpg']);
        });
    });

    describe('Étant donné une base dont une image listée est absente du magasin', () => {
        it('alors le chargement est refusé, plutôt que de rendre un trajet amputé', async () => {
            const trajet = trajetAvecImageEtPoint();
            await repository.sauvegarder(trajet);
            const imageId = elementA(trajet.images, 0).id;

            await surLaBase((db) => db.delete('images', imageId));

            await expect(repository.charger(trajet.id)).rejects.toThrow(
                `Trajet illisible : une image de ce trajet est introuvable dans la base (${imageId}).`,
            );
        });
    });

    describe('Étant donné un enregistrement d’image invalide en base', () => {
        it('alors une largeur qui n’est pas un nombre fait refuser le chargement', async () => {
            const trajet = trajetAvecImageEtPoint();
            await repository.sauvegarder(trajet);
            const imageId = elementA(trajet.images, 0).id;

            await surLaBase((db) =>
                db.put(
                    'images',
                    enregistrementDImage(trajet.id, imageId, { largeur: 'très large' }),
                ),
            );

            await expect(repository.charger(trajet.id)).rejects.toThrow(
                'Trajet illisible : le champ « largeur » est invalide dans la base.',
            );
        });

        it('alors des données qui ne sont pas un tampon d’octets font refuser le chargement', async () => {
            const trajet = trajetAvecImageEtPoint();
            await repository.sauvegarder(trajet);
            const imageId = elementA(trajet.images, 0).id;

            await surLaBase((db) =>
                db.put(
                    'images',
                    enregistrementDImage(trajet.id, imageId, { donnees: 'pas des octets' }),
                ),
            );

            await expect(repository.charger(trajet.id)).rejects.toThrow(
                'Trajet illisible : le champ « donnees » est invalide dans la base.',
            );
        });
    });

    describe('Étant donné un enregistrement de trajet invalide en base', () => {
        it('alors une date de création illisible fait refuser la lecture', async () => {
            const trajet = trajetAvecImageEtPoint();
            await repository.sauvegarder(trajet);

            await surLaBase((db) =>
                db.put('trajets', {
                    id: trajet.id,
                    nom: 'Paris → Bordeaux',
                    creeLe: 'hier',
                    imageIds: [],
                }),
            );

            await expect(repository.charger(trajet.id)).rejects.toThrow(
                'Trajet illisible : le champ « creeLe » est invalide dans la base.',
            );
            await expect(repository.listerResumes()).rejects.toThrow(
                'Trajet illisible : le champ « creeLe » est invalide dans la base.',
            );
        });
    });
});
