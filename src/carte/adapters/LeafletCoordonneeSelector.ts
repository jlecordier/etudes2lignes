import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Subject, firstValueFrom, takeUntil, type Observable } from 'rxjs';
import { query } from '../../shared/dom';
import type { Coordonnee } from '../../trajets/domain/Coordonnee';
import type { DisplayedPoint, DisplayedPosition } from '../ports/CarteDesPointsPort';
import type { CoordonneeSelector } from '../ports/CoordonneeSelectorPort';
import { configureLeaflet } from './configureLeaflet';
import { toCoordonnee, toLatLng } from './conversion';
import { createOsmLayer } from './osmLayer';
import { numberedIcon } from './numberedIcon';
import { centerOnCoordonnee, fitToPoints, remeasureAfterReveal } from './fitting';
import { PositionControl } from './positionControl';
import { PositionLayers } from './positionLayers';
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
    private readonly positionStatus = query('#carte-position-status', HTMLParagraphElement);
    private readonly positionLayers = new PositionLayers();
    /**
     * Le bouton « Ma position », posé **sur** la carte comme le fait la
     * plateforme. Il vivait dans la barre du bas, entre la latitude et
     * « Valider », et obligeait cet adapter à tenir son état actif alors que
     * `PositionLayers` détient déjà la coordonnée.
     *
     * L'identifiant est celui qu'il portait : les tests le désignent, et il n'a
     * fait que changer de porteur. Il diffère de celui de la carte de l'éditeur
     * parce que les deux **coexistent** dans le document — cette carte recouvre
     * l'autre sans la démonter, et deux fois le même `id` n'est pas un HTML
     * valide.
     */
    private readonly positionControl = new PositionControl(
        'carte-position-button',
        this.positionLayers,
    );

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
        position$: Observable<DisplayedPosition>,
    ): Promise<Coordonnee | null> {
        this.screen.hidden = false;
        const carte = this.initializedCarte();
        this.clearSelection();
        this.placeReperes(reperes);
        // **Avant** le cadrage : un flux qui garde sa dernière valeur la rejoue
        // ici même, si bien que le cadrage la trouve déjà connue — c'est tout ce
        // que « seulement si déjà connue » demande, sans un seul test de nullité.
        // L'abonnement pend au choix : le geste qui le termine le referme, il
        // n'y en a pas deux à faire, et rien ne survit à une carte qu'on ne
        // détruit jamais.
        position$.pipe(takeUntil(this.choix)).subscribe((position) => {
            this.paintPosition(carte, position);
        });
        if (initialCoordonnee === null) {
            // Se situer par rapport au trajet : recadrer sur ses points.
            fitToPoints(carte, reperes, this.positionLayers.coordonnee());
        } else {
            this.placeMarker(initialCoordonnee);
            centerOnCoordonnee(carte, initialCoordonnee);
        }
        remeasureAfterReveal(carte);
        return firstValueFrom(this.choix);
    }

    private initializedCarte(): L.Map {
        if (this.carte !== null) {
            return this.carte;
        }
        configureLeaflet();
        this.carte = L.map('carte-container');
        createOsmLayer().addTo(this.carte);
        this.positionControl.addTo(this.carte);
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

    /**
     * Ce que cette carte ajoute aux couches : la barre. Les marques elles-mêmes
     * sont posées par le même code que sur la carte de l'éditeur — c'est ce qui
     * empêche les deux de diverger, comme `fitToPoints` pour le cadrage.
     */
    private paintPosition(carte: L.Map, position: DisplayedPosition): void {
        this.positionLayers.paint(carte, position);
        // Le contrôle ne s'abonne à rien : c'est ici qu'on sait que la position
        // a changé, donc c'est ici qu'on le lui dit.
        this.positionControl.refresh();
        this.positionStatus.textContent = position.kind === 'connue' ? '' : position.message;
        this.positionStatus.hidden = position.kind === 'connue' || position.message === '';
    }

    /** Ce que la position laisse derrière elle quand le choix se termine. */
    private clearPosition(): void {
        this.positionLayers.clear();
        this.positionControl.refresh();
        this.positionStatus.textContent = '';
        this.positionStatus.hidden = true;
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
        this.clearPosition();
        this.choix.next(result);
    }
}
