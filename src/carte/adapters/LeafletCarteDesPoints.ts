import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Coordonnee } from '../../trajets/domain/Coordonnee';
import type { PointId } from '../../trajets/domain/ids';
import type { CarteDesPoints, PointAffiche } from '../ports/CarteDesPointsPort';
import { creerCoucheOsm, VUE_FRANCE } from './coucheOsm';

interface MarqueurPose {
    readonly marqueur: L.Marker;
    numero: number;
}

/**
 * Carte Leaflet intégrée à l'éditeur : tous les points du trajet, numérotés
 * et déplaçables au doigt ou à la souris.
 */
export class LeafletCarteDesPoints implements CarteDesPoints {
    private carte: L.Map | null = null;
    private readonly marqueurs = new Map<PointId, MarqueurPose>();
    private idsAffiches = '';
    private surDeplacement: ((id: PointId, coordonnee: Coordonnee) => void) | null = null;
    private resoudreLeChoix: ((coordonnee: Coordonnee | null) => void) | null = null;

    constructor(private readonly idDuConteneur: string) {}

    afficher(
        points: readonly PointAffiche[],
        surDeplacement: (id: PointId, coordonnee: Coordonnee) => void,
    ): void {
        this.surDeplacement = surDeplacement;
        const carte = this.carteInitialisee();

        const presents = new Set(points.map((point) => point.id));
        for (const [id, pose] of this.marqueurs) {
            if (!presents.has(id)) {
                pose.marqueur.remove();
                this.marqueurs.delete(id);
            }
        }
        for (const point of points) {
            this.poserOuMettreAJour(point);
        }

        // La carte a pu être (dé)masquée avec l'écran : remesurer le conteneur.
        setTimeout(() => carte.invalidateSize(), 0);

        const ids = points
            .map((point) => point.id)
            .sort()
            .join(',');
        if (ids !== this.idsAffiches) {
            this.idsAffiches = ids;
            this.recadrer(points);
        }
    }

    choisirUneCoordonnee(): Promise<Coordonnee | null> {
        this.annulerLeChoix();
        this.carteInitialisee().getContainer().classList.add('attente-clic');
        return new Promise((resolve) => {
            this.resoudreLeChoix = resolve;
        });
    }

    annulerLeChoix(): void {
        this.carte?.getContainer().classList.remove('attente-clic');
        this.resoudreLeChoix?.(null);
        this.resoudreLeChoix = null;
    }

    private carteInitialisee(): L.Map {
        if (this.carte !== null) {
            return this.carte;
        }
        this.carte = L.map(this.idDuConteneur).setView(VUE_FRANCE.centre, VUE_FRANCE.zoom);
        creerCoucheOsm().addTo(this.carte);
        this.carte.on('click', (evenement) => {
            const enAttente = this.resoudreLeChoix;
            if (enAttente === null) {
                return;
            }
            this.resoudreLeChoix = null;
            this.carte!.getContainer().classList.remove('attente-clic');
            const position = evenement.latlng.wrap();
            enAttente(Coordonnee.creer(position.lat, position.lng));
        });
        return this.carte;
    }

    private poserOuMettreAJour(point: PointAffiche): void {
        const position: [number, number] = [point.coordonnee.latitude, point.coordonnee.longitude];
        const existant = this.marqueurs.get(point.id);
        if (existant !== undefined) {
            existant.marqueur.setLatLng(position);
            if (existant.numero !== point.numero) {
                existant.marqueur.setIcon(iconeNumerotee(point.numero));
                existant.numero = point.numero;
            }
            return;
        }
        const marqueur = L.marker(position, {
            draggable: true,
            icon: iconeNumerotee(point.numero),
        }).addTo(this.carteInitialisee());
        marqueur.on('dragend', () => {
            const arrivee = marqueur.getLatLng().wrap();
            this.surDeplacement?.(point.id, Coordonnee.creer(arrivee.lat, arrivee.lng));
        });
        this.marqueurs.set(point.id, { marqueur, numero: point.numero });
    }

    private recadrer(points: readonly PointAffiche[]): void {
        const carte = this.carteInitialisee();
        if (points.length === 0) {
            carte.setView(VUE_FRANCE.centre, VUE_FRANCE.zoom, { animate: false });
            return;
        }
        const bornes = L.latLngBounds(
            points.map((point) => [point.coordonnee.latitude, point.coordonnee.longitude]),
        );
        carte.fitBounds(bornes, { padding: [30, 30], maxZoom: 13, animate: false });
    }
}

function iconeNumerotee(numero: number): L.DivIcon {
    return L.divIcon({
        className: 'marqueur-carte',
        html: String(numero),
        iconSize: [26, 26],
        iconAnchor: [13, 13],
    });
}
