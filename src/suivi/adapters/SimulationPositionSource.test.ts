import { describe, expect, it } from 'vitest';
import type { Subscription } from 'rxjs';
import { Coordonnee } from '../../trajets/domain/Coordonnee';
import type { SourceStatus } from '../domain/sourceStatus';
import type { SourceEvent } from '../ports/PositionSource';
import { verifyPositionSourceContract } from './positionSourceContract';
import { SimulationPositionSource } from './SimulationPositionSource';

const poitiers = Coordonnee.create(46.5802, 0.3404);
const angouleme = Coordonnee.create(45.6484, 0.1562);

interface Listener {
    readonly positions: Coordonnee[];
    readonly statuses: SourceStatus[];
    readonly subscription: Subscription;
}

function listen(source: SimulationPositionSource): Listener {
    const positions: Coordonnee[] = [];
    const statuses: SourceStatus[] = [];
    const subscription = source.events$.subscribe((event: SourceEvent) => {
        if (event.kind === 'position') {
            positions.push(event.position);
        } else {
            statuses.push(event.status);
        }
    });
    return { positions, statuses, subscription };
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
    describe('Étant donné une source écoutée, quand je simule une position', () => {
        it('alors elle est transmise immédiatement', () => {
            const source = new SimulationPositionSource();
            const listener = listen(source);

            source.simulate(poitiers);

            expect(listener.positions).toEqual([poitiers]);
        });
    });

    describe("Étant donné une source qu'on écoute sans position simulée", () => {
        it("alors elle annonce l'attente, comme le GPS réel : la ligne d'état ne garde pas le dernier message", () => {
            const source = new SimulationPositionSource();

            const listener = listen(source);

            expect(listener.statuses).toEqual([{ kind: 'attente' }]);
        });
    });

    describe('Étant donné une position déjà simulée, quand on se remet à écouter', () => {
        it("alors elle annonce l'attente puis rejoue la dernière position", () => {
            const source = new SimulationPositionSource();
            const first = listen(source);
            source.simulate(angouleme);
            first.subscription.unsubscribe();

            const second = listen(source);

            expect(second.statuses).toEqual([{ kind: 'attente' }]);
            expect(second.positions).toEqual([angouleme]);
        });
    });

    describe("Étant donné un abonné qui s'est retiré, quand je simule une position", () => {
        it('alors rien ne lui est transmis', () => {
            const source = new SimulationPositionSource();
            const listener = listen(source);
            listener.subscription.unsubscribe();

            source.simulate(poitiers);

            expect(listener.positions).toEqual([]);
        });
    });

    describe("Étant donné une position simulée puis l'abonné retiré", () => {
        it('alors la dernière position reste mémorisée, pour rouvrir la carte dessus', () => {
            const source = new SimulationPositionSource();
            const listener = listen(source);

            source.simulate(angouleme);
            listener.subscription.unsubscribe();

            expect(source.lastPosition).toEqual(angouleme);
        });
    });
});
