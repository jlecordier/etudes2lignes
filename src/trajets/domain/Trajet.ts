import { elementA } from '../../commun/tableau';
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
        const trajet = new Trajet(donnees.id, donnees.nom, donnees.creeLe, [], []);
        for (const image of donnees.images) {
            trajet.admettreLImage(image);
        }
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

    /**
     * Les images dans l'ordre où le document se lit : les pages se lisent de bas
     * en haut, donc la première image du voyage s'affiche tout en bas de la pile
     * et la dernière tout en haut. C'est exactement l'inverse de l'ordre du voyage.
     */
    imagesDansLOrdreDeLecture(): readonly ImageDeTrajet[] {
        return [...this._images].reverse();
    }

    renommer(nom: NomDeTrajet): void {
        this._nom = nom;
    }

    ajouterImage(fichier: { nom: string; blob: Blob; largeur: number; hauteur: number }): ImageId {
        const image: ImageDeTrajet = { id: nouvelImageId(), ...fichier };
        this.admettreLImage(image);
        return image.id;
    }

    /**
     * Décale l'image d'un cran vers la fin du voyage : elle est désormais
     * parcourue après celle qui la suivait. Sans effet sur la dernière image.
     */
    avancerImageDansLeVoyage(imageId: ImageId): void {
        this.echangerImages(this.indexImageObligatoire(imageId), 1);
    }

    /**
     * Décale l'image d'un cran vers le début du voyage : elle est désormais
     * parcourue avant celle qui la précédait. Sans effet sur la première image.
     */
    reculerImageDansLeVoyage(imageId: ImageId): void {
        this.echangerImages(this.indexImageObligatoire(imageId), -1);
    }

    supprimerImage(imageId: ImageId): void {
        const index = this.indexImageObligatoire(imageId);
        this.supprimerLesPointsDeLImage(imageId);
        this._images.splice(index, 1);
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
        this._points[index] = { ...elementA(this._points, index), imageId, fraction };
    }

    deplacerPointSurCarte(pointId: PointId, coordonnee: Coordonnee): void {
        const index = this.indexPointObligatoire(pointId);
        this._points[index] = { ...elementA(this._points, index), coordonnee };
    }

    supprimerPoint(pointId: PointId): void {
        this._points.splice(this.indexPointObligatoire(pointId), 1);
    }

    /** Les points portés par une image du trajet, dans leur ordre d'ajout. */
    pointsDeLImage(imageId: ImageId): readonly Point[] {
        this.indexImageObligatoire(imageId);
        return this._points.filter((point) => point.imageId === imageId);
    }

    /**
     * Les points dans l'ordre du voyage. Les pages se lisent de bas en haut :
     * sur une même image, la fraction la plus grande (plus bas) vient en premier.
     */
    ordreVoyageDesPoints(): Point[] {
        return this._points
            .map((point) => ({ point, rangDeLImage: this.indexImageObligatoire(point.imageId) }))
            .sort((a, b) => {
                if (a.rangDeLImage !== b.rangDeLImage) {
                    return a.rangDeLImage - b.rangDeLImage;
                }
                return b.point.fraction.valeur - a.point.fraction.valeur;
            })
            .map(({ point }) => point);
    }

    /**
     * Les points dans l'ordre du voyage, numérotés à partir de 1. Le numéro que
     * l'utilisateur lit — dans la liste, sur les pastilles posées sur les images
     * et sur les marqueurs de la carte — est produit ici, et nulle part ailleurs.
     */
    pointsNumerotesDansLOrdreDuVoyage(): readonly { point: Point; numero: number }[] {
        return this.ordreVoyageDesPoints().map((point, index) => ({ point, numero: index + 1 }));
    }

    private echangerImages(index: number, decalage: -1 | 1): void {
        const voisin = index + decalage;
        if (voisin < 0 || voisin >= this._images.length) {
            return;
        }
        const image = elementA(this._images, index);
        this._images[index] = elementA(this._images, voisin);
        this._images[voisin] = image;
    }

    /**
     * Seule porte d'entrée d'une image dans l'agrégat : l'ajout par l'utilisateur
     * comme la réhydratation depuis la persistance passent par cette garde.
     */
    private admettreLImage(image: ImageDeTrajet): void {
        if (!estUneDimension(image.largeur) || !estUneDimension(image.hauteur)) {
            throw new Error(`Dimensions d’image invalides : ${image.largeur}×${image.hauteur}`);
        }
        this._images.push(image);
    }

    private supprimerLesPointsDeLImage(imageId: ImageId): void {
        for (const point of this.pointsDeLImage(imageId)) {
            this._points.splice(this.indexPointObligatoire(point.id), 1);
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
