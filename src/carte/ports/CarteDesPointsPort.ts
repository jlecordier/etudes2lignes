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
 * - `afficher` montre exactement les points donnés (marqueurs numérotés,
 *   déplaçables) ; `onMove` est appelé quand l'utilisateur fait
 *   glisser un marqueur. La carte se recadre sur les points à la première
 *   ouverture et quand l'ensemble des points change — jamais sur un simple
 *   déplacement, pour ne pas voler le zoom.
 * - `choisirUneCoordonnee` arme un clic : la promesse rend la coordonnée
 *   cliquée sur la carte. Quand une `initialCoordonnee` est donnée (on déplace
 *   un point existant), la carte se centre dessus avant d'armer le clic —
 *   exactement comme `CoordonneeSelector.choisir` sur mobile. Les points du
 *   trajet, eux, sont déjà tous à l'écran grâce à `afficher`. Armer un nouveau
 *   choix annule le précédent (null).
 * - `annulerLeChoix` résout le choix en attente avec null (sans objet sinon) :
 *   un choix armé n'attend jamais indéfiniment, l'écran peut l'abandonner.
 * - `monter`/`demonter` encadrent la vie de la carte. L'écran d'édition est
 *   fabriqué et détruit à chaque visite : son conteneur est un élément neuf à
 *   chaque fois, et une carte mémorisée d'une visite à l'autre pointerait sur un
 *   conteneur détaché — la deuxième ouverture n'afficherait plus rien. Toute
 *   autre méthode exige d'avoir été montée ; `demonter` rend tout ce que la
 *   carte tenait et peut se rappeler sans dommage.
 */
export interface CarteDesPoints {
    mount(container: HTMLElement): void;
    unmount(): void;
    show(
        points: readonly DisplayedPoint[],
        onMove: (id: PointId, coordonnee: Coordonnee) => void,
    ): void;
    chooseCoordonnee(initialCoordonnee: Coordonnee | null): Promise<Coordonnee | null>;
    cancelChoice(): void;
}
