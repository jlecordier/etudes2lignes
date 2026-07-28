import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import iconeRetina from 'leaflet/dist/images/marker-icon-2x.png';
import icone from 'leaflet/dist/images/marker-icon.png';
import ombre from 'leaflet/dist/images/marker-shadow.png';
import { requete } from '../../commun/dom';
import { Coordonnee } from '../../trajets/domain/Coordonnee';
import type { PointAffiche } from '../ports/CarteDesPointsPort';
import type { SelecteurDeCoordonnee } from '../ports/SelecteurDeCoordonneePort';
import { creerCoucheOsm, VUE_FRANCE } from './coucheOsm';
import { iconeNumerotee } from './iconeNumerotee';

// Leaflet devine l'URL de ses icônes depuis le chemin de son script,
// ce qu'un bundler casse : on lui fournit les fichiers explicitement.
delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: iconeRetina, iconUrl: icone, shadowUrl: ombre });

const ZOOM_SUR_UN_POINT = 12;

/** Carte Leaflet plein écran (tuiles OSM) pour choisir une coordonnée. */
export class LeafletSelecteurDeCoordonnee implements SelecteurDeCoordonnee {
    private carte: L.Map | null = null;
    private marqueur: L.Marker | null = null;
    private reperes: L.Marker[] = [];
    private resoudre: ((coordonnee: Coordonnee | null) => void) | null = null;

    private readonly ecran = requete('#ecran-carte', HTMLElement);
    private readonly champLatitude = requete('#champ-latitude', HTMLInputElement);
    private readonly champLongitude = requete('#champ-longitude', HTMLInputElement);
    private readonly boutonValider = requete('#bouton-valider-carte', HTMLButtonElement);

    constructor() {
        requete('#bouton-annuler-carte', HTMLButtonElement).addEventListener('click', () => {
            this.terminer(null);
        });
        this.boutonValider.addEventListener('click', () => {
            this.validerLeMarqueur();
        });
        requete('#bouton-placer-manuel', HTMLButtonElement).addEventListener('click', () => {
            this.placerDepuisLaSaisie();
        });
    }

    choisir(
        coordonneeInitiale: Coordonnee | null,
        reperes: readonly PointAffiche[] = [],
    ): Promise<Coordonnee | null> {
        this.ecran.hidden = false;
        const carte = this.carteInitialisee();
        this.effacerLaSelection();
        this.poserLesReperes(reperes);
        if (coordonneeInitiale !== null) {
            this.poserLeMarqueur(coordonneeInitiale);
            carte.setView(
                [coordonneeInitiale.latitude, coordonneeInitiale.longitude],
                ZOOM_SUR_UN_POINT,
                { animate: false },
            );
        } else if (reperes.length > 0) {
            // Se situer par rapport au trajet : recadrer sur ses points.
            const bornes = L.latLngBounds(
                reperes.map((repere) => [repere.coordonnee.latitude, repere.coordonnee.longitude]),
            );
            carte.fitBounds(bornes, { padding: [40, 40], maxZoom: 12, animate: false });
        } else {
            carte.setView(VUE_FRANCE.centre, VUE_FRANCE.zoom, { animate: false });
        }
        // La carte vient d'être dévoilée : Leaflet doit remesurer son conteneur.
        setTimeout(() => carte.invalidateSize(), 0);
        return new Promise((resolve) => {
            this.resoudre = resolve;
        });
    }

    private carteInitialisee(): L.Map {
        if (this.carte !== null) {
            return this.carte;
        }
        this.carte = L.map('conteneur-carte');
        creerCoucheOsm().addTo(this.carte);
        this.carte.on('click', (evenement) => {
            const position = evenement.latlng.wrap();
            this.poserLeMarqueur(Coordonnee.creer(position.lat, position.lng));
        });
        return this.carte;
    }

    private poserLeMarqueur(coordonnee: Coordonnee): void {
        const position: [number, number] = [coordonnee.latitude, coordonnee.longitude];
        if (this.marqueur === null) {
            this.marqueur = L.marker(position, { draggable: true }).addTo(this.carteInitialisee());
            this.marqueur.on('dragend', () => {
                this.refleterLeMarqueurDansLaSaisie();
            });
        } else {
            this.marqueur.setLatLng(position);
        }
        this.refleterLeMarqueurDansLaSaisie();
    }

    private refleterLeMarqueurDansLaSaisie(): void {
        if (this.marqueur === null) {
            return;
        }
        const position = this.marqueur.getLatLng().wrap();
        this.champLatitude.value = position.lat.toFixed(5);
        this.champLongitude.value = position.lng.toFixed(5);
        this.boutonValider.disabled = false;
    }

    private placerDepuisLaSaisie(): void {
        try {
            const coordonnee = Coordonnee.creer(
                Number.parseFloat(this.champLatitude.value),
                Number.parseFloat(this.champLongitude.value),
            );
            this.poserLeMarqueur(coordonnee);
            this.carteInitialisee().setView(
                [coordonnee.latitude, coordonnee.longitude],
                ZOOM_SUR_UN_POINT,
                { animate: false },
            );
        } catch (erreur) {
            alert(erreur instanceof Error ? erreur.message : String(erreur));
        }
    }

    private validerLeMarqueur(): void {
        if (this.marqueur === null) {
            return;
        }
        const position = this.marqueur.getLatLng().wrap();
        this.terminer(Coordonnee.creer(position.lat, position.lng));
    }

    private poserLesReperes(reperes: readonly PointAffiche[]): void {
        for (const repere of this.reperes) {
            repere.remove();
        }
        this.reperes = reperes.map((repere) =>
            L.marker([repere.coordonnee.latitude, repere.coordonnee.longitude], {
                icon: iconeNumerotee(repere.numero),
                // Non interactif : cliquer un repère = cliquer la carte dessous.
                interactive: false,
            }).addTo(this.carteInitialisee()),
        );
    }

    private effacerLaSelection(): void {
        this.marqueur?.remove();
        this.marqueur = null;
        this.champLatitude.value = '';
        this.champLongitude.value = '';
        this.boutonValider.disabled = true;
    }

    private terminer(resultat: Coordonnee | null): void {
        this.ecran.hidden = true;
        this.resoudre?.(resultat);
        this.resoudre = null;
    }
}
