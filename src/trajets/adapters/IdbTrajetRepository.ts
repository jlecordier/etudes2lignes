import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { Coordonnee } from '../domain/Coordonnee';
import { FractionVerticale } from '../domain/FractionVerticale';
import { NomDeTrajet } from '../domain/NomDeTrajet';
import { Trajet, type ImageDeTrajet, type Point } from '../domain/Trajet';
import type { ImageId, PointId, TrajetId } from '../domain/ids';
import type { ResumeDeTrajet, TrajetRepository } from '../ports/TrajetRepository';
import {
    estUnEntierPositif,
    estUnNombreFini,
    estUnObjet,
    estUnTableauDeChaines,
    estUnTampon,
    estUneChaine,
    estUneDate,
} from '../serialisation/predicats';

interface EnregistrementTrajet {
    id: string;
    nom: string;
    creeLe: Date;
    imageIds: string[];
}

interface EnregistrementImage {
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

interface EnregistrementPoint {
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
 * vérifiés champ par champ à la relecture (cf. `champ`).
 */
interface Schema extends DBSchema {
    trajets: { key: string; value: EnregistrementTrajet };
    images: { key: string; value: EnregistrementImage; indexes: { parTrajet: string } };
    points: { key: string; value: EnregistrementPoint; indexes: { parTrajet: string } };
}

/** Un enregistrement de trajet dont les champs ont été vérifiés à la relecture. */
interface TrajetLu {
    id: string;
    nom: string;
    creeLe: Date;
    imageIds: string[];
}

/** Persistance des trajets dans IndexedDB (via la bibliothèque idb). */
export class IdbTrajetRepository implements TrajetRepository {
    private readonly promesseDb: Promise<IDBPDatabase<Schema>>;

    constructor(nomDeBase = 'etudes2lignes') {
        this.promesseDb = ouvrirBase(nomDeBase);
    }

    async listerResumes(): Promise<ResumeDeTrajet[]> {
        const db = await this.promesseDb;
        const enregistrements = (await db.getAll('trajets')).map(versTrajetLu);
        enregistrements.sort((a, b) => a.creeLe.getTime() - b.creeLe.getTime());

        const resumes: ResumeDeTrajet[] = [];
        for (const enregistrement of enregistrements) {
            resumes.push({
                id: enregistrement.id as TrajetId,
                nom: enregistrement.nom,
                creeLe: enregistrement.creeLe,
                // `imageIds` est la seule définition du nombre d'images : c'est la
                // liste que l'agrégat écrit et relit. Compter les enregistrements
                // du magasin en donnerait une seconde (et une requête par trajet).
                nombreDImages: enregistrement.imageIds.length,
                nombreDePoints: await db.countFromIndex('points', 'parTrajet', enregistrement.id),
            });
        }
        return resumes;
    }

    async charger(id: TrajetId): Promise<Trajet | null> {
        const db = await this.promesseDb;
        const enregistrement = await db.get('trajets', id);
        if (enregistrement === undefined) {
            return null;
        }
        const trajetLu = versTrajetLu(enregistrement);
        const images = await db.getAllFromIndex('images', 'parTrajet', id);
        const points = await db.getAllFromIndex('points', 'parTrajet', id);
        const imagesParId = indexerParId(images);
        return Trajet.rehydrater({
            id,
            nom: NomDeTrajet.creer(trajetLu.nom),
            creeLe: trajetLu.creeLe,
            // `imageIds` porte l'ordre du voyage. Une image listée mais absente du
            // magasin fait refuser la lecture (politique déclarée par le port) ;
            // un enregistrement présent mais non listé n'est pas de l'agrégat.
            images: trajetLu.imageIds.map((imageId) =>
                versImageDuDomaine(imageId, imageObligatoire(imagesParId, imageId)),
            ),
            points: points.map(versPointDuDomaine),
        });
    }

