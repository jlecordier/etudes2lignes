import * as L from 'leaflet';
import type { Coordonnee } from '../../trajets/domain/Coordonnee';
import type { PointAffiche } from '../ports/CarteDesPointsPort';
import { versLatLng } from './conversion';
import { VUE_FRANCE } from './coucheOsm';

/**
 * Zoom du centrage sur un point unique, et plafond du recadrage sur un
 * ensemble : deux points voisins ne doivent pas coller la carte au sol.
 */
const ZOOM_SUR_UN_POINT = 12;

/**
 * Marge conservée autour des points, en pixels : la pastille numérotée mesure
 * 26 px et est centrée sur son point, donc elle dépasse de 13 px — 40 px la
 * laissent entière, avec de quoi respirer.
 */
const MARGE_DE_RECADRAGE: [number, number] = [40, 40];

/**
 * Cadre la carte sur tous les points donnés — sur la France entière quand il
 * n'y en a aucun. Un seul cadrage pour toutes les cartes de l'appli : les deux
 * adapters divergeaient, ce qui donnait un cadrage différent selon l'écran.
 */
export function recadrerSurLesPoints(carte: L.Map, points: readonly PointAffiche[]): void {
    if (points.length === 0) {
        carte.setView(VUE_FRANCE.centre, VUE_FRANCE.zoom, { animate: false });
        return;
    }
    const bornes = L.latLngBounds(points.map((point) => versLatLng(point.coordonnee)));
    carte.fitBounds(bornes, {
        padding: MARGE_DE_RECADRAGE,
        maxZoom: ZOOM_SUR_UN_POINT,
        animate: false,
    });
}

/** Centre la carte sur une coordonnée, au même zoom pour toutes les cartes. */
export function centrerSurLaCoordonnee(carte: L.Map, coordonnee: Coordonnee): void {
    carte.setView(versLatLng(coordonnee), ZOOM_SUR_UN_POINT, { animate: false });
}
