import * as L from 'leaflet';

/** La couche de tuiles OpenStreetMap, commune à toutes les cartes de l'appli. */
export function creerCoucheOsm(): L.TileLayer {
    return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        // crossOrigin : sans lui, les tuiles arrivent en réponses opaques
        // que Chromium compte ~7 Mo pièce dans le quota de stockage —
        // le cache hors ligne ferait alors s'évincer nos propres trajets.
        crossOrigin: true,
        attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    });
}

/** La vue par défaut : la France entière, quand on n'a aucun point à montrer. */
export const VUE_FRANCE: { centre: [number, number]; zoom: number } = {
    centre: [46.6, 2.4],
    zoom: 6,
};
