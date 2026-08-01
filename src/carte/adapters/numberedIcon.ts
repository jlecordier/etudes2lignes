import * as L from 'leaflet';

/** La pastille rouge numérotée, commune à toutes les cartes de l'appli. */
export function numberedIcon(number: number): L.DivIcon {
    return L.divIcon({
        className: 'carte-marker',
        html: String(number),
        iconSize: [26, 26],
        iconAnchor: [13, 13],
    });
}
