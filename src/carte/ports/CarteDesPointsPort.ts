import type { Coordonnee } from '../../trajets/domain/Coordonnee';
import type { PointId } from '../../trajets/domain/ids';

/** Un point du trajet tel qu'il apparaît sur la carte de l'éditeur. */
export interface DisplayedPoint {
    readonly id: PointId;
    readonly number: number;
    readonly coordonnee: Coordonnee;
}

/**
 * Port : la carte d'ensemble de l'éditeur, avec tous les points du trajet.
 *
 * Contrat :
 * - `show` montre exactement les points donnés (marqueurs numérotés,
 *   déplaçables) ; `onMove` est appelé quand l'utilisateur fait
 *   glisser un marqueur. La carte se recadre sur les points à la première
 *   ouverture et quand l'ensemble des points change — jamais sur un simple
 *   déplacement, pour ne pas voler le zoom.
 * - `onShow` rapporte le point qu'un clic sur son marqueur désigne. Leaflet ne
 *   confond pas ce clic avec un glisser : en deçà de trois pixels rien ne bouge,
 *   et un glisser accompli supprime le clic qui le suit.
 * - `centerOn` cale la carte sur une coordonnée, au zoom d'un point unique : le
 *   pendant de `onShow`, pour le geste inverse. Le schéma désigne un point, la
 *   carte vient à lui — on arrive d'ailleurs, il n'y a donc pas de cadrage
 *   courant à préserver.
 * - `resized` demande à la carte de se remesurer : son conteneur a changé de
 *   taille sans que la fenêtre bouge (la carte passe en plein écran, et en
 *   revient). Sans cela elle garderait l'échelle de la vignette qu'elle était.
 * - `chooseCoordonnee` arme un clic : la promesse rend la coordonnée
 *   cliquée sur la carte. Quand une `initialCoordonnee` est donnée (on déplace
 *   un point existant), la carte se centre dessus avant d'armer le clic —
 *   exactement comme `CoordonneeSelector.choose` sur mobile. Les points du
 *   trajet, eux, sont déjà tous à l'écran grâce à `show`. Armer un nouveau
 *   choix annule le précédent (null).
 * - `cancelChoice` résout le choix en attente avec null (sans objet sinon) :
 *   un choix armé n'attend jamais indéfiniment, l'écran peut l'abandonner.
 * - `mount`/`unmount` encadrent la vie de la carte. L'écran d'édition est
 *   fabriqué et détruit à chaque visite : son conteneur est un élément neuf à
 *   chaque fois, et une carte mémorisée d'une visite à l'autre pointerait sur un
 *   conteneur détaché — la deuxième ouverture n'afficherait plus rien. Toute
 *   autre méthode exige d'avoir été montée ; `unmount` rend tout ce que la
 *   carte tenait et peut se rappeler sans dommage.
 */
export interface CarteDesPoints {
    mount(container: HTMLElement): void;
    unmount(): void;
    show(
        points: readonly DisplayedPoint[],
        onMove: (id: PointId, coordonnee: Coordonnee) => void,
        onShow: (id: PointId) => void,
    ): void;
    centerOn(coordonnee: Coordonnee): void;
    resized(): void;
    chooseCoordonnee(initialCoordonnee: Coordonnee | null): Promise<Coordonnee | null>;
    cancelChoice(): void;
}
