import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Coordonnee } from '../../trajets/domain/Coordonnee';
import type { PointId } from '../../trajets/domain/ids';
import type { CarteDesPoints, PointAffiche } from '../ports/CarteDesPointsPort';
import { configurerLeaflet } from './configurerLeaflet';
import { versCoordonnee, versLatLng } from './conversion';
import { creerCoucheOsm, VUE_FRANCE } from './coucheOsm';
import { iconeNumerotee } from './iconeNumerotee';
import { centrerSurLaCoordonnee, recadrerSurLesPoints } from './recadrage';

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
            recadrerSurLesPoints(carte, points);
        }
    }

    choisirUneCoordonnee(coordonneeInitiale: Coordonnee | null): Promise<Coordonnee | null> {
        this.annulerLeChoix();
        const carte = this.carteInitialisee();
        carte.getContainer().classList.add('attente-clic');
        if (coordonneeInitiale !== null) {
            // Déplacer un point : on part de là où il est, comme la carte plein
            // écran le fait sur mobile.
            centrerSurLaCoordonnee(carte, coordonneeInitiale);
        }
        return new Promise((resolve) => {
            this.resoudreLeChoix = resolve;
        });
    }

    annulerLeChoix(): void {
        this.carte?.getContainer().classList.remove('attente-clic');
        const enAttente = this.resoudreLeChoix;
        this.resoudreLeChoix = null;
        enAttente?.(null);
    }

    private carteInitialisee(): L.Map {
        if (this.carte !== null) {
            return this.carte;
        }
        configurerLeaflet();
        const carte = L.map(this.idDuConteneur).setView(VUE_FRANCE.centre, VUE_FRANCE.zoom);
        this.carte = carte;
        creerCoucheOsm().addTo(carte);
        // Rotation d'un iPad/téléphone : le conteneur change de taille sans
        // repasser par afficher() — Leaflet doit se remesurer tout de suite.
        window.addEventListener('resize', () => carte.invalidateSize());
        carte.on('click', (evenement) => {
            const enAttente = this.resoudreLeChoix;
            if (enAttente === null) {
                return;
            }
            this.resoudreLeChoix = null;
            carte.getContainer().classList.remove('attente-clic');
            enAttente(versCoordonnee(evenement.latlng));
        });
        return carte;
    }

    private poserOuMettreAJour(point: PointAffiche): void {
        const position = versLatLng(point.coordonnee);
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
            this.surDeplacement?.(point.id, versCoordonnee(marqueur.getLatLng()));
        });
        this.marqueurs.set(point.id, { marqueur, numero: point.numero });
    }
}
