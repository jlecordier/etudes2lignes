import * as L from 'leaflet';

/** La pastille rouge numérotée, commune à toutes les cartes de l'appli. */
export function iconeNumerotee(numero: number): L.DivIcon {
    return L.divIcon({
        className: 'marqueur-carte',
        html: String(numero),
        iconSize: [26, 26],
        iconAnchor: [13, 13],
    });
}
