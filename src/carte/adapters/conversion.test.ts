// @vitest-environment jsdom
import * as L from 'leaflet';
import { describe, expect, it } from 'vitest';
import { Coordonnee } from '../../trajets/domain/Coordonnee';
import { toCoordonnee, toLatLng } from './conversion';

describe('Conversion entre Leaflet et le domaine', () => {
    describe('Étant donné un point Leaflet dans les bornes du globe', () => {
        it('alors la coordonnée du domaine reprend ses valeurs', () => {
            const coordonnee = toCoordonnee(L.latLng(46.5802, 0.3404));

            expect([coordonnee.latitude, coordonnee.longitude]).toEqual([46.5802, 0.3404]);
        });
    });

    describe('Étant donné un point Leaflet après un tour complet du monde', () => {
        it('alors sa longitude est ramenée dans [-180, 180]', () => {
            const coordonnee = toCoordonnee(L.latLng(46.5802, 0.3404 + 360));

            // Le ramené de Leaflet passe par un modulo : à un dix-milliardième
            // de degré près, soit moins d'un millimètre sur le terrain.
            expect(coordonnee.longitude).toBeCloseTo(0.3404, 9);
        });
    });

    describe("Étant donné un point Leaflet juste au-delà de l'antiméridien", () => {
        it("alors sa longitude repasse par l'autre bord du globe", () => {
            const coordonnee = toCoordonnee(L.latLng(0, 190));

            expect(coordonnee.longitude).toBe(-170);
        });
    });

    describe('Étant donné une coordonnée du domaine', () => {
        it('alors elle devient le couple [latitude, longitude] de Leaflet', () => {
            expect(toLatLng(Coordonnee.create(46.5802, 0.3404))).toEqual([46.5802, 0.3404]);
        });
    });

    describe('Étant donné une coordonnée du domaine transmise à Leaflet', () => {
        it("alors l'aller-retour la rend identique", () => {
            const start = Coordonnee.create(-33.8688, 151.2093);

            const roundTrip = toCoordonnee(L.latLng(toLatLng(start)));

            expect(roundTrip.equals(start)).toBe(true);
        });
    });
});
