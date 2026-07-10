import { describe, expect, it } from 'vitest';
import { NomDeTrajet } from './NomDeTrajet';

describe('NomDeTrajet', () => {
  describe('Étant donné un nom non vide', () => {
    it('alors le nom est créé', () => {
      expect(NomDeTrajet.creer('Paris → Bordeaux ERTMS').valeur).toBe('Paris → Bordeaux ERTMS');
    });
  });

  describe('Étant donné un nom entouré d’espaces', () => {
    it('alors les espaces superflus sont retirés', () => {
      expect(NomDeTrajet.creer('  Paris → Bordeaux  ').valeur).toBe('Paris → Bordeaux');
    });
  });

  describe('Étant donné un nom vide ou fait uniquement d’espaces', () => {
    it('alors la création est refusée', () => {
      expect(() => NomDeTrajet.creer('')).toThrow('Nom de trajet invalide');
      expect(() => NomDeTrajet.creer('   ')).toThrow('Nom de trajet invalide');
    });
  });
});
