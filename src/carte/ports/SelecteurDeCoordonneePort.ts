import type { Coordonnee } from '../../trajets/domain/Coordonnee';
import type { PointAffiche } from './CarteDesPointsPort';

/**
 * Port : laisser l'utilisateur choisir une coordonnée sur une carte de France.
 *
 * Contrat : `choisir` ouvre la carte (centrée sur `coordonneeInitiale` si
 * fournie, sinon recadrée sur les `reperes` s'il y en a), attend le choix,
 * et rend la coordonnée validée — ou `null` si l'utilisateur annule.
 * Les repères sont les points du trajet, affichés pour se situer : ils ne
 * sont pas interactifs (cliquer dessus revient à cliquer la carte à cet
 * endroit). Une seule sélection à la fois.
 */
export interface SelecteurDeCoordonnee {
    choisir(
        coordonneeInitiale: Coordonnee | null,
        reperes?: readonly PointAffiche[],
    ): Promise<Coordonnee | null>;
}
