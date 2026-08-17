import { describe, expect, it } from 'vitest';
import { TestScheduler } from 'rxjs/testing';
import { Coordonnee } from '../../trajets/domain/Coordonnee';
import type { SourceStatus } from '../domain/sourceStatus';
import { positionEvent, statusEvent, type SourceEvent } from '../ports/PositionSource';
import { verifyPositionSourceContract } from './positionSourceContract';
import { FakeForeground } from './fakeForeground';
import { GeolocationPositionSource, type GeolocationProvider } from './GeolocationPositionSource';

interface RegisteredWatch {
    readonly success: PositionCallback;
    readonly error: PositionErrorCallback | null;
}

/** Géolocalisation simulée, pilotée à la main par le test. */
class FakeGeolocation implements GeolocationProvider {
    private nextId = 1;
    private readonly registeredWatches = new Map<number, RegisteredWatch>();
    /**
     * La dernière veille enregistrée, gardée même après `clearWatch` : elle sert
     * à simuler un fix déjà en vol au moment où la surveillance est coupée.
     */
    private lastRegisteredWatch: RegisteredWatch | null = null;

    private lastOptions: PositionOptions | null = null;

    watchPosition(
        success: PositionCallback,
        error?: PositionErrorCallback | null,
        options?: PositionOptions,
    ): number {
        const id = this.nextId++;
        const registeredWatch: RegisteredWatch = { success, error: error ?? null };
        this.registeredWatches.set(id, registeredWatch);
        this.lastRegisteredWatch = registeredWatch;
        this.lastOptions = options ?? null;
        return id;
    }

    /** Ce que la source a demandé à la plateforme en s'abonnant. */
    requestedOptions(): PositionOptions | null {
        return this.lastOptions;
    }

    clearWatch(id: number): void {
        this.registeredWatches.delete(id);
    }

    /** Combien de surveillances la source laisse ouvertes. */
    openWatches(): number {
        return this.registeredWatches.size;
    }

    /** Combien de fois la plateforme a été mise sous surveillance en tout. */
    totalWatches(): number {
        return this.nextId - 1;
    }

    emitFix(latitude: number, longitude: number, precision = 10): void {
        for (const registeredWatch of [...this.registeredWatches.values()]) {
            registeredWatch.success(fix(latitude, longitude, precision));
        }
    }

    /**
     * Un fix déjà acquis quand la surveillance est coupée : le système le livre
     * quand même au thread principal, après le `clearWatch`.
     */
    emitLateFix(latitude: number, longitude: number): void {
        this.lastRegisteredWatch?.success(fix(latitude, longitude, 10));
    }

    /** Une erreur livrée elle aussi après la coupure de la surveillance. */
    emitLateError(code: number): void {
        this.lastRegisteredWatch?.error?.(positionError(code));
    }

    emitError(code: number): void {
        for (const registeredWatch of [...this.registeredWatches.values()]) {
            registeredWatch.error?.(positionError(code));
        }
    }
}

function fix(latitude: number, longitude: number, accuracy: number): GeolocationPosition {
    return {
        coords: {
            latitude,
            longitude,
            accuracy,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
            toJSON: () => ({}),
        },
        timestamp: 0,
        toJSON: () => ({}),
    };
}

function positionError(code: number): GeolocationPositionError {
    return {
        code,
        message: '',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
    };
}

interface TestBed {
    geolocation: FakeGeolocation;
    foreground: FakeForeground;
    source: GeolocationPositionSource;
}

function unstartedSource(): TestBed {
    const geolocation = new FakeGeolocation();
    const foreground = new FakeForeground();
    return {
        geolocation,
        foreground,
        source: new GeolocationPositionSource({ geolocation, foreground }),
    };
}

/**
 * Un geste de la plateforme ou de l'utilisateur, posé à un instant du temps
 * virtuel. C'est ce que le scénario écrit, et le seul moyen d'agir : il n'y a
 * plus d'horloge à avancer à la main, le temps est celui des flux.
 */
