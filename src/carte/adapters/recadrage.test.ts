// @vitest-environment jsdom
import * as L from 'leaflet';
import { describe, expect, it } from 'vitest';
import { Coordonnee } from '../../trajets/domain/Coordonnee';
import { nouveauPointId } from '../../trajets/domain/ids';
import type { PointAffiche } from '../ports/CarteDesPointsPort';
import { VUE_FRANCE } from './coucheOsm';
import { centrerSurLaCoordonnee, recadrerSurLesPoints } from './recadrage';

const PARIS = Coordonnee.creer(48.8566, 2.3522);
const BORDEAUX = Coordonnee.creer(44.8378, -0.5792);

/** Une carte Leaflet mesurée à la main : jsdom ne calcule aucune mise en page. */
function carteDeTest(): L.Map {
    const conteneur = document.createElement('div');
    // Sans ces mesures, Leaflet croit sa carte de taille nulle et ne sait
    // calculer aucun zoom de recadrage.
    Object.defineProperty(conteneur, 'clientWidth', { value: 600 });
    Object.defineProperty(conteneur, 'clientHeight', { value: 600 });
    document.body.append(conteneur);
    return L.map(conteneur);
}

function point(numero: number, coordonnee: Coordonnee): PointAffiche {
    return { id: nouveauPointId(), numero, coordonnee };
}

describe('Recadrage commun aux cartes', () => {
    describe('Étant donné un trajet sans aucun point', () => {
        it('alors la carte montre la France entière', () => {
            const carte = carteDeTest();

            recadrerSurLesPoints(carte, []);

            expect([carte.getCenter().lat, carte.getCenter().lng]).toEqual(VUE_FRANCE.centre);
            expect(carte.getZoom()).toBe(VUE_FRANCE.zoom);
        });
    });

    describe('Étant donné deux points éloignés (Paris et Bordeaux)', () => {
        it('alors les deux tiennent dans la vue, centrée entre eux', () => {
            const carte = carteDeTest();

            recadrerSurLesPoints(carte, [point(1, PARIS), point(2, BORDEAUX)]);

            const vue = carte.getBounds();
            expect(vue.contains(L.latLng(PARIS.latitude, PARIS.longitude))).toBe(true);
            expect(vue.contains(L.latLng(BORDEAUX.latitude, BORDEAUX.longitude))).toBe(true);
            expect(carte.getCenter().lat).toBeCloseTo((PARIS.latitude + BORDEAUX.latitude) / 2, 1);
        });
    });

    describe('Étant donné un trajet réduit à un seul point', () => {
        it('alors la carte se cale dessus sans plonger au ras du sol', () => {
            const carte = carteDeTest();

            recadrerSurLesPoints(carte, [point(1, PARIS)]);

            expect(carte.getCenter().lat).toBeCloseTo(PARIS.latitude, 4);
            expect(carte.getCenter().lng).toBeCloseTo(PARIS.longitude, 4);
            expect(carte.getZoom()).toBe(12);
        });
    });

    describe('Étant donné deux points posés au même endroit (jonction de deux pages)', () => {
        it('alors le recadrage reste au même zoom que sur un point unique', () => {
            const carte = carteDeTest();

            recadrerSurLesPoints(carte, [point(1, PARIS), point(2, PARIS)]);

            expect(carte.getZoom()).toBe(12);
        });
    });

    describe('Étant donné une coordonnée sur laquelle se centrer', () => {
        it('alors la carte est centrée dessus, au zoom d’un point unique', () => {
            const carte = carteDeTest();

            centrerSurLaCoordonnee(carte, BORDEAUX);

            expect([carte.getCenter().lat, carte.getCenter().lng]).toEqual([
                BORDEAUX.latitude,
                BORDEAUX.longitude,
            ]);
            expect(carte.getZoom()).toBe(12);
        });
    });

    describe('Étant donné une carte recadrée sur un trajet, puis vidée de ses points', () => {
        it('alors elle revient sur la France entière', () => {
            const carte = carteDeTest();
            recadrerSurLesPoints(carte, [point(1, PARIS), point(2, BORDEAUX)]);

            recadrerSurLesPoints(carte, []);

            expect(carte.getZoom()).toBe(VUE_FRANCE.zoom);
        });
    });
});
