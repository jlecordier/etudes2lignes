import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Coordonnee } from '../../trajets/domain/Coordonnee';
import type { PointId } from '../../trajets/domain/ids';
import type { CarteDesPoints, DisplayedPoint } from '../ports/CarteDesPointsPort';
import { configureLeaflet } from './configureLeaflet';
import { toCoordonnee, toLatLng } from './conversion';
import { createOsmLayer, FRANCE_VIEW } from './osmLayer';
import { numberedIcon } from './numberedIcon';
import { centerOnCoordonnee, fitToPoints } from './fitting';

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
    private resolveChoice: ((coordonnee: Coordonnee | null) => void) | null = null;

    constructor(private readonly containerId: string) {}

    show(
        points: readonly DisplayedPoint[],
        onMove: (id: PointId, coordonnee: Coordonnee) => void,
    ): void {
        this.onMove = onMove;
        const carte = this.initializedCarte();

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
            fitToPoints(carte, points);
        }
    }

    chooseCoordonnee(initialCoordonnee: Coordonnee | null): Promise<Coordonnee | null> {
        this.cancelChoice();
        const carte = this.initializedCarte();
        carte.getContainer().classList.add('awaiting-click');
        if (initialCoordonnee !== null) {
            // Déplacer un point : on part de là où il est, comme la carte plein
            // écran le fait sur mobile.
            centerOnCoordonnee(carte, initialCoordonnee);
        }
        return new Promise((resolve) => {
            this.resolveChoice = resolve;
        });
    }

    cancelChoice(): void {
        this.carte?.getContainer().classList.remove('awaiting-click');
        const pending = this.resolveChoice;
        this.resolveChoice = null;
        pending?.(null);
    }

    private initializedCarte(): L.Map {
        if (this.carte !== null) {
            return this.carte;
        }
        configureLeaflet();
        const carte = L.map(this.containerId).setView(FRANCE_VIEW.center, FRANCE_VIEW.zoom);
        this.carte = carte;
        createOsmLayer().addTo(carte);
        // Rotation d'un iPad/téléphone : le conteneur change de taille sans
        // repasser par show() — Leaflet doit se remesurer tout de suite.
        window.addEventListener('resize', () => carte.invalidateSize());
        carte.on('click', (event) => {
            const pending = this.resolveChoice;
            if (pending === null) {
                return;
            }
            this.resolveChoice = null;
            carte.getContainer().classList.remove('awaiting-click');
            pending(toCoordonnee(event.latlng));
        });
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
        }).addTo(this.initializedCarte());
        marker.on('dragend', () => {
            this.onMove?.(point.id, toCoordonnee(marker.getLatLng()));
        });
        this.markers.set(point.id, { marker, number: point.number });
    }
}
