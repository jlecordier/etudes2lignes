import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Subject, firstValueFrom } from 'rxjs';
import { query } from '../../shared/dom';
import type { Coordonnee } from '../../trajets/domain/Coordonnee';
import type { DisplayedPoint } from '../ports/CarteDesPointsPort';
import type { CoordonneeSelector } from '../ports/CoordonneeSelectorPort';
import { configureLeaflet } from './configureLeaflet';
import { toCoordonnee, toLatLng } from './conversion';
import { createOsmLayer } from './osmLayer';
import { numberedIcon } from './numberedIcon';
import { centerOnCoordonnee, fitToPoints } from './fitting';
import { INPUT_HINT, coordonneeFromInputs } from './saisieDeCoordonnee';

/** Carte Leaflet plein écran (tuiles OSM) pour choisir une coordonnée. */
export class LeafletCoordonneeSelector implements CoordonneeSelector {
    private carte: L.Map | null = null;
    private marker: L.Marker | null = null;
    private reperes: L.Marker[] = [];
    /**
     * Le choix en cours : y pousser une valeur termine l'attente. C'était un
     * `resolve` mémorisé qu'il fallait penser à remettre à `null` juste après
     * l'avoir appelé.
     */
    private readonly choix = new Subject<Coordonnee | null>();

    private readonly screen = query('#screen-carte', HTMLElement);
    private readonly latitudeInput = query('#latitude-input', HTMLInputElement);
    private readonly longitudeInput = query('#longitude-input', HTMLInputElement);
    private readonly confirmButton = query('#confirm-carte-button', HTMLButtonElement);

    constructor() {
        query('#cancel-carte-button', HTMLButtonElement).addEventListener('click', () => {
            this.terminer(null);
        });
        this.confirmButton.addEventListener('click', () => {
            this.confirmMarker();
        });
        query('#manual-place-button', HTMLButtonElement).addEventListener('click', () => {
            this.placeFromInputs();
        });
    }

    choose(
        initialCoordonnee: Coordonnee | null,
        reperes: readonly DisplayedPoint[],
    ): Promise<Coordonnee | null> {
        this.screen.hidden = false;
        const carte = this.initializedCarte();
        this.clearSelection();
        this.placeReperes(reperes);
        if (initialCoordonnee === null) {
            // Se situer par rapport au trajet : recadrer sur ses points.
            fitToPoints(carte, reperes);
        } else {
            this.placeMarker(initialCoordonnee);
            centerOnCoordonnee(carte, initialCoordonnee);
        }
        // La carte vient d'être dévoilée : Leaflet doit remesurer son conteneur.
        setTimeout(() => carte.invalidateSize(), 0);
        // La première valeur poussée termine l'attente, et le désabonnement suit
        // tout seul : il n'y a rien à remettre à zéro.
        return firstValueFrom(this.choix);
    }

    private initializedCarte(): L.Map {
        if (this.carte !== null) {
            return this.carte;
        }
        configureLeaflet();
        this.carte = L.map('carte-container');
        createOsmLayer().addTo(this.carte);
        this.carte.on('click', (event) => {
            this.placeMarker(toCoordonnee(event.latlng));
        });
        return this.carte;
    }

    private placeMarker(coordonnee: Coordonnee): void {
        const position = toLatLng(coordonnee);
        if (this.marker === null) {
            this.marker = L.marker(position, { draggable: true }).addTo(this.initializedCarte());
            this.marker.on('dragend', () => {
                this.reflectMarkerInInputs();
            });
        } else {
            this.marker.setLatLng(position);
        }
        this.reflectMarkerInInputs();
    }

    private reflectMarkerInInputs(): void {
        if (this.marker === null) {
            return;
        }
        const coordonnee = toCoordonnee(this.marker.getLatLng());
        this.latitudeInput.value = coordonnee.latitude.toFixed(5);
        this.longitudeInput.value = coordonnee.longitude.toFixed(5);
        this.confirmButton.disabled = false;
    }

    private placeFromInputs(): void {
        const coordonnee = coordonneeFromInputs(
            this.latitudeInput.value,
            this.longitudeInput.value,
        );
        if (coordonnee === null) {
            alert(INPUT_HINT);
            return;
        }
        this.placeMarker(coordonnee);
        centerOnCoordonnee(this.initializedCarte(), coordonnee);
    }

    private confirmMarker(): void {
        if (this.marker === null) {
            return;
        }
        this.terminer(toCoordonnee(this.marker.getLatLng()));
    }

    private placeReperes(reperes: readonly DisplayedPoint[]): void {
        for (const repere of this.reperes) {
            repere.remove();
        }
        this.reperes = reperes.map((repere) =>
            L.marker(toLatLng(repere.coordonnee), {
                icon: numberedIcon(repere.number),
                // Non interactif : cliquer un repère = cliquer la carte dessous.
                interactive: false,
            }).addTo(this.initializedCarte()),
        );
    }

    private clearSelection(): void {
        this.marker?.remove();
        this.marker = null;
        this.latitudeInput.value = '';
        this.longitudeInput.value = '';
        this.confirmButton.disabled = true;
    }

    private terminer(result: Coordonnee | null): void {
        this.screen.hidden = true;
        this.choix.next(result);
    }
}
