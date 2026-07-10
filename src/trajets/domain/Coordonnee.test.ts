import { describe, expect, it } from 'vitest';
import { Coordonnee } from './Coordonnee';

describe('Coordonnee', () => {
  describe('Étant donné une latitude et une longitude valides', () => {
    it('alors la coordonnée est créée avec ces valeurs', () => {
      const coordonnee = Coordonnee.creer(48.8412, 2.3208);

      expect(coordonnee.latitude).toBe(48.8412);
      expect(coordonnee.longitude).toBe(2.3208);
    });
  });

  describe('Étant donné une latitude hors de [-90, 90]', () => {
    it('alors la création est refusée', () => {
      expect(() => Coordonnee.creer(91, 0)).toThrow('Latitude invalide');
      expect(() => Coordonnee.creer(-90.1, 0)).toThrow('Latitude invalide');
    });
  });

  describe('Étant donné une longitude hors de [-180, 180]', () => {
    it('alors la création est refusée', () => {
      expect(() => Coordonnee.creer(0, 180.5)).toThrow('Longitude invalide');
      expect(() => Coordonnee.creer(0, -181)).toThrow('Longitude invalide');
    });
  });

  describe('Étant donné une latitude ou une longitude non finie', () => {
    it('alors la création est refusée', () => {
      expect(() => Coordonnee.creer(Number.NaN, 0)).toThrow('Latitude invalide');
      expect(() => Coordonnee.creer(0, Number.POSITIVE_INFINITY)).toThrow('Longitude invalide');
    });
  });

  describe('Étant donné deux coordonnées de mêmes valeurs', () => {
    it('alors elles sont égales', () => {
      const a = Coordonnee.creer(46.58, 0.34);
      const b = Coordonnee.creer(46.58, 0.34);

      expect(a.egale(b)).toBe(true);
    });
  });

  describe('Étant donné deux coordonnées de valeurs différentes', () => {
    it('alors elles ne sont pas égales', () => {
      const poitiers = Coordonnee.creer(46.58, 0.34);
      const angouleme = Coordonnee.creer(45.65, 0.16);

      expect(poitiers.egale(angouleme)).toBe(false);
    });
  });
});
