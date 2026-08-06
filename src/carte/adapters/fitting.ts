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
 * Cadre la carte sur tous les points donnés — sur la France entière quand il
 * n'y en a aucun. Un seul cadrage pour toutes les cartes de l'appli : les deux
 * adapters divergeaient, ce qui donnait un cadrage différent selon l'écran.
 */
export function fitToPoints(carte: L.Map, points: readonly DisplayedPoint[]): void {
    if (points.length === 0) {
        carte.setView(FRANCE_VIEW.center, FRANCE_VIEW.zoom, { animate: false });
        return;
    }
    const bounds = L.latLngBounds(points.map((point) => toLatLng(point.coordonnee)));
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
