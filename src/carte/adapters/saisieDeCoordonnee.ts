import { Coordonnee } from '../../trajets/domain/Coordonnee';

/**
 * Ce que l'utilisateur doit faire quand sa saisie ne donne pas une coordonnée.
 * Une consigne, pas un diagnostic : il n'a pas à savoir lequel des deux champs
 * a fâché le domaine, ni ce qu'est un NaN.
 */
export const CONSIGNE_DE_SAISIE = 'Saisissez une latitude et une longitude valides.';

/**
 * La coordonnée formée par les deux champs de saisie manuelle, ou `null` quand
 * ils n'en forment pas une.
 *
 * Rendre `null` plutôt que lever : des champs vides sont l'état ordinaire de la
 * barre de saisie (le sélecteur les vide à chaque ouverture), pas un incident.
 */
export function coordonneeDeLaSaisie(
    latitudeSaisie: string,
    longitudeSaisie: string,
): Coordonnee | null {
    const latitude = Number.parseFloat(latitudeSaisie);
    const longitude = Number.parseFloat(longitudeSaisie);
    // Champ vide ou texte : le cas courant se règle ici, sans exception.
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
    }
    try {
        return Coordonnee.creer(latitude, longitude);
    } catch {
        // Reste le cas exotique d'un nombre hors du globe (une longitude de
        // 500°). Le refus vient du domaine, qui seul détient les bornes : les
        // recopier ici les ferait diverger. Pour l'utilisateur c'est la même
        // consigne qu'un champ vide.
        return null;
    }
}
