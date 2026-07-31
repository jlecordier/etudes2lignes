import type * as L from 'leaflet';
import { Coordonnee } from '../../trajets/domain/Coordonnee';

/**
 * La seule traduction entre le repère de Leaflet (`L.LatLng`) et celui du
 * domaine (`Coordonnee`), pour toutes les cartes de l'appli.
 */

/**
 * La coordonnée du domaine correspondant à un point Leaflet.
 *
 * Le ramené (`wrap`) est indispensable : Leaflet laisse défiler le monde en
 * boucle, si bien qu'un clic après un tour complet rend une longitude de 380° —
 * que `Coordonnee` refuse. Sans lui, l'exception partirait depuis un
 * gestionnaire d'événement Leaflet, sans personne pour l'attraper.
 *
 * Il ne s'applique qu'aux longitudes réellement hors du globe : `wrap()` passe
 * par un modulo, qui décale la valeur d'un dix-milliardième de degré même
 * quand elle était déjà bonne. Sur le chemin ordinaire (un clic, un marqueur
 * déplacé) la coordonnée reste ainsi exacte.
 */
export function versCoordonnee(latLng: L.LatLng): Coordonnee {
    const dansLeGlobe = latLng.lng >= -180 && latLng.lng <= 180;
    const ramenee = dansLeGlobe ? latLng : latLng.wrap();
    return Coordonnee.creer(ramenee.lat, ramenee.lng);
}

/** Le couple `[latitude, longitude]` attendu par les API de Leaflet. */
export function versLatLng(coordonnee: Coordonnee): [number, number] {
    return [coordonnee.latitude, coordonnee.longitude];
}