interface Geste {
    readonly at: number;
    readonly fait: () => void;
}

/**
 * Joue un scénario en temps virtuel et rend ce que la source a raconté.
 *
 * Le temps ne s'avance plus indépendamment des minuteries — les deux sont le
 * même temps, celui du `TestScheduler`, ce qui rapproche le test du réel : on
 * ne peut plus battre le chien de garde sans que l'horloge bouge.
 */
function raconte(gestes: readonly Geste[], jusqua: number, testBed: TestBed): SourceEvent[] {
    const scheduler = new TestScheduler((actual, expected) => {
        expect(actual).toEqual(expected);
    });
    const events: SourceEvent[] = [];
    scheduler.run(({ flush }) => {
        const subscription = testBed.source.events$.subscribe((event) => {
            events.push(event);
        });
        for (const { at, fait } of gestes) {
            scheduler.schedule(fait, at);
        }
        scheduler.schedule(() => {
            subscription.unsubscribe();
        }, jusqua);
        flush();
    });
    return events;
}

function positions(events: readonly SourceEvent[]): number[] {
    return events.flatMap((event) => (event.kind === 'position' ? [event.position.latitude] : []));
}

function statuses(events: readonly SourceEvent[]): SourceStatus[] {
    return events.flatMap((event) => (event.kind === 'status' ? [event.status] : []));
}

verifyPositionSourceContract('GeolocationPositionSource', () => {
    const { geolocation, foreground, source } = unstartedSource();
    return {
        source,
        emitPosition: (position) => {
            geolocation.emitFix(position.latitude, position.longitude);
        },
        heldResources: () => geolocation.openWatches() + foreground.subscriptions(),
    };
});

