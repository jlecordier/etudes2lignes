import { describe, expect, it } from 'vitest';
import { Coordonnee } from '../../trajets/domain/Coordonnee';
import { SimulationPositionSource } from './SimulationPositionSource';

const poitiers = Coordonnee.creer(46.5802, 0.3404);
const angouleme = Coordonnee.creer(45.6484, 0.1562);

function demarrerEtCollecter(source: SimulationPositionSource): Coordonnee[] {
    const positionsRecues: Coordonnee[] = [];
    source.demarrer((position) => positionsRecues.push(position));
    return positionsRecues;
}

describe('SimulationPositionSource', () => {
    describe('Étant donné une source démarrée, quand je simule une position', () => {
        it('alors elle est transmise immédiatement', () => {
            const source = new SimulationPositionSource();
            const positionsRecues = demarrerEtCollecter(source);

            source.simuler(poitiers);

            expect(positionsRecues).toEqual([poitiers]);
        });
    });

    describe('Étant donné une position déjà simulée, quand la source redémarre', () => {
        it('alors la dernière position est rejouée', () => {
            const source = new SimulationPositionSource();
            demarrerEtCollecter(source);
            source.simuler(angouleme);
            source.arreter();

            const positionsRecues = demarrerEtCollecter(source);

            expect(positionsRecues).toEqual([angouleme]);
        });
    });

    describe('Étant donné une source arrêtée, quand je simule une position', () => {
        it('alors rien n’est transmis', () => {
            const source = new SimulationPositionSource();
            const positionsRecues = demarrerEtCollecter(source);
            source.arreter();

            source.simuler(poitiers);

            expect(positionsRecues).toEqual([]);
        });
    });
});
