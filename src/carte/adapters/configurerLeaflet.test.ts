// @vitest-environment jsdom
import * as L from 'leaflet';
import { describe, expect, it } from 'vitest';
import { configurerLeaflet } from './configurerLeaflet';
// Importés pour eux-mêmes : le premier test vérifie que les charger ne
// configure pas Leaflet au passage.
import './LeafletCarteDesPoints';
import './LeafletSelecteurDeCoordonnee';

/** L'URL que Leaflet retiendrait aujourd'hui pour l'icône d'un marqueur. */
function urlDeLIconeParDefaut(): string | undefined {
    return new L.Icon.Default().options.iconUrl;
}

// Les deux cas se lisent dans l'ordre : le premier décrit Leaflet avant toute
// configuration, le second après. La configuration est un état de module, il
// n'existe qu'un seul Leaflet par fichier de test.
describe('Configuration de Leaflet', () => {
    describe('Étant donné les adapters de carte importés, mais aucune carte créée', () => {
        it('alors Leaflet n’est pas configuré : ce n’est plus un effet de bord d’import', () => {
            // Le devineur d'URL de Leaflet — celui que le bundler casse — est
            // encore en place, et l'icône n'est encore que le nom de fichier nu
            // livré par Leaflet, qu'aucun bundler ne sait résoudre.
            expect(Object.hasOwn(L.Icon.Default.prototype, '_getIconUrl')).toBe(true);
            expect(urlDeLIconeParDefaut()).toBe('marker-icon.png');
        });
    });

    describe('Étant donné Leaflet configuré deux fois de suite', () => {
        it('alors les icônes du marqueur sont fournies explicitement, sans devineur d’URL', () => {
            configurerLeaflet();
            configurerLeaflet();

            expect(Object.hasOwn(L.Icon.Default.prototype, '_getIconUrl')).toBe(false);
            // Une URL résolue par le bundler, plus un nom de fichier nu.
            expect(urlDeLIconeParDefaut()).toMatch(/^\/.+\/marker-icon\.png$/);
        });
    });
});
