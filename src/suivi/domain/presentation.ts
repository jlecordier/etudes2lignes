import type { EtatDeLaSource } from './etatDeLaSource';
import type { ResultatDeSuivi } from './projection';

/** Texte d'état à afficher pour un résultat de suivi (vide si tout va bien). */
export function texteDEtatDuSuivi(resultat: ResultatDeSuivi): string {
    switch (resultat.etat) {
        case 'pas-assez-de-points':
            return 'Ajoutez au moins deux points géo-référencés pour activer le suivi.';
        case 'hors-trajet':
            return `Hors trajet (à ${Math.round(resultat.distanceMetres / 1000)} km de la ligne).`;
        case 'sur-trajet':
            return '';
    }
}

/**
 * Texte d'état à afficher pour l'état d'une source de position.
 *
 * Le seul endroit où l'on arrondit et où l'on rédige : les sources mesurent
 * (mètres, millisecondes), la présentation formule. Les arrondis ont un
 * plancher à 1 — annoncer « ± 0 km » ou « il y a 0 min » ne veut rien dire.
 */
export function texteDEtatDeLaSource(etat: EtatDeLaSource): string {
    switch (etat.etat) {
        case 'attente':
            return 'En attente du signal GPS…';
        case 'imprecise': {
            const kilometres = Math.max(1, Math.round(etat.imprecisionMetres / 1000));
            return `Position approximative (± ${kilometres} km) — trop imprécise pour caler la page.`;
        }
        case 'perdue': {
            const minutes = Math.max(1, Math.round(etat.ancienneteMs / 60_000));
            return `Signal GPS perdu — dernière position il y a ${minutes} min.`;
        }
        case 'permission-refusee':
            return 'Accès à la position refusé — autorisez la localisation pour ce site puis revenez.';
        case 'indisponible':
            return 'La géolocalisation n’est pas disponible sur cet appareil.';
    }
}
