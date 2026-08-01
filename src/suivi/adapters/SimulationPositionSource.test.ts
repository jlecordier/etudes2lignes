import { describe, expect, it } from 'vitest';
import { Coordonnee } from '../../trajets/domain/Coordonnee';
import type { SourceStatus } from '../domain/sourceStatus';
import { verifyPositionSourceContract } from './positionSourceContract';
import { SimulationPositionSource } from './SimulationPositionSource';

const poitiers = Coordonnee.create(46.5802, 0.3404);
const angouleme = Coordonnee.create(45.6484, 0.1562);

interface Subscription {
    readonly positions: Coordonnee[];
    readonly statuses: SourceStatus[];
}

function startAndCollect(source: SimulationPositionSource): Subscription {
    const positions: Coordonnee[] = [];
    const statuses: SourceStatus[] = [];
    source.start(
        (position) => positions.push(position),
        (status) => statuses.push(status),
    );
    return { positions, statuses };
}

verifyPositionSourceContract('SimulationPositionSource', () => {
    const source = new SimulationPositionSource();
    return {
        source,
        emitPosition: (position) => {
            source.simulate(position);
        },
        // Une simulation ne tient aucune ressource de plateforme : ni minuterie,
        // ni surveillance, ni abonnement au premier plan.
        heldResources: () => 0,
    };
});

describe('SimulationPositionSource', () => {
    describe('Étant donné une source démarrée, quand je simule une position', () => {
        it('alors elle est transmise immédiatement', () => {
            const source = new SimulationPositionSource();
            const subscription = startAndCollect(source);

            source.simulate(poitiers);

            expect(subscription.positions).toEqual([poitiers]);
        });
    });

    describe('Étant donné une source qui démarre sans position simulée', () => {
        it('alors elle annonce l’attente, comme le GPS réel : la ligne d’état ne garde pas le dernier message', () => {
            const source = new SimulationPositionSource();

            const subscription = startAndCollect(source);

            expect(subscription.statuses).toEqual([{ kind: 'attente' }]);
        });
    });

    describe('Étant donné une position déjà simulée, quand la source redémarre', () => {
        it('alors elle annonce l’attente puis rejoue la dernière position', () => {
            const source = new SimulationPositionSource();
            startAndCollect(source);
            source.simulate(angouleme);
            source.stop();

            const subscription = startAndCollect(source);

            expect(subscription.statuses).toEqual([{ kind: 'attente' }]);
            expect(subscription.positions).toEqual([angouleme]);
        });
    });

    describe('Étant donné une source arrêtée, quand je simule une position', () => {
        it('alors rien n’est transmis', () => {
            const source = new SimulationPositionSource();
            const subscription = startAndCollect(source);
            source.stop();

            source.simulate(poitiers);

            expect(subscription.positions).toEqual([]);
        });
    });

    describe('Étant donné une position simulée puis la source arrêtée', () => {
        it('alors la dernière position reste mémorisée, pour rouvrir la carte dessus', () => {
            const source = new SimulationPositionSource();
            startAndCollect(source);

            source.simulate(angouleme);
            source.stop();

            expect(source.lastPosition).toEqual(angouleme);
        });
    });
});
