import { describe, expect, it } from 'vitest';
import type { Subscription } from 'rxjs';
import { Coordonnee } from '../../trajets/domain/Coordonnee';
import type { SourceStatus } from '../domain/sourceStatus';
import type { PositionSource, SourceEvent } from '../ports/PositionSource';

/**
 * Le banc d'essai d'une source de position : la source, le moyen de faire
 * émettre une position par la plateforme qui l'alimente (GPS simulé, main de
 * l'utilisateur…), et le compte des ressources qu'elle tient encore.
 */
export interface SourceTestBed {
    readonly source: PositionSource;
    /** Fait émettre une position par la plateforme sous-jacente. */
    emitPosition(position: Coordonnee): void;
    /**
     * Les ressources que la source tient sur sa plateforme : surveillance
     * ouverte, minuterie, abonnement au premier plan. Le contrat exige qu'elles
     * retombent à zéro au désabonnement, et qu'un second abonné n'en accumule
     * pas d'orphelines.
     */
    heldResources(): number;
}

/** Ce qu'un abonné a entendu, trié par ce qu'il en fait. */
interface Listener {
    readonly positions: Coordonnee[];
    readonly statuses: SourceStatus[];
    readonly subscription: Subscription;
}

const poitiers = Coordonnee.create(46.5802, 0.3404);
const angouleme = Coordonnee.create(45.6484, 0.1562);

function listen(source: PositionSource): Listener {
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

function latitudes(positions: readonly Coordonnee[]): number[] {
    return positions.map((position) => position.latitude);
}

/**
 * La suite de contrat du port `PositionSource`, jouée contre chacun de ses
 * adapters : c'est elle qui les empêche de diverger à nouveau sur ce que
 * « démarrer » et « arrêter » veulent dire — désormais : s'abonner, et se
 * désabonner.
 */
export function verifyPositionSourceContract(
    nom: string,
    createTestBed: () => SourceTestBed,
): void {
    describe(`Contrat de PositionSource — ${nom}`, () => {
        describe("Étant donné une source que personne n'écoute", () => {
            it('alors elle ne tient rien : le flux est froid', () => {
                const testBed = createTestBed();

                expect(testBed.heldResources()).toBe(0);
            });
        });

        describe("Étant donné un abonné, quand aucune position n'est encore arrivée", () => {
            it("alors elle annonce l'attente, sous forme d'état du domaine et non de phrase", () => {
                const testBed = createTestBed();

                const listener = listen(testBed.source);

                expect(listener.statuses).toEqual([{ kind: 'attente' }]);
                expect(listener.positions).toEqual([]);
            });
        });

        describe('Étant donné un abonné qui se retire, quand la plateforme émet encore une position', () => {
            it("alors il n'entend plus rien et plus aucune ressource n'est tenue", () => {
                const testBed = createTestBed();
                const listener = listen(testBed.source);
                testBed.emitPosition(poitiers);

                listener.subscription.unsubscribe();
                testBed.emitPosition(angouleme);

                expect(latitudes(listener.positions)).toEqual([poitiers.latitude]);
                expect(listener.statuses).toEqual([{ kind: 'attente' }]);
                expect(testBed.heldResources()).toBe(0);
            });
        });

        describe("Étant donné une source qu'on se remet à écouter", () => {
            it('alors elle émet à nouveau', () => {
                const testBed = createTestBed();
                const first = listen(testBed.source);
                testBed.emitPosition(poitiers);
                first.subscription.unsubscribe();

                const second = listen(testBed.source);
                testBed.emitPosition(angouleme);

                expect(second.positions.at(-1)).toEqual(angouleme);
            });
        });

        describe('Étant donné deux abonnés en même temps', () => {
            it("alors chacun entend la position, sans que l'un prive l'autre", () => {
                const testBed = createTestBed();
                const first = listen(testBed.source);

                const second = listen(testBed.source);
                testBed.emitPosition(poitiers);

                expect(latitudes(first.positions)).toEqual([poitiers.latitude]);
                expect(latitudes(second.positions)).toEqual([poitiers.latitude]);
            });

            it("alors le départ de l'un ne coupe pas l'autre, et le dernier rend tout", () => {
                const testBed = createTestBed();
                const first = listen(testBed.source);
                const second = listen(testBed.source);

                first.subscription.unsubscribe();
                testBed.emitPosition(poitiers);
                second.subscription.unsubscribe();

                expect(latitudes(first.positions)).toEqual([]);
                expect(latitudes(second.positions)).toEqual([poitiers.latitude]);
                expect(testBed.heldResources()).toBe(0);
            });
        });
    });
}
