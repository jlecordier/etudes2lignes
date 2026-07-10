import type { Coordonnee } from './Coordonnee';
import type { FractionVerticale } from './FractionVerticale';
import type { NomDeTrajet } from './NomDeTrajet';
import { nouveauPointId, nouveauTrajetId, nouvelImageId } from './ids';
import type { ImageId, PointId, TrajetId } from './ids';

/** Une page du schéma de ligne (image importée par l'utilisateur). */
export interface ImageDeTrajet {
  readonly id: ImageId;
  readonly nom: string;
  readonly blob: Blob;
  readonly largeur: number;
  readonly hauteur: number;
}

/** Un point géo-référencé : une hauteur sur une image ↔ une coordonnée. */
export interface Point {
  readonly id: PointId;
  readonly imageId: ImageId;
  readonly fraction: FractionVerticale;
  readonly coordonnee: Coordonnee;
}

/**
 * Agrégat racine : un trajet, ses images ordonnées et ses points géo-référencés.
 *
 * Invariants protégés ici (et nulle part ailleurs) :
 * - un point référence toujours une image du trajet ;
 * - supprimer une image supprime ses points (cascade) ;
 * - l'ordre du tableau d'images = ordre du voyage (1ʳᵉ image = début).
 */
export class Trajet {
  private constructor(
    readonly id: TrajetId,
    private _nom: NomDeTrajet,
    readonly creeLe: Date,
    private readonly _images: ImageDeTrajet[],
    private readonly _points: Point[],
  ) {}

  static creer(nom: NomDeTrajet, creeLe: Date = new Date()): Trajet {
    return new Trajet(nouveauTrajetId(), nom, creeLe, [], []);
  }

  /** Reconstruit un trajet depuis la persistance, en revalidant les invariants. */
  static rehydrater(donnees: {
    id: TrajetId;
    nom: NomDeTrajet;
    creeLe: Date;
    images: readonly ImageDeTrajet[];
    points: readonly Point[];
  }): Trajet {
    const trajet = new Trajet(donnees.id, donnees.nom, donnees.creeLe, [...donnees.images], []);
    for (const point of donnees.points) {
      trajet.indexImageObligatoire(point.imageId);
      trajet._points.push(point);
    }
    return trajet;
  }

  get nom(): NomDeTrajet {
    return this._nom;
  }

  get images(): readonly ImageDeTrajet[] {
    return [...this._images];
  }

  get points(): readonly Point[] {
    return [...this._points];
  }

  renommer(nom: NomDeTrajet): void {
    this._nom = nom;
  }

  ajouterImage(fichier: { nom: string; blob: Blob; largeur: number; hauteur: number }): ImageId {
    if (!estUneDimension(fichier.largeur) || !estUneDimension(fichier.hauteur)) {
      throw new Error(`Dimensions d’image invalides : ${fichier.largeur}×${fichier.hauteur}`);
    }
    const image: ImageDeTrajet = { id: nouvelImageId(), ...fichier };
    this._images.push(image);
    return image.id;
  }

  monterImage(imageId: ImageId): void {
    this.echangerImages(this.indexImageObligatoire(imageId), -1);
  }

  descendreImage(imageId: ImageId): void {
    this.echangerImages(this.indexImageObligatoire(imageId), +1);
  }

  supprimerImage(imageId: ImageId): void {
    const index = this.indexImageObligatoire(imageId);
    this._images.splice(index, 1);
    this.supprimerLesPointsDeLImage(imageId);
  }

  ajouterPoint(donnees: {
    imageId: ImageId;
    fraction: FractionVerticale;
    coordonnee: Coordonnee;
  }): PointId {
    this.indexImageObligatoire(donnees.imageId);
    const point: Point = { id: nouveauPointId(), ...donnees };
    this._points.push(point);
    return point.id;
  }

  deplacerPointSurImage(pointId: PointId, imageId: ImageId, fraction: FractionVerticale): void {
    this.indexImageObligatoire(imageId);
    const index = this.indexPointObligatoire(pointId);
    this._points[index] = { ...this._points[index]!, imageId, fraction };
  }

  deplacerPointSurCarte(pointId: PointId, coordonnee: Coordonnee): void {
    const index = this.indexPointObligatoire(pointId);
    this._points[index] = { ...this._points[index]!, coordonnee };
  }

  supprimerPoint(pointId: PointId): void {
    this._points.splice(this.indexPointObligatoire(pointId), 1);
  }

  /**
   * Les points dans l'ordre du voyage. Les pages se lisent de bas en haut :
   * sur une même image, la fraction la plus grande (plus bas) vient en premier.
   */
  ordreVoyageDesPoints(): Point[] {
    const rangParImage = new Map(this._images.map((image, index) => [image.id, index]));
    return [...this._points].sort((a, b) => {
      const rangA = rangParImage.get(a.imageId) ?? 0;
      const rangB = rangParImage.get(b.imageId) ?? 0;
      if (rangA !== rangB) {
        return rangA - rangB;
      }
      return b.fraction.valeur - a.fraction.valeur;
    });
  }

  private echangerImages(index: number, decalage: -1 | 1): void {
    const voisin = index + decalage;
    if (voisin < 0 || voisin >= this._images.length) {
      return;
    }
    const image = this._images[index]!;
    this._images[index] = this._images[voisin]!;
    this._images[voisin] = image;
  }

  private supprimerLesPointsDeLImage(imageId: ImageId): void {
    for (let index = this._points.length - 1; index >= 0; index--) {
      if (this._points[index]!.imageId === imageId) {
        this._points.splice(index, 1);
      }
    }
  }

  private indexImageObligatoire(imageId: ImageId): number {
    const index = this._images.findIndex((image) => image.id === imageId);
    if (index === -1) {
      throw new Error(`Image inconnue dans ce trajet : ${imageId}`);
    }
    return index;
  }

  private indexPointObligatoire(pointId: PointId): number {
    const index = this._points.findIndex((point) => point.id === pointId);
    if (index === -1) {
      throw new Error(`Point inconnu dans ce trajet : ${pointId}`);
    }
    return index;
  }
}

function estUneDimension(valeur: number): boolean {
  return Number.isInteger(valeur) && valeur > 0;
}
