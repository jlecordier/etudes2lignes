import { describe, expect, it } from 'vitest';
import { Coordonnee } from '../../trajets/domain/Coordonnee';
import type { SourceStatus } from '../domain/sourceStatus';
import type { PositionSource } from '../ports/PositionSource';

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
     * retombent à zéro après `arreter` et qu'un second `demarrer` n'en
     * accumule pas.
     */
    heldResources(): number;
}

interface Subscription {
    readonly positions: Coordonnee[];
    readonly statuses: SourceStatus[];
}

const poitiers = Coordonnee.create(46.5802, 0.3404);
const angouleme = Coordonnee.create(45.6484, 0.1562);

function start(source: PositionSource): Subscription {
    const positions: Coordonnee[] = [];
    const statuses: SourceStatus[] = [];
    source.start(
        (position) => positions.push(position),
        (kind) => statuses.push(kind),
    );
    return { positions, statuses };
}

function latitudes(positions: readonly Coordonnee[]): number[] {
    return positions.map((position) => position.latitude);
}

/**
 * La suite de contrat du port `PositionSource`, jouée contre chacun de ses
 * adapters : c'est elle qui les empêche de diverger à nouveau sur ce que « démarrer »
 * et « arrêter » veulent dire.
 */
export function verifyPositionSourceContract(
    nom: string,
    createTestBed: () => SourceTestBed,
): void {
    describe(`Contrat de PositionSource — ${nom}`, () => {
        describe('Étant donné une source qui démarre, quand aucune position n’est encore arrivée', () => {
            it('alors elle annonce l’attente, sous forme d’état du domaine et non de phrase', () => {
                const testBed = createTestBed();

                const subscription = start(testBed.source);

                expect(subscription.statuses).toEqual([{ kind: 'attente' }]);
                expect(subscription.positions).toEqual([]);
            });
        });

        describe('Étant donné une source démarrée puis arrêtée, quand la plateforme émet encore une position', () => {
            it('alors aucun rappel n’est reçu et plus aucune ressource n’est tenue', () => {
                const testBed = createTestBed();
                const subscription = start(testBed.source);
                testBed.emitPosition(poitiers);

                testBed.source.stop();
                testBed.emitPosition(angouleme);

                expect(latitudes(subscription.positions)).toEqual([poitiers.latitude]);
                expect(subscription.statuses).toEqual([{ kind: 'attente' }]);
                expect(testBed.heldResources()).toBe(0);
            });
        });

        describe('Étant donné une source arrêtée, quand je la redémarre', () => {
            it('alors elle émet à nouveau', () => {
                const testBed = createTestBed();
                start(testBed.source);
                testBed.emitPosition(poitiers);
                testBed.source.stop();

                const subscription = start(testBed.source);
                testBed.emitPosition(angouleme);

                expect(subscription.positions.at(-1)).toEqual(angouleme);
            });
        });

        describe('Étant donné une source déjà démarrée, quand je la démarre une seconde fois', () => {
            it('alors la position n’arrive qu’une fois, au dernier abonné, et rien ne s’accumule', () => {
                const testBed = createTestBed();
                const first = start(testBed.source);
                const resourcesForOneSession = testBed.heldResources();

                const second = start(testBed.source);
                testBed.emitPosition(poitiers);

                expect(latitudes(first.positions)).toEqual([]);
                expect(latitudes(second.positions)).toEqual([poitiers.latitude]);
                expect(testBed.heldResources()).toBe(resourcesForOneSession);
            });

            it('alors un seul « arrêter » suffit à tout couper : aucune session fantôme ne survit', () => {
                const testBed = createTestBed();
                const first = start(testBed.source);
                const second = start(testBed.source);

                testBed.source.stop();
                testBed.emitPosition(poitiers);

                expect(latitudes(first.positions)).toEqual([]);
                expect(latitudes(second.positions)).toEqual([]);
                expect(testBed.heldResources()).toBe(0);
            });
        });
    });
}