describe('GeolocationPositionSource', () => {
    describe('Étant donné l’abonnement à la plateforme', () => {
        it('alors la source réclame la haute précision et refuse une position en cache', () => {
            const testBed = unstartedSource();

            raconte([], 1_000, testBed);

            // Une position en cache placerait la page ailleurs qu'où l'on est, et
            // sans haute précision le navigateur répondrait par le Wi-Fi.
            expect(testBed.geolocation.requestedOptions()).toEqual({
                enableHighAccuracy: true,
                maximumAge: 0,
            });
        });
    });

    describe('Étant donné un fix précis, quand il arrive', () => {
        it('alors la position est transmise', () => {
            const testBed = unstartedSource();

            const events = raconte(
                [{ at: 1_000, fait: () => testBed.geolocation.emitFix(46.5802, 0.3404) }],
                5_000,
                testBed,
            );

            expect(events).toEqual([
                statusEvent({ kind: 'attente' }),
                positionEvent(Coordonnee.create(46.5802, 0.3404)),
            ]);
        });
    });

    describe('Étant donné un fix approximatif (800 m, positionnement cellulaire ou train)', () => {
        it('alors il est utilisé : mieux vaut une position approchée que « signal perdu »', () => {
            const testBed = unstartedSource();

            const events = raconte(
                [{ at: 1_000, fait: () => testBed.geolocation.emitFix(46.58, 0.34, 800) }],
                5_000,
                testBed,
            );

            expect(positions(events)).toEqual([46.58]);
        });
    });

    describe('Étant donné un fix vraiment trop imprécis (5 km)', () => {
        it('alors il n’est pas transmis mais l’état mesure l’imprécision', () => {
            const testBed = unstartedSource();

            const events = raconte(
                [{ at: 1_000, fait: () => testBed.geolocation.emitFix(46.58, 0.34, 5_000) }],
                5_000,
                testBed,
            );

            expect(positions(events)).toEqual([]);
            expect(statuses(events).at(-1)).toEqual({
                kind: 'imprecise',
                imprecisionMetres: 5_000,
                position: Coordonnee.create(46.58, 0.34),
            });
        });

        it('alors la coordonnée du fix grossier survit : elle ne cale pas la page, mais elle situe', () => {
            const testBed = unstartedSource();

            const events = raconte(
                [{ at: 1_000, fait: () => testBed.geolocation.emitFix(45.0, 1.5, 4_000) }],
                5_000,
                testBed,
            );

            const dernier = statuses(events).at(-1);
            expect(dernier?.kind).toBe('imprecise');
            expect(dernier).toEqual({
                kind: 'imprecise',
                imprecisionMetres: 4_000,
                position: Coordonnee.create(45.0, 1.5),
            });
        });

        it('alors le chien de garde parle d’imprécision, jamais de signal perdu', () => {
            const testBed = unstartedSource();

            // Un fix exploitable, puis plus que du grossier : le GPS parle
            // toujours, et c'est ce qu'il faut dire.
            const events = raconte(
                [
                    { at: 1_000, fait: () => testBed.geolocation.emitFix(46.0, 0.1) },
                    { at: 20_000, fait: () => testBed.geolocation.emitFix(46.01, 0.11, 8_000) },
                ],
                40_000,
                testBed,
            );

            expect(statuses(events).at(-1)).toEqual({
                kind: 'imprecise',
                imprecisionMetres: 8_000,
                position: Coordonnee.create(46.01, 0.11),
            });
        });

        it('alors une imprécision périmée ne s’invente plus : c’est le silence qu’on annonce', () => {
            const testBed = unstartedSource();

            // Le fix grossier est vieux de plus que le silence toléré quand le
            // chien de garde parle : annoncer « ± 8 km » sur sa foi reviendrait à
            // décrire un instant qui n'existe plus.
            const events = raconte(
                [
                    { at: 1_000, fait: () => testBed.geolocation.emitFix(46.0, 0.1) },
                    { at: 2_000, fait: () => testBed.geolocation.emitFix(46.01, 0.11, 8_000) },
                ],
                70_000,
                testBed,
            );

            expect(statuses(events).at(-1)).toEqual({ kind: 'perdue', ageMs: 60_000 });
        });
    });

    describe('Étant donné des fixes rapprochés', () => {
        it('alors au plus une position toutes les 10 s est transmise', () => {
            const testBed = unstartedSource();

            const events = raconte(
                [
                    { at: 1_000, fait: () => testBed.geolocation.emitFix(46.0, 0.1) },
                    { at: 4_000, fait: () => testBed.geolocation.emitFix(46.1, 0.2) },
                    { at: 12_000, fait: () => testBed.geolocation.emitFix(46.2, 0.3) },
                ],
                20_000,
                testBed,
            );

            expect(positions(events)).toEqual([46.0, 46.2]);
        });
    });

    describe('Étant donné une acquisition lente au démarrage (gare couverte)', () => {
        it('alors un premier fix qui met 25 s à arriver n’est pas tué par le throttle', () => {
            const testBed = unstartedSource();

            const events = raconte(
                [{ at: 25_000, fait: () => testBed.geolocation.emitFix(46.0, 0.1) }],
                28_000,
                testBed,
            );

            expect(positions(events)).toEqual([46.0]);
        });
    });

    describe('Étant donné une permission refusée', () => {
        it('alors l’état dit que la permission est refusée', () => {
            const testBed = unstartedSource();

            const events = raconte(
                [{ at: 1_000, fait: () => testBed.geolocation.emitError(1) }],
                5_000,
                testBed,
            );

            expect(statuses(events).at(-1)).toEqual({ kind: 'permission-refusee' });
        });

        it('alors la consigne reste affichée : elle seule dit comment en sortir', () => {
            const testBed = unstartedSource();

            // Le chien de garde bat plusieurs fois pendant ce temps : il ne doit
            // pas recouvrir la consigne d'une attente muette.
            const events = raconte(
                [{ at: 1_000, fait: () => testBed.geolocation.emitError(1) }],
                90_000,
                testBed,
            );

            expect(statuses(events)).toEqual([{ kind: 'attente' }, { kind: 'permission-refusee' }]);
        });

        it('alors une surveillance neuve le remet en cause : la permission a pu être accordée', () => {
            const testBed = unstartedSource();

            const events = raconte(
                [
                    { at: 1_000, fait: () => testBed.geolocation.emitError(1) },
                    // Retour au premier plan : la surveillance est rouverte, et
                    // le chien de garde retrouve la voix.
                    { at: 10_000, fait: () => testBed.foreground.returnToForeground() },
                ],
                60_000,
                testBed,
            );

            expect(statuses(events).at(-1)).toEqual({ kind: 'attente' });
        });
    });

    describe('Étant donné un appareil sans géolocalisation', () => {
        it('alors l’écoute annonce l’indisponibilité et rien n’est mis en place', () => {
            const foreground = new FakeForeground();
            // Aucune géolocalisation injectée et aucune sur la plateforme de test :
            // exactement la situation d'un navigateur en contexte non sécurisé.
            const source = new GeolocationPositionSource({ geolocation: null, foreground });
            const events: SourceEvent[] = [];

            source.events$.subscribe((event) => events.push(event));

            expect(events).toEqual([statusEvent({ kind: 'indisponible' })]);
            expect(foreground.subscriptions()).toBe(0);
        });
    });

    describe('Étant donné une erreur passagère (position indisponible)', () => {
        it('alors rien n’est signalé tant que le dernier fix est frais', () => {
            const testBed = unstartedSource();

            const events = raconte(
                [
                    { at: 1_000, fait: () => testBed.geolocation.emitFix(46.0, 0.1) },
                    { at: 3_000, fait: () => testBed.geolocation.emitError(2) },
                ],
                20_000,
                testBed,
            );

            // Rien de plus que l'attente annoncée au démarrage : une erreur
            // passagère (tunnel) ne dit rien qu'un silence ne dirait mieux.
            expect(statuses(events)).toEqual([{ kind: 'attente' }]);
        });

        it('alors c’est le silence qui finit par parler, et il mesure l’ancienneté', () => {
            const testBed = unstartedSource();

            const events = raconte(
                [
                    { at: 1_000, fait: () => testBed.geolocation.emitFix(46.0, 0.1) },
                    { at: 3_000, fait: () => testBed.geolocation.emitError(2) },
                ],
                50_000,
                testBed,
            );

            expect(statuses(events).at(-1)).toEqual({ kind: 'perdue', ageMs: 45_000 });
        });
    });

    describe('Étant donné un long silence du GPS', () => {
        it('alors, avant tout fix, le chien de garde signale l’attente', () => {
            const testBed = unstartedSource();

            const events = raconte([], 50_000, testBed);

            // L'attente du démarrage, puis celle que le chien de garde répète :
            // aucune position n'a jamais été obtenue, il n'y a pas d'âge à dire.
            expect(statuses(events)).toEqual([
                { kind: 'attente' },
                { kind: 'attente' },
                { kind: 'attente' },
            ]);
        });

        it('alors, après un fix, l’état mesure l’ancienneté de la dernière position', () => {
            const testBed = unstartedSource();

            const events = raconte(
                [{ at: 1_000, fait: () => testBed.geolocation.emitFix(46.0, 0.1) }],
                80_000,
                testBed,
            );

            // Le compteur repart du fix : 30 s de silence toléré, puis un
            // battement toutes les 15 s, et l'âge est celui qu'il a compté.
            expect(statuses(events)).toEqual([
                { kind: 'attente' },
                { kind: 'perdue', ageMs: 30_000 },
                { kind: 'perdue', ageMs: 45_000 },
                { kind: 'perdue', ageMs: 60_000 },
                { kind: 'perdue', ageMs: 75_000 },
            ]);
        });

        it('alors un silence plus court que le délai toléré ne déclenche rien', () => {
            const testBed = unstartedSource();

            const events = raconte(
                [{ at: 1_000, fait: () => testBed.geolocation.emitFix(46.0, 0.1) }],
                30_000,
                testBed,
            );

            expect(statuses(events)).toEqual([{ kind: 'attente' }]);
        });

        it('alors chaque fix repousse l’alerte : un GPS bavard ne dit jamais « perdue »', () => {
            const testBed = unstartedSource();

            const events = raconte(
                [
                    { at: 1_000, fait: () => testBed.geolocation.emitFix(46.0, 0.1) },
                    { at: 25_000, fait: () => testBed.geolocation.emitFix(46.1, 0.2) },
                    { at: 50_000, fait: () => testBed.geolocation.emitFix(46.2, 0.3) },
                ],
                75_000,
                testBed,
            );

            expect(statuses(events)).toEqual([{ kind: 'attente' }]);
        });
    });

    describe('Étant donné un abonné qui se retire alors qu’un fix est déjà en vol', () => {
        it('alors ce fix en retard n’atteint plus l’écran', () => {
            const { geolocation, foreground, source } = unstartedSource();
            const events: SourceEvent[] = [];
            const subscription = source.events$.subscribe((event) => events.push(event));
            geolocation.emitFix(46.0, 0.1);

            subscription.unsubscribe();
            // Le système livre au thread principal un fix acquis avant le
            // `clearWatch` : plus personne ne l'écoute.
            geolocation.emitLateFix(46.9, 0.9);
            geolocation.emitLateError(1);

            expect(positions(events)).toEqual([46.0]);
            expect(statuses(events)).toEqual([{ kind: 'attente' }]);
            expect(geolocation.openWatches()).toBe(0);
            expect(foreground.subscriptions()).toBe(0);
        });
    });

    describe('Étant donné un retour au premier plan', () => {
        it('alors la surveillance est rouverte et le prochain fix passe sans attendre le throttle', () => {
            const testBed = unstartedSource();

            const events = raconte(
                [
                    { at: 1_000, fait: () => testBed.geolocation.emitFix(46.0, 0.1) },
                    { at: 3_000, fait: () => testBed.foreground.returnToForeground() },
                    { at: 4_000, fait: () => testBed.geolocation.emitFix(46.5, 0.5) },
                ],
                10_000,
                testBed,
            );

            expect(positions(events)).toEqual([46.0, 46.5]);
            // Une surveillance neuve, et l'ancienne refermée : pas deux ouvertes.
            expect(testBed.geolocation.totalWatches()).toBe(2);
            expect(testBed.geolocation.openWatches()).toBe(0);
        });

        it('alors des retours en rafale ne rouvrent pas la surveillance à chaque fois', () => {
            const testBed = unstartedSource();

            const events = raconte(
                [
                    { at: 1_000, fait: () => testBed.geolocation.emitFix(46.0, 0.1) },
                    { at: 3_000, fait: () => testBed.foreground.returnToForeground() },
                    { at: 4_000, fait: () => testBed.geolocation.emitFix(46.1, 0.2) },
                    // Second réveil 2 s plus tard : ignoré, le throttle tient.
                    { at: 5_000, fait: () => testBed.foreground.returnToForeground() },
                    { at: 6_000, fait: () => testBed.geolocation.emitFix(46.2, 0.3) },
                ],
                10_000,
                testBed,
            );

            expect(positions(events)).toEqual([46.0, 46.1]);
            expect(testBed.geolocation.totalWatches()).toBe(2);
        });

        it('alors un réveil passé le délai de garde rouvre bien', () => {
            const testBed = unstartedSource();

            // Le délai de garde est retombé quand ce réveil arrive : il doit
            // repartir. Sans quoi une PWA dégelée resterait jusqu'à dix secondes
            // sans recalage, alors que le train avance.
            const events = raconte(
                [
                    { at: 1_000, fait: () => testBed.geolocation.emitFix(46.0, 0.1) },
                    { at: 3_000, fait: () => testBed.foreground.returnToForeground() },
                    { at: 4_000, fait: () => testBed.geolocation.emitFix(46.1, 0.2) },
                    { at: 9_000, fait: () => testBed.foreground.returnToForeground() },
                    { at: 10_000, fait: () => testBed.geolocation.emitFix(46.2, 0.3) },
                ],
                15_000,
                testBed,
            );

            expect(positions(events)).toEqual([46.0, 46.1, 46.2]);
            expect(testBed.geolocation.totalWatches()).toBe(3);
        });

        it('alors un réveil reçu page masquée ne rouvre rien : le throttle reste en place', () => {
            const testBed = unstartedSource();

            const events = raconte(
                [
                    { at: 1_000, fait: () => testBed.geolocation.emitFix(46.0, 0.1) },
                    { at: 2_000, fait: () => testBed.foreground.hidePage() },
                    { at: 3_000, fait: () => testBed.foreground.emitWakeup() },
                    { at: 4_000, fait: () => testBed.geolocation.emitFix(46.5, 0.5) },
                ],
                10_000,
                testBed,
            );

            expect(positions(events)).toEqual([46.0]);
            expect(testBed.geolocation.totalWatches()).toBe(1);
        });
    });

    describe('Étant donné un voyage complet simulé dans un wagon', () => {
        it('alors la source raconte fidèlement le voyage : attente, vitres athermiques, tunnel, sortie', () => {
            const testBed = unstartedSource();
            const { geolocation } = testBed;
            const gestes: Geste[] = [
                // Premier fix 25 s après le départ en gare couverte : cellulaire,
                // précis à 2 km seulement — utilisé quand même.
                { at: 25_000, fait: () => geolocation.emitFix(48.72, 2.26, 2_000) },
            ];
            // Pleine voie derrière des vitres athermiques : un fix par 2 s, jamais
            // mieux que 1,8 km. Le throttle n'en traite qu'un par 10 s.
            const latitudesBehindTheGlass = [
                48.71, 48.7, 48.69, 48.68, 48.67, 48.66, 48.65, 48.64, 48.63, 48.62, 48.61, 48.6,
            ];
            latitudesBehindTheGlass.forEach((latitude, index) => {
                gestes.push({
                    at: 26_000 + index * 2_000,
                    fait: () => geolocation.emitFix(latitude, 2.26, 1_800),
                });
            });
            // Tunnel : une erreur passagère à 50 s, puis plus rien pendant deux
            // minutes. Sortie de tunnel : le GPS de plein ciel revient à 170 s.
            gestes.push({ at: 50_000, fait: () => geolocation.emitError(2) });
            gestes.push({ at: 170_000, fait: () => geolocation.emitFix(48.5, 2.2, 30) });

            const events = raconte(gestes, 190_000, testBed);

            // Les positions traitées : la première, puis une par tranche de 10 s
            // pendant les vitres athermiques, puis la sortie de tunnel.
            expect(positions(events)).toEqual([48.72, 48.66, 48.6, 48.5]);
            // Et le récit exact des états mesurés : l'attente du départ, puis le
            // silence du tunnel qui s'allonge de 15 s en 15 s à partir du dernier
            // fix reçu (celui de 48 s), et plus rien après la sortie : le retour
            // du signal éteint l'alerte. C'est `sourceStatusText` qui les met en
            // phrases, pas la source.
            expect(statuses(events)).toEqual([
                { kind: 'attente' },
                { kind: 'perdue', ageMs: 30_000 },
                { kind: 'perdue', ageMs: 45_000 },
                { kind: 'perdue', ageMs: 60_000 },
                { kind: 'perdue', ageMs: 75_000 },
                { kind: 'perdue', ageMs: 90_000 },
                { kind: 'perdue', ageMs: 105_000 },
                { kind: 'perdue', ageMs: 120_000 },
            ]);
        });
    });
});
