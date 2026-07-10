import { describe, expect, it } from 'vitest';
import { texteDEtatDuSuivi } from './presentation';

describe('texteDEtatDuSuivi', () => {
  describe('Étant donné un trajet sans assez de points', () => {
    it('alors le texte invite à géo-référencer', () => {
      expect(texteDEtatDuSuivi({ etat: 'pas-assez-de-points' })).toContain('deux points');
    });
  });

  describe('Étant donné une position hors trajet', () => {
    it('alors le texte donne la distance en kilomètres arrondis', () => {
      expect(texteDEtatDuSuivi({ etat: 'hors-trajet', distanceMetres: 12_400 })).toBe(
        'Hors trajet (à 12 km de la ligne).',
      );
    });
  });

  describe('Étant donné une position sur le trajet', () => {
    it('alors aucun texte d’état n’est affiché', () => {
      expect(texteDEtatDuSuivi({ etat: 'sur-trajet', scrollCible: 100, indexSegment: 0 })).toBe('');
    });
  });
});
