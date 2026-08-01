import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { Coordonnee } from '../domain/Coordonnee';
import { FractionVerticale } from '../domain/FractionVerticale';
import { NomDeTrajet } from '../domain/NomDeTrajet';
import { Trajet, type ImageDeTrajet, type Point } from '../domain/Trajet';
import type { ImageId, PointId, TrajetId } from '../domain/ids';
import type { TrajetSummary, TrajetRepository } from '../ports/TrajetRepository';
import {
    isPositiveInteger,
    isFiniteNumber,
    isObject,
    isStringArray,
    isArrayBuffer,
    isString,
    isDate,
} from '../serialization/predicats';

interface TrajetRecord {
    id: string;
    nom: string;
    creeLe: Date;
    imageIds: string[];
}

interface ImageRecord {
    id: string;
    trajetId: string;
    nom: string;
    // ArrayBuffer plutôt que Blob : le clonage de Blob dans IndexedDB
    // a longtemps été fragile sur Safari, le tampon brut passe partout.
    donnees: ArrayBuffer;
    type: string;
    largeur: number;
    hauteur: number;
}

interface PointRecord {
    id: string;
    trajetId: string;
    imageId: string;
    fraction: number;
    latitude: number;
    longitude: number;
}

/**
 * Ce schéma décrit ce que l'adapter **écrit**. Il ne prouve rien sur ce qu'il
 * **relit** : les enregistrements déjà en base sont des données externes, donc
 * vérifiés champ par champ à la relecture (cf. `input`).
 */
interface Schema extends DBSchema {
    trajets: { key: string; value: TrajetRecord };
    images: { key: string; value: ImageRecord; indexes: { parTrajet: string } };
    points: { key: string; value: PointRecord; indexes: { parTrajet: string } };
}

/** Un enregistrement de trajet dont les champs ont été vérifiés à la relecture. */
interface CheckedTrajet {
    id: string;
    nom: string;
    creeLe: Date;
    imageIds: string[];
}

/** Persistance des trajets dans IndexedDB (via la bibliothèque idb). */
export class IdbTrajetRepository implements TrajetRepository {
    private readonly dbPromise: Promise<IDBPDatabase<Schema>>;

    constructor(databaseName = 'etudes2lignes') {
        this.dbPromise = openDatabase(databaseName);
    }

    async listSummaries(): Promise<TrajetSummary[]> {
        const db = await this.dbPromise;
        const records = (await db.getAll('trajets')).map(toCheckedTrajet);
        records.sort((a, b) => a.creeLe.getTime() - b.creeLe.getTime());

        const summaries: TrajetSummary[] = [];
        for (const record of records) {
            summaries.push({
                id: record.id as TrajetId,
                nom: record.nom,
                creeLe: record.creeLe,
                // `imageIds` est la seule définition du nombre d'images : c'est la
                // liste que l'agrégat écrit et relit. Compter les enregistrements
                // du magasin en donnerait une seconde (et une requête par trajet).
                imageCount: record.imageIds.length,
                pointCount: await db.countFromIndex('points', 'parTrajet', record.id),
            });
        }
        return summaries;
    }

    async load(id: TrajetId): Promise<Trajet | null> {
        const db = await this.dbPromise;
        const record = await db.get('trajets', id);
        if (record === undefined) {
            return null;
        }
        const trajetLu = toCheckedTrajet(record);
        const images = await db.getAllFromIndex('images', 'parTrajet', id);
        const points = await db.getAllFromIndex('points', 'parTrajet', id);
        const imagesById = indexById(images);
        return Trajet.rehydrate({
            id,
            nom: NomDeTrajet.create(trajetLu.nom),
            creeLe: trajetLu.creeLe,
            // `imageIds` porte l'ordre du voyage. Une image listée mais absente du
            // magasin fait refuser la lecture (politique déclarée par le port) ;
            // un enregistrement présent mais non listé n'est pas de l'agrégat.
            images: trajetLu.imageIds.map((imageId) =>
                toDomainImage(imageId, requireImage(imagesById, imageId)),
            ),
            points: points.map(toDomainPoint),
        });
    }

