import * as L from 'leaflet';
import type { Coordonnee } from '../../trajets/domain/Coordonnee';
import type { DisplayedPoint } from '../ports/CarteDesPointsPort';
import { toLatLng } from './conversion';
import { FRANCE_VIEW } from './osmLayer';

/**
 * Zoom du centrage sur un point unique, et plafond du recadrage sur un
 * ensemble : deux points voisins ne doivent pas coller la carte au sol.
 */
const SINGLE_POINT_ZOOM = 12;

/**
 * Marge conservée autour des points, en pixels : la pastille numérotée est
 * centrée sur son point, donc elle dépasse d'une demi-pastille — soit 13 px pour
 * les 1,625 rem que la feuille de style lui donne (`--point-badge-size`). 40 px
 * la laissent entière, avec de quoi respirer.
 */
const FIT_PADDING: [number, number] = [40, 40];

/**
 * Cadre la carte sur tous les points donnés **et sur la position de
 * l'utilisateur quand on la connaît** — sur la France entière quand il n'y a ni
 * l'un ni l'autre. Un seul cadrage pour toutes les cartes de l'appli : les deux
 * adapters divergeaient, ce qui donnait un cadrage différent selon l'écran.
 *
 * La position est un troisième paramètre, et non un `DisplayedPoint` de plus :
 * elle n'a ni identifiant ni numéro, et lui en fabriquer un serait un mensonge.
 *
 * Le cadrage n'utilise que ce qu'on sait à l'instant où il se calcule : une
 * position qui arrive ensuite ne le refait pas — un saut deux secondes après
 * l'ouverture, pour ce que le bouton « Ma position » donne à la demande.
 */
export function fitToPoints(
    carte: L.Map,
    points: readonly DisplayedPoint[],
    position: Coordonnee | null,
): void {
    const coordonnees = points.map((point) => point.coordonnee);
    if (position !== null) {
        coordonnees.push(position);
    }
    if (coordonnees.length === 0) {
        carte.setView(FRANCE_VIEW.center, FRANCE_VIEW.zoom, { animate: false });
        return;
    }
    const bounds = L.latLngBounds(coordonnees.map((coordonnee) => toLatLng(coordonnee)));
    carte.fitBounds(bounds, {
        padding: FIT_PADDING,
        maxZoom: SINGLE_POINT_ZOOM,
        animate: false,
    });
}

/** Centre la carte sur une coordonnée, au même zoom pour toutes les cartes. */
export function centerOnCoordonnee(carte: L.Map, coordonnee: Coordonnee): void {
    carte.setView(toLatLng(coordonnee), SINGLE_POINT_ZOOM, { animate: false });
}

/**
 * Remesure la carte à la microtâche suivante : son conteneur vient d'être
 * dévoilé ou (dé)masqué avec son écran, et Leaflet ne mesure qu'au moment où on
 * le lui demande. Écrit une fois pour les deux cartes — il l'était deux fois.
 */
export function remeasureAfterReveal(carte: L.Map): void {
    setTimeout(() => carte.invalidateSize(), 0);
}