    async sauvegarder(trajet: Trajet): Promise<void> {
        const db = await this.promesseDb;
        // Les blobs sont convertis AVANT d'ouvrir la transaction : attendre une
        // promesse étrangère à IndexedDB fermerait la transaction en cours
        // (ADR 0005). Cette pré-lecture ne sert donc qu'à savoir quoi convertir.
        const dejaStockees = new Set(
            await db.getAllKeysFromIndex('images', 'parTrajet', trajet.id),
        );
        const nouvellesImages = trajet.images.filter((image) => !dejaStockees.has(image.id));
        const imagesAvecDonnees: { image: ImageDeTrajet; donnees: ArrayBuffer }[] = [];
        for (const image of nouvellesImages) {
            imagesAvecDonnees.push({ image, donnees: await image.blob.arrayBuffer() });
        }

        const transaction = db.transaction(['trajets', 'images', 'points'], 'readwrite');
        void transaction.objectStore('trajets').put({
            id: trajet.id,
            nom: trajet.nom.valeur,
            creeLe: trajet.creeLe,
            imageIds: trajet.images.map((image) => image.id),
        });

        const idsDImagesActuels = new Set<string>(trajet.images.map((image) => image.id));
        // Les clés sont relues DANS la transaction, comme celles des points : la
        // pré-lecture ci-dessus est un instantané déjà périmé, et décider une
        // suppression dessus laisserait deux sauvegardes rapprochées effacer une
        // image que l'autre vient d'écrire. Le contrat du port promet « tout ou
        // rien » : la décision doit se prendre là où l'écriture est protégée.
        const clesDImages = await transaction
            .objectStore('images')
            .index('parTrajet')
            .getAllKeys(trajet.id);
        for (const cle of clesDImages) {
            if (!idsDImagesActuels.has(cle)) {
                void transaction.objectStore('images').delete(cle);
            }
        }
        for (const { image, donnees } of imagesAvecDonnees) {
            void transaction.objectStore('images').put({
                id: image.id,
                trajetId: trajet.id,
                nom: image.nom,
                donnees,
                type: image.blob.type,
                largeur: image.largeur,
                hauteur: image.hauteur,
            });
        }

        const clesDePoints = await transaction
            .objectStore('points')
            .index('parTrajet')
            .getAllKeys(trajet.id);
        for (const cle of clesDePoints) {
            void transaction.objectStore('points').delete(cle);
        }
        for (const point of trajet.points) {
            void transaction.objectStore('points').put({
                id: point.id,
                trajetId: trajet.id,
                imageId: point.imageId,
                fraction: point.fraction.valeur,
                latitude: point.coordonnee.latitude,
                longitude: point.coordonnee.longitude,
            });
        }

        await transaction.done;
    }

