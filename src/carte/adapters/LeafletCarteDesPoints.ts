import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Subject, firstValueFrom, type Observable, type Subscription } from 'rxjs';
import type { Coordonnee } from '../../trajets/domain/Coordonnee';
import type { PointId } from '../../trajets/domain/ids';
import type {
    CarteDesPoints,
    DisplayedPoint,
    DisplayedPosition,
} from '../ports/CarteDesPointsPort';
import { configureLeaflet } from './configureLeaflet';
import { toCoordonnee, toLatLng } from './conversion';
import { createOsmLayer, FRANCE_VIEW } from './osmLayer';
import { numberedIcon } from './numberedIcon';
import { centerOnCoordonnee, fitToPoints } from './fitting';
import { PositionLayers } from './positionLayers';

interface PlacedMarker {
    readonly marker: L.Marker;
    number: number;
}

/**
 * Carte Leaflet intégrée à l'éditeur : tous les points du trajet, numérotés
 * et déplaçables au doigt ou à la souris.
 */
export class LeafletCarteDesPoints implements CarteDesPoints {
    private carte: L.Map | null = null;
    private readonly markers = new Map<PointId, PlacedMarker>();
    private displayedIds = '';
    private onMove: ((id: PointId, coordonnee: Coordonnee) => void) | null = null;
    private onShow: ((id: PointId) => void) | null = null;
    /**
     * Le choix de coordonnée armé : y pousser une valeur termine l'attente, et
     * `observed` dit s'il y a quelqu'un pour l'attendre. C'était un `resolve`
     * mémorisé qu'il fallait penser à remettre à `null` — deux gestes pour une
     * seule idée, dont l'oubli du second armait la carte pour toujours.
     */
    private readonly choix = new Subject<Coordonnee | null>();
    private teardown: AbortController | null = null;
    private readonly positionLayers = new PositionLayers();
    private positionSubscription: Subscription | null = null;

    /**
     * Monte la carte dans le conteneur que l'écran vient de créer.
     *
     * La carte n'est plus mémorisée d'une visite à l'autre : l'écran d'édition
     * naît et meurt à chaque ouverture, et son conteneur avec lui.
     */
    mount(container: HTMLElement): void {
        this.unmount();
        configureLeaflet();
        const carte = L.map(container).setView(FRANCE_VIEW.center, FRANCE_VIEW.zoom);
        const teardown = new AbortController();
        this.carte = carte;
        this.teardown = teardown;
        createOsmLayer().addTo(carte);
        // Rotation d'un iPad/téléphone : le conteneur change de taille sans
        // repasser par show() — Leaflet doit se remesurer tout de suite. Posé
        // sur `window`, cet écouteur ne partirait pas avec la carte sans le signal.
        //
        // Mutant survivant assumé : retirer `signal` ne fait échouer aucun test.
        // Un écouteur qui survit à `unmount` n'a pas de conséquence observable
        // par l'état — la carte démontée qu'il remesure ne se plaint pas — et le
        // constater demanderait d'espionner `window.addEventListener`, ce que la
        // démarche de test proscrit. Le seul témoin serait la mémoire d'une
        // session longue, que rien ici ne mesure.
        window.addEventListener('resize', () => carte.invalidateSize(), {
            signal: teardown.signal,
        });
        carte.on('click', (event) => {
            if (!this.choix.observed) {
                return;
            }
            carte.getContainer().classList.remove('awaiting-click');
            this.choix.next(toCoordonnee(event.latlng));
        });
    }

    /** Rend tout ce que la carte tenait. Se rappeler sans dommage. */
    unmount(): void {
        this.cancelChoice();
        this.positionSubscription?.unsubscribe();
        this.positionSubscription = null;
        this.positionLayers.clear();
        this.teardown?.abort();
        this.teardown = null;
        this.markers.clear();
        this.displayedIds = '';
        this.onMove = null;
        this.onShow = null;
        this.carte?.remove();
        this.carte = null;
    }

