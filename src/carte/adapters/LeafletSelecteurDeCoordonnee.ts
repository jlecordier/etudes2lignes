import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { requete } from '../../commun/dom';
import type { Coordonnee } from '../../trajets/domain/Coordonnee';
import type { PointAffiche } from '../ports/CarteDesPointsPort';
import type { SelecteurDeCoordonnee } from '../ports/SelecteurDeCoordonneePort';
import { configurerLeaflet } from './configurerLeaflet';
import { versCoordonnee, versLatLng } from './conversion';
import { creerCoucheOsm } from './coucheOsm';
import { iconeNumerotee } from './iconeNumerotee';
import { centrerSurLaCoordonnee, recadrerSurLesPoints } from './recadrage';
import { CONSIGNE_DE_SAISIE, coordonneeDeLaSaisie } from './saisieDeCoordonnee';

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
        reperes: readonly PointAffiche[],
    ): Promise<Coordonnee | null> {
        this.ecran.hidden = false;
        const carte = this.carteInitialisee();
        this.effacerLaSelection();
        this.poserLesReperes(reperes);
        if (coordonneeInitiale === null) {
            // Se situer par rapport au trajet : recadrer sur ses points.
            recadrerSurLesPoints(carte, reperes);
        } else {
            this.poserLeMarqueur(coordonneeInitiale);
            centrerSurLaCoordonnee(carte, coordonneeInitiale);
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
        configurerLeaflet();
        this.carte = L.map('conteneur-carte');
        creerCoucheOsm().addTo(this.carte);
        this.carte.on('click', (evenement) => {
            this.poserLeMarqueur(versCoordonnee(evenement.latlng));
        });
        return this.carte;
    }

    private poserLeMarqueur(coordonnee: Coordonnee): void {
        const position = versLatLng(coordonnee);
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
        const coordonnee = versCoordonnee(this.marqueur.getLatLng());
        this.champLatitude.value = coordonnee.latitude.toFixed(5);
        this.champLongitude.value = coordonnee.longitude.toFixed(5);
        this.boutonValider.disabled = false;
    }

    private placerDepuisLaSaisie(): void {
        const coordonnee = coordonneeDeLaSaisie(
            this.champLatitude.value,
            this.champLongitude.value,
        );
        if (coordonnee === null) {
            alert(CONSIGNE_DE_SAISIE);
            return;
        }
        this.poserLeMarqueur(coordonnee);
        centrerSurLaCoordonnee(this.carteInitialisee(), coordonnee);
    }

    private validerLeMarqueur(): void {
        if (this.marqueur === null) {
            return;
        }
        this.terminer(versCoordonnee(this.marqueur.getLatLng()));
    }

    private poserLesReperes(reperes: readonly PointAffiche[]): void {
        for (const repere of this.reperes) {
            repere.remove();
        }
        this.reperes = reperes.map((repere) =>
            L.marker(versLatLng(repere.coordonnee), {
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
        const enAttente = this.resoudre;
        this.resoudre = null;
        enAttente?.(resultat);
    }
}