    async supprimer(id: TrajetId): Promise<void> {
        const db = await this.promesseDb;
        const transaction = db.transaction(['trajets', 'images', 'points'], 'readwrite');
        void transaction.objectStore('trajets').delete(id);
        for (const cle of await transaction
            .objectStore('images')
            .index('parTrajet')
            .getAllKeys(id)) {
            void transaction.objectStore('images').delete(cle);
        }
        for (const cle of await transaction
            .objectStore('points')
            .index('parTrajet')
            .getAllKeys(id)) {
            void transaction.objectStore('points').delete(cle);
        }
        await transaction.done;
    }
}

function ouvrirBase(nom: string): Promise<IDBPDatabase<Schema>> {
    return openDB<Schema>(nom, 1, {
        upgrade(db) {
            db.createObjectStore('trajets', { keyPath: 'id' });
            db.createObjectStore('images', { keyPath: 'id' }).createIndex('parTrajet', 'trajetId');
            db.createObjectStore('points', { keyPath: 'id' }).createIndex('parTrajet', 'trajetId');
        },
        // La version est épinglée à 1 : ces deux cas ne surviennent qu'entre deux
        // fenêtres dont l'une embarque une autre version de l'application. On ne
        // peut rien réparer ici, mais sans trace l'utilisateur n'aurait qu'un
        // écran vide, et la promesse d'ouverture rejetterait sans explication.
        blocked(versionOuverte, versionAttendue) {
            console.warn(
                `Base « ${nom} » bloquée : une autre fenêtre garde la version ` +
                    `${versionOuverte} ouverte, la version ${versionAttendue ?? '?'} attend. ` +
                    `Fermez les autres onglets d’Etudes2Lignes.`,
            );
        },
        blocking(versionOuverte, versionAttendue) {
            console.warn(
                `Cette fenêtre (version ${versionOuverte}) empêche une autre d’ouvrir la ` +
                    `version ${versionAttendue ?? '?'} de la base « ${nom} » : rechargez la page.`,
            );
        },
    });
}

// --- Relecture : les enregistrements sont des données externes ------------------

/**
 * Un champ relu de la base, vérifié par un prédicat partagé avec l'import JSON.
 * Le message est destiné à l'utilisateur : c'est lui que l'écran affiche.
 */
function champ<T>(
    enregistrement: Record<string, unknown>,
    nom: string,
    estValide: (valeur: unknown) => valeur is T,
): T {
    const valeur = enregistrement[nom];
    if (!estValide(valeur)) {
        throw new Error(`Trajet illisible : le champ « ${nom} » est invalide dans la base.`);
    }
    return valeur;
}

/**
 * Garde de ceinture, en pratique inatteignable : les trois magasins ont un
 * `keyPath`, et IndexedDB refuse d'écrire une valeur dont il ne peut pas
 * extraire la clé — donc tout ce qu'il rend est un objet. Elle existe pour que
 * la validation des champs, elle, puisse partir d'un socle sûr sans `as`
 * (ADR 0002). Les tests de mutation la signaleront toujours : c'est attendu.
 */
function objetDeLaBase(valeur: unknown, quoi: string): Record<string, unknown> {
    if (!estUnObjet(valeur)) {
        throw new Error(`Trajet illisible : ${quoi} est illisible dans la base.`);
    }
    return valeur;
}

function versTrajetLu(enregistrement: unknown): TrajetLu {
    const champs = objetDeLaBase(enregistrement, 'l’enregistrement du trajet');
    return {
        id: champ(champs, 'id', estUneChaine),
        nom: champ(champs, 'nom', estUneChaine),
        creeLe: champ(champs, 'creeLe', estUneDate),
        imageIds: champ(champs, 'imageIds', estUnTableauDeChaines),
    };
}

/**
 * Indexe les enregistrements d'images par identifiant. Ceux qu'on ne sait pas
 * identifier sont écartés ici : s'ils appartiennent au trajet, `imageObligatoire`
 * les déclarera introuvables ; sinon ils ne sont pas de l'agrégat.
 */
function indexerParId(enregistrements: unknown[]): Map<string, Record<string, unknown>> {
    const parId = new Map<string, Record<string, unknown>>();
    for (const enregistrement of enregistrements) {
        if (!estUnObjet(enregistrement)) {
            continue;
        }
        const id = enregistrement['id'];
        if (estUneChaine(id)) {
            parId.set(id, enregistrement);
        }
    }
    return parId;
}

function imageObligatoire(
    imagesParId: Map<string, Record<string, unknown>>,
    imageId: string,
): Record<string, unknown> {
    const enregistrement = imagesParId.get(imageId);
    if (enregistrement === undefined) {
        throw new Error(
            `Trajet illisible : une image de ce trajet est introuvable dans la base (${imageId}).`,
        );
    }
    return enregistrement;
}

function versImageDuDomaine(
    imageId: string,
    enregistrement: Record<string, unknown>,
): ImageDeTrajet {
    return {
        id: imageId as ImageId,
        nom: champ(enregistrement, 'nom', estUneChaine),
        blob: new Blob([champ(enregistrement, 'donnees', estUnTampon)], {
            type: champ(enregistrement, 'type', estUneChaine),
        }),
        largeur: champ(enregistrement, 'largeur', estUnEntierPositif),
        hauteur: champ(enregistrement, 'hauteur', estUnEntierPositif),
    };
}

function versPointDuDomaine(enregistrement: unknown): Point {
    const champs = objetDeLaBase(enregistrement, 'l’enregistrement d’un point');
    return {
        id: champ(champs, 'id', estUneChaine) as PointId,
        imageId: champ(champs, 'imageId', estUneChaine) as ImageId,
        fraction: FractionVerticale.creer(champ(champs, 'fraction', estUnNombreFini)),
        coordonnee: Coordonnee.creer(
            champ(champs, 'latitude', estUnNombreFini),
            champ(champs, 'longitude', estUnNombreFini),
        ),
    };
}
