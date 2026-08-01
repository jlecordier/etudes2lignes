import * as L from 'leaflet';
import retinaIconUrl from 'leaflet/dist/images/marker-icon-2x.png';
import icone from 'leaflet/dist/images/marker-icon.png';
import ombre from 'leaflet/dist/images/marker-shadow.png';

let alreadyConfigured = false;

/**
 * Fournit à Leaflet les fichiers de son marqueur par défaut.
 *
 * Leaflet devine l'URL de ses icônes depuis le chemin de son script, ce qu'un
 * bundler casse : on lui passe les images explicitement. Cette configuration
 * est appelée par chaque adapter au moment où il crée sa carte — jamais au
 * chargement d'un module, sinon l'ordre des imports décide du comportement et
 * une carte hérite d'un correctif qu'elle n'a pas demandé.
 *
 * Idempotente : les adapters l'appellent sans se concerter.
 */
export function configureLeaflet(): void {
    if (alreadyConfigured) {
        return;
    }
    alreadyConfigured = true;
    Reflect.deleteProperty(L.Icon.Default.prototype, '_getIconUrl');
    L.Icon.Default.mergeOptions({ iconRetinaUrl: retinaIconUrl, iconUrl: icone, shadowUrl: ombre });
}
