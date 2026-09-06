// @vitest-environment jsdom
import * as L from 'leaflet';
import { describe, expect, it } from 'vitest';
import { Coordonnee } from '../../trajets/domain/Coordonnee';
import { PositionControl } from './positionControl';
import { PositionLayers } from './positionLayers';

const PARIS = Coordonnee.create(48.8566, 2.3522);

/** Un conteneur mesuré : jsdom ne calcule aucune mise en page, et Leaflet
 * croirait sa carte de taille nulle, incapable de calculer un zoom. */
function carte(): L.Map {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 600 });
    Object.defineProperty(container, 'clientHeight', { value: 600 });
    document.body.append(container);
    return L.map(container).setView([46.6, 2.4], 6);
}

function bouton(id: string): HTMLButtonElement | null {
    return document.querySelector(`#${id}`) instanceof HTMLButtonElement ?
            document.querySelector(`#${id}`)
        :   null;
}

describe('PositionControl', () => {
    describe("Étant donné une carte dont on ne connaît pas la position, quand j'y pose le contrôle", () => {
        it('alors son bouton est sur la carte, nommé, et inerte', () => {
            const controle = new PositionControl('recentrer', new PositionLayers());

            controle.addTo(carte());

            // Sur la carte, et non à côté : c'est la convention de la
            // plateforme, et l'adapter détient déjà la coordonnée à recentrer.
            expect(bouton('recentrer')?.getAttribute('aria-label')).toBe('Ma position');
            expect(bouton('recentrer')?.disabled).toBe(true);
        });
    });

    describe("Étant donné le contrôle posé, quand une position arrive puis s'en va", () => {
        it("alors son bouton s'active, puis redevient inerte", () => {
            const layers = new PositionLayers();
            const carteDuTest = carte();
            const controle = new PositionControl('recentrer-2', layers);
            controle.addTo(carteDuTest);

            layers.paint(carteDuTest, { kind: 'connue', coordonnee: PARIS });
            controle.refresh();
            const actifAvecPosition = bouton('recentrer-2')?.disabled;

            layers.clear();
            controle.refresh();

            // C'est l'appelant qui sait quand la position a changé : lui
            // demander de rafraîchir garde le contrôle sans abonnement à
            // refermer, là où écouter la carte en ouvrirait un.
            expect(actifAvecPosition).toBe(false);
            expect(bouton('recentrer-2')?.disabled).toBe(true);
        });
    });

    describe('Étant donné une position connue, quand je clique le contrôle', () => {
        it('alors la carte vient à elle, au zoom du point unique', () => {
            const layers = new PositionLayers();
            const carteDuTest = carte();
            const controle = new PositionControl('recentrer-3', layers);
            controle.addTo(carteDuTest);
            layers.paint(carteDuTest, { kind: 'connue', coordonnee: PARIS });
            // Comme le fera l'adapter : un bouton laissé inerte n'émet aucun
            // clic, et le test se croirait sans effet alors qu'il est sans geste.
            controle.refresh();

            bouton('recentrer-3')?.click();

            // Le même cadrage que « aller au point », et par le même code : on
            // arrive d'ailleurs, il n'y a pas d'échelle réglée à la main à voler.
            expect(carteDuTest.getCenter().lat).toBeCloseTo(PARIS.latitude, 4);
            expect(carteDuTest.getCenter().lng).toBeCloseTo(PARIS.longitude, 4);
        });
    });
});
