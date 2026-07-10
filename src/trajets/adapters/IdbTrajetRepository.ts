import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { Coordonnee } from '../domain/Coordonnee';
import { FractionVerticale } from '../domain/FractionVerticale';
import { NomDeTrajet } from '../domain/NomDeTrajet';
import { Trajet, type ImageDeTrajet, type Point } from '../domain/Trajet';
import type { ImageId, PointId, TrajetId } from '../domain/ids';
import type { ResumeDeTrajet, TrajetRepository } from '../ports/TrajetRepository';

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

interface Schema extends DBSchema {
  trajets: { key: string; value: EnregistrementTrajet };
  images: { key: string; value: EnregistrementImage; indexes: { parTrajet: string } };
  points: { key: string; value: EnregistrementPoint; indexes: { parTrajet: string } };
}

/** Persistance des trajets dans IndexedDB (via la bibliothèque idb). */
export class IdbTrajetRepository implements TrajetRepository {
  private readonly promesseDb: Promise<IDBPDatabase<Schema>>;

  constructor(nomDeBase = 'grossemadame') {
    this.promesseDb = ouvrirBase(nomDeBase);
  }

  async listerResumes(): Promise<ResumeDeTrajet[]> {
    const db = await this.promesseDb;
    const enregistrements = await db.getAll('trajets');
    enregistrements.sort((a, b) => a.creeLe.getTime() - b.creeLe.getTime());

    const resumes: ResumeDeTrajet[] = [];
    for (const enregistrement of enregistrements) {
      resumes.push({
        id: enregistrement.id as TrajetId,
        nom: enregistrement.nom,
        creeLe: enregistrement.creeLe,
        nombreDImages: await db.countFromIndex('images', 'parTrajet', enregistrement.id),
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
    const images = await db.getAllFromIndex('images', 'parTrajet', id);
    const points = await db.getAllFromIndex('points', 'parTrajet', id);
    return Trajet.rehydrater({
      id,
      nom: NomDeTrajet.creer(enregistrement.nom),
      creeLe: enregistrement.creeLe,
      images: dansLOrdreDuTrajet(images, enregistrement.imageIds).map(versImageDuDomaine),
      points: points.map(versPointDuDomaine),
    });
  }

  async sauvegarder(trajet: Trajet): Promise<void> {
    const db = await this.promesseDb;
    // Les blobs sont convertis AVANT d'ouvrir la transaction : attendre une
    // promesse étrangère à IndexedDB fermerait la transaction en cours.
    const dejaStockees = new Set(await db.getAllKeysFromIndex('images', 'parTrajet', trajet.id));
    const nouvellesImages = trajet.images.filter((image) => !dejaStockees.has(image.id));
    const tampons = new Map<ImageId, ArrayBuffer>();
    for (const image of nouvellesImages) {
      tampons.set(image.id, await image.blob.arrayBuffer());
    }

    const transaction = db.transaction(['trajets', 'images', 'points'], 'readwrite');
    void transaction.objectStore('trajets').put({
      id: trajet.id,
      nom: trajet.nom.valeur,
      creeLe: trajet.creeLe,
      imageIds: trajet.images.map((image) => image.id),
    });

    const idsDImagesActuels = new Set<string>(trajet.images.map((image) => image.id));
    for (const cle of dejaStockees) {
      if (!idsDImagesActuels.has(cle)) {
        void transaction.objectStore('images').delete(cle);
      }
    }
    for (const image of nouvellesImages) {
      void transaction.objectStore('images').put({
        id: image.id,
        trajetId: trajet.id,
        nom: image.nom,
        donnees: tampons.get(image.id)!,
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
    for (const cle of await transaction.objectStore('images').index('parTrajet').getAllKeys(id)) {
      void transaction.objectStore('images').delete(cle);
    }
    for (const cle of await transaction.objectStore('points').index('parTrajet').getAllKeys(id)) {
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
  });
}

function dansLOrdreDuTrajet(
  images: EnregistrementImage[],
  ordre: string[],
): EnregistrementImage[] {
  const parId = new Map(images.map((image) => [image.id, image]));
  return ordre.map((id) => parId.get(id)).filter((image) => image !== undefined);
}

function versImageDuDomaine(enregistrement: EnregistrementImage): ImageDeTrajet {
  return {
    id: enregistrement.id as ImageId,
    nom: enregistrement.nom,
    blob: new Blob([enregistrement.donnees], { type: enregistrement.type }),
    largeur: enregistrement.largeur,
    hauteur: enregistrement.hauteur,
  };
}

function versPointDuDomaine(enregistrement: EnregistrementPoint): Point {
  return {
    id: enregistrement.id as PointId,
    imageId: enregistrement.imageId as ImageId,
    fraction: FractionVerticale.creer(enregistrement.fraction),
    coordonnee: Coordonnee.creer(enregistrement.latitude, enregistrement.longitude),
  };
}
