import { requeteTous } from './commun/dom';

/**
 * Navigation entre les écrans de l'application.
 * Un seul écran (section) est visible à la fois ; pas de routeur.
 *
 * La carte plein écran n'en fait pas partie : c'est une **superposition**, posée
 * par-dessus l'écran courant, qui reste visible dessous. Elle n'est donc pas un
 * écran et n'a pas à figurer ici.
 */

export type NomEcran = 'liste' | 'editeur' | 'suivi';

/**
 * Va sur un écran et y charge son contenu.
 *
 * La recette « rendre visible puis charger » était recopiée à chaque transition
 * dans le composition root : elle est nommée ici, une fois. L'écran apparaît
 * avant la fin du chargement, à dessein — attendre laisserait l'écran précédent
 * figé, sans retour visuel au geste de l'utilisateur.
 */
export async function aller(nom: NomEcran, chargement: () => Promise<void>): Promise<void> {
    afficherEcran(nom);
    await chargement();
}

function afficherEcran(nom: NomEcran): void {
    for (const ecran of requeteTous('.ecran', HTMLElement)) {
        ecran.hidden = ecran.id !== `ecran-${nom}`;
    }
}
