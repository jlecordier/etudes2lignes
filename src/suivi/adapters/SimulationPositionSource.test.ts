import { describe, expect, it } from 'vitest';
import { Coordonnee } from '../../trajets/domain/Coordonnee';
import type { EtatDeLaSource } from '../domain/etatDeLaSource';
import { verifierLeContratDePositionSource } from './contratDePositionSource';
import { SimulationPositionSource } from './SimulationPositionSource';

const poitiers = Coordonnee.creer(46.5802, 0.3404);
const angouleme = Coordonnee.creer(45.6484, 0.1562);

interface Abonnement {
    readonly positions: Coordonnee[];
    readonly etats: EtatDeLaSource[];
}

function demarrerEtCollecter(source: SimulationPositionSource): Abonnement {
    const positions: Coordonnee[] = [];
    const etats: EtatDeLaSource[] = [];
    source.demarrer(
        (position) => positions.push(position),
        (etat) => etats.push(etat),
    );
    return { positions, etats };
}

verifierLeContratDePositionSource('SimulationPositionSource', () => {
    const source = new SimulationPositionSource();
    return {
        source,
        emettreUnePosition: (position) => {
            source.simuler(position);
        },
        // Une simulation ne tient aucune ressource de plateforme : ni minuterie,
        // ni surveillance, ni abonnement au premier plan.
        ressourcesTenues: () => 0,
    };
});

describe('SimulationPositionSource', () => {
    describe('Étant donné une source démarrée, quand je simule une position', () => {
        it('alors elle est transmise immédiatement', () => {
            const source = new SimulationPositionSource();
            const abonnement = demarrerEtCollecter(source);

            source.simuler(poitiers);

            expect(abonnement.positions).toEqual([poitiers]);
        });
    });

    describe('Étant donné une source qui démarre sans position simulée', () => {
        it('alors elle annonce l’attente, comme le GPS réel : la ligne d’état ne garde pas le dernier message', () => {
            const source = new SimulationPositionSource();

            const abonnement = demarrerEtCollecter(source);

            expect(abonnement.etats).toEqual([{ etat: 'attente' }]);
        });
    });

    describe('Étant donné une position déjà simulée, quand la source redémarre', () => {
        it('alors elle annonce l’attente puis rejoue la dernière position', () => {
            const source = new SimulationPositionSource();
            demarrerEtCollecter(source);
            source.simuler(angouleme);
            source.arreter();

            const abonnement = demarrerEtCollecter(source);

            expect(abonnement.etats).toEqual([{ etat: 'attente' }]);
            expect(abonnement.positions).toEqual([angouleme]);
        });
    });

    describe('Étant donné une source arrêtée, quand je simule une position', () => {
        it('alors rien n’est transmis', () => {
            const source = new SimulationPositionSource();
            const abonnement = demarrerEtCollecter(source);
            source.arreter();

            source.simuler(poitiers);

            expect(abonnement.positions).toEqual([]);
        });
    });

    describe('Étant donné une position simulée puis la source arrêtée', () => {
        it('alors la dernière position reste mémorisée, pour rouvrir la carte dessus', () => {
            const source = new SimulationPositionSource();
            demarrerEtCollecter(source);

            source.simuler(angouleme);
            source.arreter();

            expect(source.dernierePosition).toEqual(angouleme);
        });
    });
});
