/**
 * Ce qu'une pile de pages donne à ses éléments pour qu'ils sachent quoi montrer.
 *
 * Le type vit ici plutôt que dans l'un des deux éléments qui s'en servent
 * (`SchemaPage` pour l'image à sa taille réelle, `OverviewPage` pour la vignette
 * de l'aperçu) : ni l'un ni l'autre n'en est le propriétaire, et l'un n'a aucune
 * raison d'importer l'autre.
 */

/** Une page à afficher. `ImageDeTrajet` s'y assigne : aucun domaine n'est requis. */
export interface DisplayablePage {
    readonly id: string;
    readonly nom: string;
    readonly blob: Blob;
    readonly largeur: number;
    readonly hauteur: number;
}
