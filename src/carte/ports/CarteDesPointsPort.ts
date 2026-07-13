import type { Coordonnee } from '../../trajets/domain/Coordonnee';
import type { PointId } from '../../trajets/domain/ids';

/** Un point du trajet tel qu'il apparaît sur la carte de l'éditeur. */
export interface PointAffiche {
    readonly id: PointId;
    readonly numero: number;
    readonly coordonnee: Coordonnee;
}

/**
 * Port : la carte d'ensemble de l'éditeur, avec tous les points du trajet.
 *
 * Contrat :
 * - `afficher` montre exactement les points donnés (marqueurs numérotés,
 *   déplaçables) ; `surDeplacement` est appelé quand l'utilisateur fait
 *   glisser un marqueur. La carte se recadre sur les points à la première
 *   ouverture et quand l'ensemble des points change — jamais sur un simple
 *   déplacement, pour ne pas voler le zoom.
 * - `choisirUneCoordonnee` arme un clic : la promesse rend la coordonnée
 *   cliquée sur la carte. Armer un nouveau choix annule le précédent (null).
 * - `annulerLeChoix` résout le choix en attente avec null (sans objet sinon).
 */
export interface CarteDesPoints {
    afficher(
        points: readonly PointAffiche[],
        surDeplacement: (id: PointId, coordonnee: Coordonnee) => void,
    ): void;
    choisirUneCoordonnee(): Promise<Coordonnee | null>;
    annulerLeChoix(): void;
}