    async save(trajet: Trajet): Promise<void> {
        const db = await this.dbPromise;
        // Les blobs sont convertis AVANT d'ouvrir la transaction : attendre une
        // promesse étrangère à IndexedDB fermerait la transaction en cours
        // (ADR 0005). Cette pré-lecture ne sert donc qu'à savoir quoi convertir.
        const alreadyStored = new Set(
            await db.getAllKeysFromIndex('images', 'parTrajet', trajet.id),
        );
        const newImages = trajet.images.filter((image) => !alreadyStored.has(image.id));
        const imagesWithData: { image: ImageDeTrajet; data: ArrayBuffer }[] = [];
        for (const image of newImages) {
            imagesWithData.push({ image, data: await image.blob.arrayBuffer() });
        }

        const transaction = db.transaction(['trajets', 'images', 'points'], 'readwrite');
        void transaction.objectStore('trajets').put({
            id: trajet.id,
            nom: trajet.nom.value,
            creeLe: trajet.creeLe,
            imageIds: trajet.images.map((image) => image.id),
        });

        const currentImageIds = new Set<string>(trajet.images.map((image) => image.id));
        // Les clés sont relues DANS la transaction, comme celles des points : la
        // pré-lecture ci-dessus est un instantané déjà périmé, et décider une
        // suppression dessus laisserait deux sauvegardes rapprochées effacer une
        // image que l'autre vient d'écrire. Le contrat du port promet « tout ou
        // rien » : la décision doit se prendre là où l'écriture est protégée.
        const imageKeys = await transaction
            .objectStore('images')
            .index('parTrajet')
            .getAllKeys(trajet.id);
        for (const key of imageKeys) {
            if (!currentImageIds.has(key)) {
                void transaction.objectStore('images').delete(key);
            }
        }
        for (const { image, data } of imagesWithData) {
            void transaction.objectStore('images').put({
                id: image.id,
                trajetId: trajet.id,
                nom: image.nom,
                // Clé du format v1, gelée : elle nomme des octets déjà écrits sur
                // l'appareil. Jamais de propriété raccourcie ici — le nom
                // TypeScript peut bouger, la clé stockée non (ADR 0007).
                donnees: data,
                type: image.blob.type,
                largeur: image.largeur,
                hauteur: image.hauteur,
            });
        }

        const pointKeys = await transaction
            .objectStore('points')
            .index('parTrajet')
            .getAllKeys(trajet.id);
        for (const key of pointKeys) {
            void transaction.objectStore('points').delete(key);
        }
        for (const point of trajet.points) {
            void transaction.objectStore('points').put({
                id: point.id,
                trajetId: trajet.id,
                imageId: point.imageId,
                fraction: point.fraction.value,
                latitude: point.coordonnee.latitude,
                longitude: point.coordonnee.longitude,
            });
        }

        await transaction.done;
    }

    async delete(id: TrajetId): Promise<void> {
        const db = await this.dbPromise;
        const transaction = db.transaction(['trajets', 'images', 'points'], 'readwrite');
        void transaction.objectStore('trajets').delete(id);
        for (const key of await transaction
            .objectStore('images')
            .index('parTrajet')
            .getAllKeys(id)) {
            void transaction.objectStore('images').delete(key);
        }
        for (const key of await transaction
            .objectStore('points')
            .index('parTrajet')
            .getAllKeys(id)) {
            void transaction.objectStore('points').delete(key);
        }
        await transaction.done;
    }
}

function openDatabase(name: string): Promise<IDBPDatabase<Schema>> {
    return openDB<Schema>(name, 1, {
        upgrade(db) {
            db.createObjectStore('trajets', { keyPath: 'id' });
            db.createObjectStore('images', { keyPath: 'id' }).createIndex('parTrajet', 'trajetId');
            db.createObjectStore('points', { keyPath: 'id' }).createIndex('parTrajet', 'trajetId');
        },
        // La version est épinglée à 1 : ces deux cas ne surviennent qu'entre deux
        // fenêtres dont l'une embarque une autre version de l'application. On ne
        // peut rien réparer ici, mais sans trace l'utilisateur n'aurait qu'un
        // écran vide, et la promesse d'ouverture rejetterait sans explication.
        blocked(openedVersion, expectedVersion) {
            console.warn(
                `Base « ${name} » bloquée : une autre fenêtre garde la version ` +
                    `${openedVersion} ouverte, la version ${expectedVersion ?? '?'} attend. ` +
                    `Fermez les autres onglets d’Etudes2Lignes.`,
            );
        },
        blocking(openedVersion, expectedVersion) {
            console.warn(
                `Cette fenêtre (version ${openedVersion}) empêche une autre d’ouvrir la ` +
                    `version ${expectedVersion ?? '?'} de la base « ${name} » : rechargez la page.`,
            );
        },
    });
}

