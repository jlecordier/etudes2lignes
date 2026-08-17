import type { Observable } from 'rxjs';
import type { Coordonnee } from '../../trajets/domain/Coordonnee';
import type { DisplayedPoint, DisplayedPosition } from './CarteDesPointsPort';

/**
 * Port : laisser l'utilisateur choisir une coordonnée sur une carte de France.
 *
 * Contrat : `choose` ouvre la carte (centrée sur `initialCoordonnee` si fournie,
 * sinon recadrée sur les `reperes` et sur la position connue s'il y en a une,
 * sinon sur la France entière), attend le choix, et rend la coordonnée validée —
 * ou `null` si l'utilisateur annule.
 * Les repères sont les points du trajet, affichés pour se situer : ils ne sont
 * pas interactifs (cliquer dessus revient à cliquer la carte à cet endroit). Ils
 * sont **exigés**, quitte à passer une liste vide : les rendre facultatifs a
 * suffi à faire diverger cette carte de celle de l'éditeur.
 * `position$` l'est pour la même raison, et se passe `EMPTY` quand l'écran n'a
 * rien à montrer. La carte s'y abonne le temps du choix : le geste qui le
 * termine referme l'abonnement, ce qui compte d'autant plus ici que la carte
 * elle-même n'est jamais détruite.
 * Une seule sélection à la fois.
 */
export interface CoordonneeSelector {
    choose(
        initialCoordonnee: Coordonnee | null,
        reperes: readonly DisplayedPoint[],
        position$: Observable<DisplayedPosition>,
    ): Promise<Coordonnee | null>;
}
