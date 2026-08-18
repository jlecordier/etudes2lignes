import 'fake-indexeddb/auto';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { beforeEach, describe, expect, it } from 'vitest';
import { requireElementAt } from '../../shared/array';
import { Coordonnee } from '../domain/Coordonnee';
import { FractionVerticale } from '../domain/FractionVerticale';
import { NomDeTrajet } from '../domain/NomDeTrajet';
import { Trajet } from '../domain/Trajet';
import type { TrajetId } from '../domain/ids';
import { IdbTrajetRepository } from './IdbTrajetRepository';

let repository: IdbTrajetRepository;
let databaseName: string;

beforeEach(() => {
    databaseName = `test-${crypto.randomUUID()}`;
    repository = new IdbTrajetRepository(databaseName);
});

/**
 * Vue directe du stockage : elle sert à poser des enregistrements à la main
 * (y compris invalides, ce que le repository ne saurait pas écrire) et à
 * observer l'état réel du magasin.
 */
interface TestSchema extends DBSchema {
    trajets: { key: string; value: Record<string, unknown> };
    images: { key: string; value: Record<string, unknown>; indexes: { parTrajet: string } };
    points: { key: string; value: Record<string, unknown>; indexes: { parTrajet: string } };
}

async function withDatabase<T>(action: (db: IDBPDatabase<TestSchema>) => Promise<T>): Promise<T> {
    const db = await openDB<TestSchema>(databaseName);
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
function rendezvous(): {
    atteint: Promise<void>;
    attendre: () => Promise<void>;
    release: () => void;
} {
    let signaler: (() => void) | undefined;
    let release: (() => void) | undefined;
    const atteint = new Promise<void>((resolve) => {
        signaler = resolve;
    });
    const ouvert = new Promise<void>((resolve) => {
        release = resolve;
    });
    return {
        atteint,
        attendre: async () => {
            signaler?.();
            await ouvert;
        },
        release: () => {
            release?.();
        },
    };
}

/** Image dont la conversion en octets ne s'achève que sur ordre du test. */
class DelayedBlob extends Blob {
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
class CountingBlob extends Blob {
    conversions = 0;

    override arrayBuffer(): Promise<ArrayBuffer> {
        this.conversions++;
        return super.arrayBuffer();
    }
}

async function requireLoaded(id: TrajetId): Promise<Trajet> {
    const trajet = await repository.load(id);
    if (trajet === null) {
        throw new Error('Ce trajet devrait être en base.');
    }
    return trajet;
}

function imageRecord(
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

function trajetWithImageAndPoint(creeLe = new Date('2026-07-10T10:00:00Z')): Trajet {
    const trajet = Trajet.create(NomDeTrajet.create('Paris → Bordeaux'), creeLe);
    const imageId = trajet.addImage({
        nom: 'page-1.jpg',
        blob: new Blob(['contenu de la page 1'], { type: 'image/jpeg' }),
        largeur: 2481,
        hauteur: 3508,
    });
    trajet.addPoint({
        imageId,
        fraction: FractionVerticale.create(0.42),
        coordonnee: Coordonnee.create(46.5802, 0.3404),
    });
    return trajet;
}

describe('IdbTrajetRepository', () => {
    describe('Étant donné un trajet sauvegardé, quand je le charge', () => {
        it('alors je retrouve son nom, ses images (ordre, dimensions, contenu) et ses points', async () => {
            const original = trajetWithImageAndPoint();

            await repository.save(original);
            const loaded = await repository.load(original.id);

            expect(loaded).not.toBeNull();
            if (loaded === null) {
                throw new Error('Le trajet sauvegardé devrait être rechargeable.');
            }
            expect(loaded.nom.value).toBe('Paris → Bordeaux');
            expect(loaded.images).toHaveLength(1);
            const image = requireElementAt(loaded.images, 0);
            expect(image.nom).toBe('page-1.jpg');
            expect(image.largeur).toBe(2481);
            expect(image.hauteur).toBe(3508);
            expect(await image.blob.text()).toBe('contenu de la page 1');
            // Le type est reconstruit à la relecture (les octets sont stockés nus,
            // cf. ADR 0005) : sans lui, le navigateur devinerait le format de la
            // page à l'affichage.
            expect(image.blob.type).toBe('image/jpeg');
            const point = requireElementAt(loaded.points, 0);
            expect(point.imageId).toBe(image.id);
            expect(point.fraction.value).toBe(0.42);
            expect(point.coordonnee.latitude).toBe(46.5802);
        });
    });

    describe('Étant donné un identifiant inconnu, quand je charge', () => {
        it('alors je reçois null', async () => {
            const inexistant = Trajet.create(NomDeTrajet.create('Fantôme'));

            expect(await repository.load(inexistant.id)).toBeNull();
        });
    });

    describe('Étant donné un trajet déjà en base, quand je le resauvegarde', () => {
        it('alors les octets des images déjà stockées ne sont pas reconvertis', async () => {
            const page = new CountingBlob(['contenu de la page 1'], { type: 'image/jpeg' });
            const trajet = Trajet.create(NomDeTrajet.create('Paris → Bordeaux'));
            trajet.addImage({ nom: 'page-1.jpg', blob: page, largeur: 2481, hauteur: 3508 });
            await repository.save(trajet);

            trajet.rename(NomDeTrajet.create('Bordeaux → Paris'));
            await repository.save(trajet);

            // Une page de schéma pèse des dizaines de mégaoctets : la relire à
            // chaque enregistrement, pour des octets qui n'ont pas changé,
            // rendrait le moindre déplacement de point pénible sur mobile.
            expect(page.conversions).toBe(1);
            expect((await requireLoaded(trajet.id)).nom.value).toBe('Bordeaux → Paris');
        });
    });

    describe('Étant donné un trajet modifié (renommé, image supprimée), quand je le resauvegarde', () => {
        it('alors le chargement reflète la modification et la cascade', async () => {
            const trajet = trajetWithImageAndPoint();
            await repository.save(trajet);

            trajet.rename(NomDeTrajet.create('Bordeaux → Paris'));
            trajet.deleteImage(requireElementAt(trajet.images, 0).id);
            await repository.save(trajet);

            const loaded = await repository.load(trajet.id);
            expect(loaded).not.toBeNull();
            if (loaded === null) {
                throw new Error('Le trajet modifié devrait être rechargeable.');
            }
            expect(loaded.nom.value).toBe('Bordeaux → Paris');
            expect(loaded.images).toHaveLength(0);
            expect(loaded.points).toHaveLength(0);
        });
    });

    describe('Étant donné deux trajets sauvegardés', () => {
        it('alors la liste des résumés les rend du plus ancien au plus récent, avec leurs comptes', async () => {
            const first = trajetWithImageAndPoint(new Date('2026-07-10T10:00:00Z'));
            const second = Trajet.create(
                NomDeTrajet.create('Paris → Marseille'),
                new Date('2026-07-10T11:00:00Z'),
            );
            await repository.save(first);
            await repository.save(second);

            const summaries = await repository.listSummaries();

            expect(summaries.map((summary) => summary.nom)).toEqual([
                'Paris → Bordeaux',
                'Paris → Marseille',
            ]);
            expect(requireElementAt(summaries, 0).imageCount).toBe(1);
            expect(requireElementAt(summaries, 0).pointCount).toBe(1);
            expect(requireElementAt(summaries, 1).imageCount).toBe(0);
        });

        it("alors l'ordre vient des dates, jamais de l'ordre des clés en base", async () => {
            // `getAll` rend les enregistrements dans l'ordre de leurs clés — des
            // identifiants aléatoires en production. On pose donc des clés dont
            // l'ordre ne suit ni les dates ni leur inverse : seul un vrai tri
            // par date peut alors rendre la liste attendue.
            await withDatabase(async (db) => {
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

            const summaries = await repository.listSummaries();

            expect(summaries.map((summary) => summary.nom)).toEqual(['Ancien', 'Milieu', 'Récent']);
        });

        it("quand j'en supprime un, alors lui seul disparaît, avec ses images et ses points", async () => {
            const toDelete = trajetWithImageAndPoint();
            const aGarder = trajetWithImageAndPoint();
            await repository.save(toDelete);
            await repository.save(aGarder);

            await repository.delete(toDelete.id);

            expect(await repository.load(toDelete.id)).toBeNull();
            const garde = await repository.load(aGarder.id);
            expect(garde).not.toBeNull();
            if (garde === null) {
                throw new Error('Le trajet conservé devrait être rechargeable.');
            }
            expect(garde.images).toHaveLength(1);
            expect(garde.points).toHaveLength(1);
            expect(await repository.listSummaries()).toHaveLength(1);
        });

        it("quand j'en supprime un, alors ses images et ses points quittent vraiment les magasins", async () => {
            const toDelete = trajetWithImageAndPoint();
            const aGarder = trajetWithImageAndPoint();
            await repository.save(toDelete);
            await repository.save(aGarder);

            await repository.delete(toDelete.id);

            // Un trajet effacé dont les enregistrements restent laisserait des
            // pages de plusieurs dizaines de mégaoctets sans propriétaire : le
            // quota déborderait sans que l'utilisateur puisse rien libérer,
            // puisque le trajet a disparu de sa liste. `charger` rendant `null`
            // ne le dit pas — il faut regarder les magasins.
            const restants = await withDatabase(async (db) => ({
                images: await db.getAllKeysFromIndex('images', 'parTrajet', toDelete.id),
                points: await db.getAllKeysFromIndex('points', 'parTrajet', toDelete.id),
            }));

            expect(restants).toEqual({ images: [], points: [] });
            const conserves = await withDatabase(async (db) => ({
                images: await db.getAllKeysFromIndex('images', 'parTrajet', aGarder.id),
                points: await db.getAllKeysFromIndex('points', 'parTrajet', aGarder.id),
            }));
            expect(conserves.images).toHaveLength(1);
            expect(conserves.points).toHaveLength(1);
        });
    });

    describe("Étant donné deux sauvegardes du même trajet qui s'entrelacent", () => {
        it("alors le magasin d'images ne garde que les images du trajet enregistré en dernier", async () => {
            const trajet = trajetWithImageAndPoint();
            await repository.save(trajet);
            const copyA = await requireLoaded(trajet.id);
            const copyB = await requireLoaded(trajet.id);

            // A ajoute une image dont la conversion en octets est retenue : sa
            // pré-lecture des clés est donc faite, mais sa transaction n'est pas
            // encore ouverte quand B écrit.
            const barriere = rendezvous();
            copyA.addImage({
                nom: 'page-2.png',
                blob: new DelayedBlob(barriere.attendre, ['page 2'], 'image/png'),
                largeur: 100,
                hauteur: 200,
            });
            const saveOfA = repository.save(copyA);
            await barriere.atteint;

            copyB.addImage({
                nom: 'page-3.png',
                blob: new Blob(['page 3'], { type: 'image/png' }),
                largeur: 300,
                hauteur: 400,
            });
            await repository.save(copyB);

            barriere.release();
            await saveOfA;

            const loaded = await requireLoaded(trajet.id);
            expect(loaded.images.map((image) => image.nom)).toEqual(['page-1.jpg', 'page-2.png']);
            const keysInDatabase = await withDatabase((db) =>
                db.getAllKeysFromIndex('images', 'parTrajet', trajet.id),
            );
            expect([...keysInDatabase].sort()).toEqual([...copyA.images.map((i) => i.id)].sort());
        });
    });

    describe("Étant donné un enregistrement d'image que le trajet ne liste pas", () => {
        it('alors il est ignoré : ni compté dans le résumé, ni chargé', async () => {
            const trajet = trajetWithImageAndPoint();
            await repository.save(trajet);

            await withDatabase((db) => db.put('images', imageRecord(trajet.id, 'orpheline', {})));

            expect(requireElementAt(await repository.listSummaries(), 0).imageCount).toBe(1);
            const loaded = await requireLoaded(trajet.id);
            expect(loaded.images.map((image) => image.nom)).toEqual(['page-1.jpg']);
        });
    });

    describe('Étant donné une base dont une image listée est absente du magasin', () => {
        it('alors le chargement est refusé, plutôt que de rendre un trajet amputé', async () => {
            const trajet = trajetWithImageAndPoint();
            await repository.save(trajet);
            const imageId = requireElementAt(trajet.images, 0).id;

            await withDatabase((db) => db.delete('images', imageId));

            await expect(repository.load(trajet.id)).rejects.toThrow(
                `Trajet illisible : une image de ce trajet est introuvable dans la base (${imageId}).`,
            );
        });
    });

    describe("Étant donné un enregistrement d'image invalide en base", () => {
        it("alors une largeur qui n'est pas un nombre fait refuser le chargement", async () => {
            const trajet = trajetWithImageAndPoint();
            await repository.save(trajet);
            const imageId = requireElementAt(trajet.images, 0).id;

            await withDatabase((db) =>
                db.put('images', imageRecord(trajet.id, imageId, { largeur: 'très large' })),
            );

            await expect(repository.load(trajet.id)).rejects.toThrow(
                'Trajet illisible : le champ « largeur » est invalide dans la base.',
            );
        });

        it("alors des données qui ne sont pas un tampon d'octets font refuser le chargement", async () => {
            const trajet = trajetWithImageAndPoint();
            await repository.save(trajet);
            const imageId = requireElementAt(trajet.images, 0).id;

            await withDatabase((db) =>
                db.put('images', imageRecord(trajet.id, imageId, { donnees: 'pas des octets' })),
            );

            await expect(repository.load(trajet.id)).rejects.toThrow(
                'Trajet illisible : le champ « donnees » est invalide dans la base.',
            );
        });
    });

    describe('Étant donné un enregistrement de trajet invalide en base', () => {
        it('alors une date de création illisible fait refuser la lecture', async () => {
            const trajet = trajetWithImageAndPoint();
            await repository.save(trajet);

            await withDatabase((db) =>
                db.put('trajets', {
                    id: trajet.id,
                    nom: 'Paris → Bordeaux',
                    creeLe: 'hier',
                    imageIds: [],
                }),
            );

            await expect(repository.load(trajet.id)).rejects.toThrow(
                'Trajet illisible : le champ « creeLe » est invalide dans la base.',
            );
            await expect(repository.listSummaries()).rejects.toThrow(
                'Trajet illisible : le champ « creeLe » est invalide dans la base.',
            );
        });
    });
});