    show(
        points: readonly DisplayedPoint[],
        onMove: (id: PointId, coordonnee: Coordonnee) => void,
        onShow: (id: PointId) => void,
    ): void {
        this.onMove = onMove;
        this.onShow = onShow;
        const carte = this.mountedCarte();

        const presents = new Set(points.map((point) => point.id));
        for (const [id, pose] of this.markers) {
            if (!presents.has(id)) {
                pose.marker.remove();
                this.markers.delete(id);
            }
        }
        for (const point of points) {
            this.placeOrUpdate(point);
        }

        // La carte a pu être (dé)masquée avec l'écran : remesurer le conteneur.
        setTimeout(() => carte.invalidateSize(), 0);

        const ids = points
            .map((point) => point.id)
            .sort()
            .join(',');
        if (ids !== this.displayedIds) {
            this.displayedIds = ids;
            fitToPoints(carte, points, this.positionLayers.coordonnee());
        }
    }

    /**
     * S'abonner démarre, se désabonner arrête : l'abonnement meurt avec
     * `unmount()`, et un nouvel appel referme le précédent — la carte n'écoute
     * jamais deux flux à la fois.
     */
    showPosition(position$: Observable<DisplayedPosition>): void {
        const carte = this.mountedCarte();
        this.positionSubscription?.unsubscribe();
        this.positionSubscription = position$.subscribe((position) => {
            this.positionLayers.paint(carte, position);
        });
    }

    /**
     * Le conteneur a changé de taille sans que la fenêtre bouge — la carte vient
     * de passer par-dessus le schéma, ou d'en revenir.
     */
    resized(): void {
        this.mountedCarte().invalidateSize();
    }

    /**
     * Amène la carte sur un point désigné depuis le schéma. Le zoom d'un point
     * unique, et non le cadrage courant : on arrive d'ailleurs, il n'y a pas
     * d'échelle réglée par l'utilisateur à lui voler.
     */
    centerOn(coordonnee: Coordonnee): void {
        centerOnCoordonnee(this.mountedCarte(), coordonnee);
    }

    chooseCoordonnee(initialCoordonnee: Coordonnee | null): Promise<Coordonnee | null> {
        this.cancelChoice();
        const carte = this.mountedCarte();
        carte.getContainer().classList.add('awaiting-click');
        if (initialCoordonnee !== null) {
            // Déplacer un point : on part de là où il est, comme la carte plein
            // écran le fait sur mobile.
            centerOnCoordonnee(carte, initialCoordonnee);
        }
        // La première valeur poussée termine l'attente, et le désabonnement suit
        // tout seul : il n'y a rien à remettre à zéro.
        return firstValueFrom(this.choix);
    }

    cancelChoice(): void {
        this.carte?.getContainer().classList.remove('awaiting-click');
        this.choix.next(null);
    }

    private mountedCarte(): L.Map {
        const carte = this.carte;
        if (carte === null) {
            throw new Error(
                "La carte des points n'est pas montée : l'écran doit la monter avant de s'en servir.",
            );
        }
        return carte;
    }

    private placeOrUpdate(point: DisplayedPoint): void {
        const position = toLatLng(point.coordonnee);
        const existant = this.markers.get(point.id);
        if (existant !== undefined) {
            existant.marker.setLatLng(position);
            if (existant.number !== point.number) {
                existant.marker.setIcon(numberedIcon(point.number));
                existant.number = point.number;
            }
            return;
        }
        const marker = L.marker(position, {
            draggable: true,
            icon: numberedIcon(point.number),
        }).addTo(this.mountedCarte());
        marker.on('dragend', () => {
            this.onMove?.(point.id, toCoordonnee(marker.getLatLng()));
        });
        // Leaflet ne rend jamais les deux : un glisser accompli supprime le clic
        // qui le suit, et un mouvement de moins de trois pixels ne démarre aucun
        // glisser. Un doigt qui tremble reste donc un clic.
        marker.on('click', () => {
            this.onShow?.(point.id);
        });
        this.markers.set(point.id, { marker, number: point.number });
    }
}
