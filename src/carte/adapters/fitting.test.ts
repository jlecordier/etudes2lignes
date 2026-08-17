// @vitest-environment jsdom
import * as L from 'leaflet';
import { describe, expect, it } from 'vitest';
import { Coordonnee } from '../../trajets/domain/Coordonnee';
import { newPointId } from '../../trajets/domain/ids';
import type { DisplayedPoint } from '../ports/CarteDesPointsPort';
import { FRANCE_VIEW } from './osmLayer';
import { centerOnCoordonnee, fitToPoints } from './fitting';

const PARIS = Coordonnee.create(48.8566, 2.3522);
const BORDEAUX = Coordonnee.create(44.8378, -0.5792);

/** Une carte Leaflet mesuree a la main : jsdom ne calcule aucune mise en page. */
function testCarte(): L.Map {
    const container = document.createElement('div');
    // Sans ces mesures, Leaflet croit sa carte de taille nulle et ne sait
    // calculer aucun zoom de recadrage.
    Object.defineProperty(container, 'clientWidth', { value: 600 });
    Object.defineProperty(container, 'clientHeight', { value: 600 });
    document.body.append(container);
    return L.map(container);
}

function point(number: number, coordonnee: Coordonnee): DisplayedPoint {
    return { id: newPointId(), number, coordonnee };
}

describe('Recadrage commun aux cartes', () => {
    describe('Etant donne un trajet sans aucun point', () => {
        it('alors la carte montre la France entiere', () => {
            const carte = testCarte();

            fitToPoints(carte, [], null);

            expect([carte.getCenter().lat, carte.getCenter().lng]).toEqual(FRANCE_VIEW.center);
            expect(carte.getZoom()).toBe(FRANCE_VIEW.zoom);
        });
    });

    describe('Etant donne deux points eloignes (Paris et Bordeaux)', () => {
        it('alors les deux tiennent dans la vue, centree entre eux', () => {
            const carte = testCarte();

            fitToPoints(carte, [point(1, PARIS), point(2, BORDEAUX)], null);

            const vue = carte.getBounds();
            expect(vue.contains(L.latLng(PARIS.latitude, PARIS.longitude))).toBe(true);
            expect(vue.contains(L.latLng(BORDEAUX.latitude, BORDEAUX.longitude))).toBe(true);
            expect(carte.getCenter().lat).toBeCloseTo((PARIS.latitude + BORDEAUX.latitude) / 2, 1);
        });
    });

    describe('Etant donne un trajet reduit a un seul point', () => {
        it('alors la carte se cale dessus sans plonger au ras du sol', () => {
            const carte = testCarte();

            fitToPoints(carte, [point(1, PARIS)], null);

            expect(carte.getCenter().lat).toBeCloseTo(PARIS.latitude, 4);
            expect(carte.getCenter().lng).toBeCloseTo(PARIS.longitude, 4);
            expect(carte.getZoom()).toBe(12);
        });
    });

    describe('Etant donne deux points poses au meme endroit (jonction de deux pages)', () => {
        it('alors le recadrage reste au meme zoom que sur un point unique', () => {
            const carte = testCarte();

            fitToPoints(carte, [point(1, PARIS), point(2, PARIS)], null);

            expect(carte.getZoom()).toBe(12);
        });
    });

    describe('Etant donne une coordonnee sur laquelle se centrer', () => {
        it("alors la carte est centree dessus, au zoom d'un point unique", () => {
            const carte = testCarte();

            centerOnCoordonnee(carte, BORDEAUX);

            expect([carte.getCenter().lat, carte.getCenter().lng]).toEqual([
                BORDEAUX.latitude,
                BORDEAUX.longitude,
            ]);
            expect(carte.getZoom()).toBe(12);
        });
    });

    describe('Etant donne une carte recadree sur un trajet, puis videe de ses points', () => {
        it('alors elle revient sur la France entiere', () => {
            const carte = testCarte();
            fitToPoints(carte, [point(1, PARIS), point(2, BORDEAUX)], null);

            fitToPoints(carte, [], null);

            expect(carte.getZoom()).toBe(FRANCE_VIEW.zoom);
        });
    });

    describe("Etant donne les points d'un trajet et la position de l'utilisateur", () => {
        it('alors les deux tiennent dans la vue', () => {
            const carte = testCarte();

            fitToPoints(carte, [point(1, PARIS)], BORDEAUX);

            const vue = carte.getBounds();
            expect(vue.contains(L.latLng(PARIS.latitude, PARIS.longitude))).toBe(true);
            expect(vue.contains(L.latLng(BORDEAUX.latitude, BORDEAUX.longitude))).toBe(true);
        });
    });

    describe('Etant donne aucun point, mais une position connue', () => {
        it('alors la carte se cale dessus plutot que sur la France entiere', () => {
            const carte = testCarte();

            fitToPoints(carte, [], PARIS);

            expect(carte.getCenter().lat).toBeCloseTo(PARIS.latitude, 4);
            expect(carte.getCenter().lng).toBeCloseTo(PARIS.longitude, 4);
            expect(carte.getZoom()).toBe(12);
        });
    });
});
