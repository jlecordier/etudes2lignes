import { describe, expect, it } from 'vitest';
import { coordonneeFromInputs } from './saisieDeCoordonnee';

describe('Saisie manuelle d’une coordonnée', () => {
    describe('Étant donné deux nombres valides', () => {
        it('alors la coordonnée est formée', () => {
            const coordonnee = coordonneeFromInputs('48.8566', '2.3522');

            expect(coordonnee?.latitude).toBe(48.8566);
            expect(coordonnee?.longitude).toBe(2.3522);
        });
    });

    describe('Étant donné une longitude négative', () => {
        it('alors elle est acceptée telle quelle', () => {
            const coordonnee = coordonneeFromInputs('44.8378', '-0.5792');

            expect(coordonnee?.longitude).toBe(-0.5792);
        });
    });

    describe('Étant donné les deux champs vides, comme à l’ouverture de la carte', () => {
        it('alors il n’y a pas de coordonnée, et surtout pas d’exception', () => {
            expect(coordonneeFromInputs('', '')).toBeNull();
        });
    });

    describe('Étant donné une seule des deux valeurs', () => {
        it('alors il n’y a pas de coordonnée', () => {
            expect(coordonneeFromInputs('48.8566', '')).toBeNull();
            expect(coordonneeFromInputs('', '2.3522')).toBeNull();
        });
    });

    describe('Étant donné du texte à la place d’un nombre', () => {
        it('alors il n’y a pas de coordonnée', () => {
            expect(coordonneeFromInputs('nord', 'est')).toBeNull();
        });
    });

    describe('Étant donné un nombre hors du globe', () => {
        it('alors il n’y a pas de coordonnée', () => {
            expect(coordonneeFromInputs('200', '2.3522')).toBeNull();
            expect(coordonneeFromInputs('48.8566', '500')).toBeNull();
        });
    });

    describe('Étant donné une valeur infinie', () => {
        it('alors il n’y a pas de coordonnée', () => {
            expect(coordonneeFromInputs('Infinity', '2.3522')).toBeNull();
        });
    });
});
