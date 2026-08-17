import * as L from 'leaflet';
import type { Coordonnee } from '../../trajets/domain/Coordonnee';
import type { DisplayedPosition } from '../ports/CarteDesPointsPort';
import { toLatLng } from './conversion';

/**
 * Le disque de « ma position ».
 *
 * Même règle que `numberedIcon`, et pour la même raison : `iconSize: undefined`
 * neutralise le `[12, 12]` que `DivIcon` inscrirait en style inline — lequel
 * gagne contre la feuille —, et c'est `style.css` qui donne la taille comme le
 * centrage (marge négative, et non `iconAnchor`). Une géométrie écrite deux fois
 * finit par donner deux symboles différents.
 */
function positionIcon(): L.DivIcon {
    return L.divIcon({
        className: 'carte-position-marker',
        html: '',
        iconSize: undefined,
    });
}

/**
 * Les couches de « ma position » sur une carte : le disque, et le cercle
 * d'incertitude quand la position en porte une.
 *
 * Posées et retirées ensemble, par **un seul** code pour les deux cartes. C'est
 * exactement ce que `fitting.ts` a fait pour le cadrage, et pour la raison
 * écrite dans son en-tête : les deux adapters avaient divergé, et le cadrage
 * changeait selon l'écran.
 */
export class PositionLayers {
    private marker: L.Marker | null = null;
    private circle: L.Circle | null = null;
    private shown: Coordonnee | null = null;

    /** La coordonnée actuellement montrée, ou `null` — ce que le cadrage doit connaître. */
    coordonnee(): Coordonnee | null {
        return this.shown;
    }

    /**
     * Refait les couches plutôt que de les déplacer : au mieux une position
     * toutes les dix secondes, et un cercle change de rayon aussi souvent que de
     * centre.
     *
     * Aucun recadrage ici, délibérément : une position qui arrive ne vole pas le
     * cadrage. C'est le cadrage qui va la chercher, quand il se calcule.
     */
    paint(carte: L.Map, position: DisplayedPosition): void {
        this.clear();
        if (position.kind === 'inconnue') {
            return;
        }
        this.shown = position.coordonnee;
        // Non interactif, comme les repères et pour la raison que le port écrit
        // déjà : cliquer dessus doit revenir à cliquer la carte à cet endroit,
        // sans quoi il volerait le geste qui désigne une coordonnée.
        this.marker = L.marker(toLatLng(position.coordonnee), {
            icon: positionIcon(),
            interactive: false,
        }).addTo(carte);
        if (position.kind === 'approximative') {
            // Le rayon que la source a mesuré, en mètres — ce que `L.circle`
            // attend. Une position acceptée n'en transporte aucune, et en
            // inventer une serait mentir.
            this.circle = L.circle(toLatLng(position.coordonnee), {
                radius: position.imprecisionMetres,
                className: 'carte-position-circle',
                interactive: false,
            }).addTo(carte);
        }
    }

    /** Rend tout ce que la position tenait. Se rappeler sans dommage. */
    clear(): void {
        this.marker?.remove();
        this.marker = null;
        this.circle?.remove();
        this.circle = null;
        this.shown = null;
    }
}