// --- Relecture : les enregistrements sont des données externes ------------------

/**
 * Un champ relu de la base, vérifié par un prédicat partagé avec l'import JSON.
 * Le message est destiné à l'utilisateur : c'est lui que l'écran affiche.
 */
function field<T>(
    record: Record<string, unknown>,
    name: string,
    isValid: (value: unknown) => value is T,
): T {
    const value = record[name];
    if (!isValid(value)) {
        throw new Error(`Trajet illisible : le champ « ${name} » est invalide dans la base.`);
    }
    return value;
}

/**
 * Garde de ceinture, en pratique inatteignable : les trois magasins ont un
 * `keyPath`, et IndexedDB refuse d'écrire une valeur dont il ne peut pas
 * extraire la clé — donc tout ce qu'il rend est un objet. Elle existe pour que
 * la validation des champs, elle, puisse partir d'un socle sûr sans `as`
 * (ADR 0002). Les tests de mutation la signaleront toujours : c'est attendu.
 */
function databaseObject(value: unknown, label: string): Record<string, unknown> {
    if (!isObject(value)) {
        throw new Error(`Trajet illisible : ${label} est illisible dans la base.`);
    }
    return value;
}

function toCheckedTrajet(record: unknown): CheckedTrajet {
    const fields = databaseObject(record, 'l’enregistrement du trajet');
    return {
        id: field(fields, 'id', isString),
        nom: field(fields, 'nom', isString),
        creeLe: field(fields, 'creeLe', isDate),
        imageIds: field(fields, 'imageIds', isStringArray),
    };
}

/**
 * Indexe les enregistrements d'images par identifiant. Ceux qu'on ne sait pas
 * identifier sont écartés ici : s'ils appartiennent au trajet, `requireImage`
 * les déclarera introuvables ; sinon ils ne sont pas de l'agrégat.
 */
function indexById(records: unknown[]): Map<string, Record<string, unknown>> {
    const byId = new Map<string, Record<string, unknown>>();
    for (const record of records) {
        if (!isObject(record)) {
            continue;
        }
        const id = record['id'];
        if (isString(id)) {
            byId.set(id, record);
        }
    }
    return byId;
}

function requireImage(
    imagesById: Map<string, Record<string, unknown>>,
    imageId: string,
): Record<string, unknown> {
    const record = imagesById.get(imageId);
    if (record === undefined) {
        throw new Error(
            `Trajet illisible : une image de ce trajet est introuvable dans la base (${imageId}).`,
        );
    }
    return record;
}

function toDomainImage(imageId: string, record: Record<string, unknown>): ImageDeTrajet {
    return {
        id: imageId as ImageId,
        nom: field(record, 'nom', isString),
        blob: new Blob([field(record, 'donnees', isArrayBuffer)], {
            type: field(record, 'type', isString),
        }),
        largeur: field(record, 'largeur', isPositiveInteger),
        hauteur: field(record, 'hauteur', isPositiveInteger),
    };
}

function toDomainPoint(record: unknown): Point {
    const fields = databaseObject(record, 'l’enregistrement d’un point');
    return {
        id: field(fields, 'id', isString) as PointId,
        imageId: field(fields, 'imageId', isString) as ImageId,
        fraction: FractionVerticale.create(field(fields, 'fraction', isFiniteNumber)),
        coordonnee: Coordonnee.create(
            field(fields, 'latitude', isFiniteNumber),
            field(fields, 'longitude', isFiniteNumber),
        ),
    };
}
