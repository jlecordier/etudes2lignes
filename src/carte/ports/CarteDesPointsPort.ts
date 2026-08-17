import type { Observable } from 'rxjs';
import type { Coordonnee } from '../../trajets/domain/Coordonnee';
import type { PointId } from '../../trajets/domain/ids';

/** Un point du trajet tel qu'il apparaît sur la carte de l'éditeur. */
export interface DisplayedPoint {
    readonly id: PointId;
    readonly number: number;
    readonly coordonnee: Coordonnee;
}

/**
 * Ce qu'une carte montre de « ma position » : la coordonnée quand on l'a, et
 * sinon la phrase qui dit pourquoi on ne l'a pas.
 *
 * Le `message` est **rédigé par l'écran**. Une carte ne connaît ni les états
 * d'une source de position ni la langue dans laquelle on les formule : elle
 * affiche un texte qu'on lui donne, comme n'importe quel bandeau. C'est ce qui
 * permet à cette capacité de continuer à ne rien savoir du suivi.
 *
 * `approximative` porte son incertitude en mètres parce qu'elle se **dessine** :
 * c'est le rayon du cercle. Une position acceptée n'en transporte aucune — la
 * source ne mesure l'imprécision que des fixes qu'elle refuse —, et en inventer
 * une serait mentir.
 */
export type DisplayedPosition =
    | { readonly kind: 'connue'; readonly coordonnee: Coordonnee }
    | {
          readonly kind: 'approximative';
          readonly coordonnee: Coordonnee;
          readonly imprecisionMetres: number;
          readonly message: string;
      }
    | { readonly kind: 'inconnue'; readonly message: string };

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
 * - `showPosition` montre la position au fil de l'eau : **s'abonner démarre, se
 *   désabonner arrête**. L'abonnement meurt avec `unmount`, et un nouvel appel
 *   referme le précédent — la carte n'écoute jamais deux flux à la fois. Une
 *   position qui arrive ne recadre rien : c'est le cadrage qui va la chercher,
 *   quand il se calcule. `inconnue` retire le marqueur.
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
    showPosition(position$: Observable<DisplayedPosition>): void;
    centerOn(coordonnee: Coordonnee): void;
    resized(): void;
    chooseCoordonnee(initialCoordonnee: Coordonnee | null): Promise<Coordonnee | null>;
    cancelChoice(): void;
}
