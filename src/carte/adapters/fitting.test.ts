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

/** Une carte Leaflet mesurée à la main : jsdom ne calcule aucune mise en page. */
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
    describe('Étant donné un trajet sans aucun point', () => {
        it('alors la carte montre la France entière', () => {
            const carte = testCarte();

            fitToPoints(carte, [], null);

            expect([carte.getCenter().lat, carte.getCenter().lng]).toEqual(FRANCE_VIEW.center);
            expect(carte.getZoom()).toBe(FRANCE_VIEW.zoom);
        });
    });

    describe('Étant donné deux points éloignés (Paris et Bordeaux)', () => {
        it('alors les deux tiennent dans la vue, centrée entre eux', () => {
            const carte = testCarte();

            fitToPoints(carte, [point(1, PARIS), point(2, BORDEAUX)], null);

            const vue = carte.getBounds();
            expect(vue.contains(L.latLng(PARIS.latitude, PARIS.longitude))).toBe(true);
            expect(vue.contains(L.latLng(BORDEAUX.latitude, BORDEAUX.longitude))).toBe(true);
            expect(carte.getCenter().lat).toBeCloseTo((PARIS.latitude + BORDEAUX.latitude) / 2, 1);
        });
    });

    describe('Étant donné un trajet réduit à un seul point', () => {
        it('alors la carte se cale dessus sans plonger au ras du sol', () => {
            const carte = testCarte();

            fitToPoints(carte, [point(1, PARIS)], null);

            expect(carte.getCenter().lat).toBeCloseTo(PARIS.latitude, 4);
            expect(carte.getCenter().lng).toBeCloseTo(PARIS.longitude, 4);
            expect(carte.getZoom()).toBe(12);
        });
    });

    describe('Étant donné deux points posés au même endroit (jonction de deux pages)', () => {
        it('alors le recadrage reste au même zoom que sur un point unique', () => {
            const carte = testCarte();

            fitToPoints(carte, [point(1, PARIS), point(2, PARIS)], null);

            expect(carte.getZoom()).toBe(12);
        });
    });

    describe('Étant donné une coordonnée sur laquelle se centrer', () => {
        it("alors la carte est centrée dessus, au zoom d'un point unique", () => {
            const carte = testCarte();

            centerOnCoordonnee(carte, BORDEAUX);

            expect([carte.getCenter().lat, carte.getCenter().lng]).toEqual([
                BORDEAUX.latitude,
                BORDEAUX.longitude,
            ]);
            expect(carte.getZoom()).toBe(12);
        });
    });

    describe('Étant donné une carte recadrée sur un trajet, puis vidée de ses points', () => {
        it('alors elle revient sur la France entière', () => {
            const carte = testCarte();
            fitToPoints(carte, [point(1, PARIS), point(2, BORDEAUX)], null);

            fitToPoints(carte, [], null);

            expect(carte.getZoom()).toBe(FRANCE_VIEW.zoom);
        });
    });

    describe("Étant donné les points d'un trajet et la position de l'utilisateur", () => {
        it('alors les deux tiennent dans la vue', () => {
            const carte = testCarte();

            fitToPoints(carte, [point(1, PARIS)], BORDEAUX);

            const vue = carte.getBounds();
            expect(vue.contains(L.latLng(PARIS.latitude, PARIS.longitude))).toBe(true);
            expect(vue.contains(L.latLng(BORDEAUX.latitude, BORDEAUX.longitude))).toBe(true);
        });
    });

    describe('Étant donné aucun point, mais une position connue', () => {
        it('alors la carte se cale dessus plutôt que sur la France entière', () => {
            const carte = testCarte();

            fitToPoints(carte, [], PARIS);

            expect(carte.getCenter().lat).toBeCloseTo(PARIS.latitude, 4);
            expect(carte.getCenter().lng).toBeCloseTo(PARIS.longitude, 4);
            expect(carte.getZoom()).toBe(12);
        });
    });
});
