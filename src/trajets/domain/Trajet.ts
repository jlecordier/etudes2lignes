import { requireElementAt } from '../../shared/array';
import type { Coordonnee } from './Coordonnee';
import type { FractionVerticale } from './FractionVerticale';
import type { NomDeTrajet } from './NomDeTrajet';
import { newPointId, newTrajetId, newImageId } from './ids';
import type { ImageId, PointId, TrajetId } from './ids';

/** Une page du schéma de ligne (image importée par l'utilisateur). */
export interface ImageDeTrajet {
    readonly id: ImageId;
    readonly nom: string;
    readonly blob: Blob;
    readonly largeur: number;
    readonly hauteur: number;
}

/** Une page telle que l'utilisateur la fournit : l'agrégat lui forge son identifiant. */
export type ImageFile = Omit<ImageDeTrajet, 'id'>;

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

    static create(nom: NomDeTrajet, creeLe: Date = new Date()): Trajet {
        return new Trajet(newTrajetId(), nom, creeLe, [], []);
    }

    /** Reconstruit un trajet depuis la persistance, en revalidant les invariants. */
    static rehydrate(donnees: {
        id: TrajetId;
        nom: NomDeTrajet;
        creeLe: Date;
        images: readonly ImageDeTrajet[];
        points: readonly Point[];
    }): Trajet {
        const trajet = new Trajet(donnees.id, donnees.nom, donnees.creeLe, [], []);
        for (const image of donnees.images) {
            trajet.admitImage(image, 'voyage-end');
        }
        for (const point of donnees.points) {
            trajet.requireImageIndex(point.imageId);
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
    imagesInReadingOrder(): readonly ImageDeTrajet[] {
        return [...this._images].reverse();
    }

    /**
     * Les images dans l'ordre de lecture, numérotées à partir de 1 — le numéro que
     * l'œil compte depuis le haut de la pile. Le voyage partant du bas, la
     * dernière image du voyage porte le numéro 1.
     */
    numberedImagesInReadingOrder(): readonly { image: ImageDeTrajet; number: number }[] {
        return this.imagesInReadingOrder().map((image) => ({
            image,
            number: this.readingNumberOf(image.id),
        }));
    }

    rename(nom: NomDeTrajet): void {
        this._nom = nom;
    }

    addImage(file: ImageFile): ImageId {
        const image: ImageDeTrajet = { id: newImageId(), ...file };
        this.admitImage(image, 'voyage-end');
        return image.id;
    }

    /**
     * Ajoute des pages sous celles déjà présentes, dans l'ordre où le document se
     * lit — celui de l'explorateur, première page en haut. Le document se lisant
     * de bas en haut, la dernière page fournie est celle qui se lit le plus bas :
     * c'est donc elle qui ouvre le voyage.
     *
     * Pas de `reverse` ici : insérer chaque page en tête du voyage, dans l'ordre
     * reçu, *est* l'inversion.
     */
    addImagesInReadingOrder(files: readonly ImageFile[]): void {
        for (const file of files) {
            this.admitImage({ id: newImageId(), ...file }, 'voyage-start');
        }
    }

    /**
     * Décale l'image d'un cran vers la fin du voyage : elle est désormais
     * parcourue après celle qui la suivait. Sans effet sur la dernière image.
     */
    moveImageForwardInVoyage(imageId: ImageId): void {
        this.swapImages(this.requireImageIndex(imageId), 1);
    }

    /**
     * Décale l'image d'un cran vers le début du voyage : elle est désormais
     * parcourue avant celle qui la précédait. Sans effet sur la première image.
     */
    moveImageBackwardInVoyage(imageId: ImageId): void {
        this.swapImages(this.requireImageIndex(imageId), -1);
    }

    deleteImage(imageId: ImageId): void {
        const index = this.requireImageIndex(imageId);
        this.deletePointsOfImage(imageId);
        this._images.splice(index, 1);
    }

    addPoint(donnees: {
        imageId: ImageId;
        fraction: FractionVerticale;
        coordonnee: Coordonnee;
    }): PointId {
        this.requireImageIndex(donnees.imageId);
        const point: Point = { id: newPointId(), ...donnees };
        this._points.push(point);
        return point.id;
    }

    movePointOnImage(pointId: PointId, imageId: ImageId, fraction: FractionVerticale): void {
        this.requireImageIndex(imageId);
        const index = this.requirePointIndex(pointId);
        this._points[index] = { ...requireElementAt(this._points, index), imageId, fraction };
    }

    movePointOnCarte(pointId: PointId, coordonnee: Coordonnee): void {
        const index = this.requirePointIndex(pointId);
        this._points[index] = { ...requireElementAt(this._points, index), coordonnee };
    }

    deletePoint(pointId: PointId): void {
        this._points.splice(this.requirePointIndex(pointId), 1);
    }

    /** Les points portés par une image du trajet, dans leur ordre d'ajout. */
    pointsOfImage(imageId: ImageId): readonly Point[] {
        this.requireImageIndex(imageId);
        return this._points.filter((point) => point.imageId === imageId);
    }

    /**
     * Les points dans l'ordre du voyage. Les pages se lisent de bas en haut :
     * sur une même image, la fraction la plus grande (plus bas) vient en premier.
     */
    pointsInOrdreDuVoyage(): Point[] {
        return this._points
            .map((point) => ({ point, imageRank: this.requireImageIndex(point.imageId) }))
            .sort((a, b) => {
                if (a.imageRank !== b.imageRank) {
                    return a.imageRank - b.imageRank;
                }
                return b.point.fraction.value - a.point.fraction.value;
            })
            .map(({ point }) => point);
    }

    /**
     * Les points dans l'ordre du voyage, numérotés à partir de 1. Le numéro que
     * l'utilisateur lit — dans la liste, sur les pastilles posées sur les images
     * et sur les marqueurs de la carte — est produit ici, et nulle part ailleurs.
     */
    numberedPointsInOrdreDuVoyage(): readonly { point: Point; number: number }[] {
        return this.pointsInOrdreDuVoyage().map((point, index) => ({ point, number: index + 1 }));
    }

    private swapImages(index: number, decalage: -1 | 1): void {
        const voisin = index + decalage;
        if (voisin < 0 || voisin >= this._images.length) {
            return;
        }
        const image = requireElementAt(this._images, index);
        this._images[index] = requireElementAt(this._images, voisin);
        this._images[voisin] = image;
    }

    /**
     * Seule porte d'entrée d'une image dans l'agrégat : l'ajout par l'utilisateur,
     * l'import par lot et la réhydratation depuis la persistance passent par cette
     * garde. Seule l'extrémité d'insertion les distingue.
     */
    private admitImage(image: ImageDeTrajet, place: 'voyage-start' | 'voyage-end'): void {
        if (!isDimension(image.largeur) || !isDimension(image.hauteur)) {
            throw new Error(`Dimensions d’image invalides : ${image.largeur}×${image.hauteur}`);
        }
        if (place === 'voyage-start') {
            this._images.unshift(image);
            return;
        }
        this._images.push(image);
    }

    private deletePointsOfImage(imageId: ImageId): void {
        for (const point of this.pointsOfImage(imageId)) {
            this._points.splice(this.requirePointIndex(point.id), 1);
        }
    }

    /**
     * La numérotation depuis le haut de la pile, écrite une seule fois : la
     * pastille posée sur une image et le numéro qu'une ligne de point annonce ne
     * peuvent pas diverger.
     */
    private readingNumberOf(imageId: ImageId): number {
        return this._images.length - this.requireImageIndex(imageId);
    }

    private requireImageIndex(imageId: ImageId): number {
        const index = this._images.findIndex((image) => image.id === imageId);
        if (index === -1) {
            throw new Error(`Image inconnue dans ce trajet : ${imageId}`);
        }
        return index;
    }

    private requirePointIndex(pointId: PointId): number {
        const index = this._points.findIndex((point) => point.id === pointId);
        if (index === -1) {
            throw new Error(`Point inconnu dans ce trajet : ${pointId}`);
        }
        return index;
    }
}

function isDimension(value: number): boolean {
    return Number.isInteger(value) && value > 0;
}
