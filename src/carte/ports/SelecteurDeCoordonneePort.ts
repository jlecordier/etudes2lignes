import type { Coordonnee } from '../../trajets/domain/Coordonnee';

/**
 * Port : laisser l'utilisateur choisir une coordonnée sur une carte de France.
 *
 * Contrat : `choisir` ouvre la carte (centrée sur `coordonneeInitiale` si
 * fournie), attend le choix, et rend la coordonnée validée — ou `null` si
 * l'utilisateur annule. Une seule sélection à la fois.
 */
export interface SelecteurDeCoordonnee {
    choisir(coordonneeInitiale: Coordonnee | null): Promise<Coordonnee | null>;
}
