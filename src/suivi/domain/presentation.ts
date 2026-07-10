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
