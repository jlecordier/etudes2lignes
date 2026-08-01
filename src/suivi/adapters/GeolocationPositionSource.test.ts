import { describe, expect, it } from 'vitest';
import type { Coordonnee } from '../../trajets/domain/Coordonnee';
import type { SourceStatus } from '../domain/sourceStatus';
import { verifyPositionSourceContract } from './positionSourceContract';
import { FakeForeground } from './fakeForeground';
import {
    GeolocationPositionSource,
    type Scheduler,
    type GeolocationProvider,
} from './GeolocationPositionSource';

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
        this.lastRegisteredWatch?.error?.({
            code,
            message: '',
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
        });
    }

    emitError(code: number): void {
        for (const registeredWatch of [...this.registeredWatches.values()]) {
            registeredWatch.error?.({
                code,
                message: '',
                PERMISSION_DENIED: 1,
                POSITION_UNAVAILABLE: 2,
                TIMEOUT: 3,
            });
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

/** Scheduler battu à la main par le test. */
class ManualScheduler implements Scheduler {
    private nextId = 1;
    private readonly timers = new Map<number, () => void>();

    every(_milliseconds: number, action: () => void): () => void {
        const id = this.nextId++;
        this.timers.set(id, action);
        return () => {
            this.timers.delete(id);
        };
    }

    /** Combien de minuteries la source laisse tourner. */
    activeTimers(): number {
        return this.timers.size;
    }

    tick(): void {
        for (const action of [...this.timers.values()]) {
            action();
        }
    }
}

interface TestBed {
    geolocation: FakeGeolocation;
    scheduler: ManualScheduler;
    foreground: FakeForeground;
    advanceTime: (ms: number) => void;
    source: GeolocationPositionSource;
    positions: Coordonnee[];
    statuses: SourceStatus[];
}

function testBed(): TestBed {
    const { geolocation, scheduler, foreground, advanceTime, source } = unstartedSource();
    const positions: Coordonnee[] = [];
    const statuses: SourceStatus[] = [];
    source.start(
        (position) => positions.push(position),
        (status) => statuses.push(status),
    );
    return { geolocation, scheduler, foreground, advanceTime, source, positions, statuses };
}

function unstartedSource(): Omit<TestBed, 'positions' | 'statuses'> {
    const geolocation = new FakeGeolocation();
    const scheduler = new ManualScheduler();
    const foreground = new FakeForeground();
    let currentTime = 0;
    const source = new GeolocationPositionSource({
        geolocation,
        now: () => currentTime,
        scheduler,
        foreground,
    });
    return {
        geolocation,
        scheduler,
        foreground,
        advanceTime: (ms) => {
            currentTime += ms;
        },
        source,
    };
}

function latitudes(positions: readonly Coordonnee[]): number[] {
    return positions.map((position) => position.latitude);
}

verifyPositionSourceContract('GeolocationPositionSource', () => {
    const { geolocation, scheduler, foreground, advanceTime, source } = unstartedSource();
    return {
        source,
        emitPosition: (position) => {
            // Le throttle de la source est laissé de côté ici : le contrat parle
            // de démarrage et d'arrêt, pas de cadence.
            advanceTime(11_000);
            geolocation.emitFix(position.latitude, position.longitude);
        },
        heldResources: () =>
            geolocation.openWatches() + scheduler.activeTimers() + foreground.subscriptions(),
    };
});

describe('GeolocationPositionSource', () => {
    describe('Étant donné une permission refusée, quand le chien de garde bat plusieurs fois', () => {
        it('alors la consigne reste affichée : elle seule dit comment en sortir', () => {
            const { geolocation, scheduler, advanceTime, statuses } = testBed();

            geolocation.emitError(1);
            advanceTime(60_000);
            scheduler.tick();
            scheduler.tick();

            expect(statuses.at(-1)).toEqual({ kind: 'permission-refusee' });
        });
    });

    describe('Étant donné une source arrêtée puis redémarrée dans la seconde', () => {
        it('alors le premier fix de la nouvelle session est transmis : le throttle de la précédente ne le retient pas', () => {
            const { geolocation, source, advanceTime } = unstartedSource();
            const firstSession: Coordonnee[] = [];
            source.start(
                (position) => firstSession.push(position),
                () => undefined,
            );
            // Ce fix arme le throttle pour dix secondes.
            geolocation.emitFix(46.0, 0.3);
            source.stop();

            // Le geste réel : « Quitter la simulation » arrête puis redémarre la
            // source dans la même passe, bien avant la fin du throttle.
            advanceTime(1_000);
            const secondSession: Coordonnee[] = [];
            source.start(
                (position) => secondSession.push(position),
                () => undefined,
            );
            geolocation.emitFix(46.5, 0.4);

            expect(latitudes(firstSession)).toEqual([46.0]);
            expect(latitudes(secondSession)).toEqual([46.5]);
        });

        it('alors son chien de garde annonce l’attente, non un silence hérité de la session morte', () => {
            const { geolocation, scheduler, source, advanceTime } = unstartedSource();
            source.start(
                () => undefined,
                () => undefined,
            );
            geolocation.emitFix(46.0, 0.3);
            source.stop();
            // Le fix de la session morte est maintenant vieux de bien plus que
            // le silence toléré.
            advanceTime(60_000);

            const statuses: SourceStatus[] = [];
            source.start(
                () => undefined,
                (status) => statuses.push(status),
            );
            scheduler.tick();

            expect(statuses).toEqual([{ kind: 'attente' }, { kind: 'attente' }]);
        });
    });

    describe('Étant donné une position déjà acquise quand la surveillance est coupée', () => {
        it('alors ce fix en retard n’atteint plus l’écran', () => {
            const { geolocation, source, positions } = testBed();
            source.stop();

            // Le système livre au thread principal un fix acquis avant le
            // `clearWatch` : la session, elle, est morte.
            geolocation.emitLateFix(46.5, 0.4);

            expect(positions).toEqual([]);
        });

        it('alors une erreur en retard ne dit plus rien non plus', () => {
            const { geolocation, source, statuses } = testBed();
            source.stop();

            geolocation.emitLateError(1);

            expect(statuses).toEqual([{ kind: 'attente' }]);
        });
    });

    describe('Étant donné l’abonnement à la plateforme', () => {
        it('alors la source réclame la haute précision et refuse une position en cache', () => {
            const { geolocation } = testBed();

            // Une position en cache placerait la page ailleurs qu'où l'on est, et
            // sans haute précision le navigateur répondrait par le Wi-Fi.
            expect(geolocation.requestedOptions()).toEqual({
                enableHighAccuracy: true,
                maximumAge: 0,
            });
        });
    });

    describe('Étant donné un fix précis, quand il arrive', () => {
        it('alors la position est transmise', () => {
            const { geolocation, positions } = testBed();

            geolocation.emitFix(46.5802, 0.3404);

            expect(positions.map((p) => [p.latitude, p.longitude])).toEqual([[46.5802, 0.3404]]);
        });
    });

    describe('Étant donné un fix approximatif (800 m, positionnement cellulaire ou train)', () => {
        it('alors il est utilisé : mieux vaut une position approchée que « signal perdu »', () => {
            const { geolocation, positions } = testBed();

            geolocation.emitFix(46.58, 0.34, 800);

            expect(latitudes(positions)).toEqual([46.58]);
        });
    });

    describe('Étant donné un fix vraiment trop imprécis (5 km)', () => {
        it('alors il n’est pas transmis mais l’état mesure l’imprécision', () => {
            const { geolocation, positions, statuses } = testBed();

            geolocation.emitFix(46.58, 0.34, 5_000);

            expect(positions).toEqual([]);
            expect(statuses.at(-1)).toEqual({ kind: 'imprecise', imprecisionMetres: 5_000 });
        });

        it('alors le chien de garde parle d’imprécision, jamais de signal perdu', () => {
            const { geolocation, scheduler, advanceTime, statuses } = testBed();
            geolocation.emitFix(46.0, 0.1);
            advanceTime(60_000);
            geolocation.emitFix(46.01, 0.11, 8_000);
            advanceTime(10_000);

            scheduler.tick();

            expect(statuses.at(-1)).toEqual({ kind: 'imprecise', imprecisionMetres: 8_000 });
        });
    });

    describe('Étant donné des fixes rapprochés', () => {
        it('alors au plus une position toutes les 10 s est transmise', () => {
            const { geolocation, positions, advanceTime } = testBed();

            geolocation.emitFix(46.0, 0.1);
            advanceTime(3_000);
            geolocation.emitFix(46.1, 0.2);
            advanceTime(8_000);
            geolocation.emitFix(46.2, 0.3);

            expect(latitudes(positions)).toEqual([46.0, 46.2]);
        });
    });

    describe('Étant donné une permission refusée', () => {
        it('alors l’état dit que la permission est refusée', () => {
            const { geolocation, statuses } = testBed();

            geolocation.emitError(1);

            expect(statuses.at(-1)).toEqual({ kind: 'permission-refusee' });
        });
    });

    describe('Étant donné un appareil sans géolocalisation', () => {
        it('alors le démarrage annonce l’indisponibilité et rien n’est mis en place', () => {
            const foreground = new FakeForeground();
            const scheduler = new ManualScheduler();
            // Aucune géolocalisation injectée et aucune sur la plateforme de test :
            // exactement la situation d'un navigateur en contexte non sécurisé.
            const source = new GeolocationPositionSource({ foreground, scheduler });
            const statuses: SourceStatus[] = [];

            source.start(
                () => {
                    throw new Error('aucune position ne peut arriver');
                },
                (status) => statuses.push(status),
            );

            expect(statuses).toEqual([{ kind: 'indisponible' }]);
            expect(scheduler.activeTimers()).toBe(0);
            expect(foreground.subscriptions()).toBe(0);
        });
    });

    describe('Étant donné une erreur passagère (position indisponible)', () => {
        it('alors rien n’est signalé tant que le dernier fix est frais', () => {
            const { geolocation, advanceTime, statuses } = testBed();
            geolocation.emitFix(46.0, 0.1);
            advanceTime(2_000);

            geolocation.emitError(2);

            // Rien de plus que l'attente annoncée au démarrage.
            expect(statuses).toEqual([{ kind: 'attente' }]);
        });

        it('alors, après un long silence, l’état mesure l’ancienneté', () => {
            const { geolocation, advanceTime, statuses } = testBed();
            geolocation.emitFix(46.0, 0.1);
            advanceTime(120_000);

            geolocation.emitError(2);

            expect(statuses.at(-1)).toEqual({ kind: 'perdue', ageMs: 120_000 });
        });
    });

    describe('Étant donné un long silence du GPS', () => {
        it('alors, avant tout fix, le chien de garde signale l’attente', () => {
            const { scheduler, advanceTime, statuses } = testBed();

            advanceTime(60_000);
            scheduler.tick();

            expect(statuses.at(-1)).toEqual({ kind: 'attente' });
        });

        it('alors, après un fix, l’état mesure l’ancienneté de la dernière position', () => {
            const { geolocation, scheduler, advanceTime, statuses } = testBed();
            geolocation.emitFix(46.0, 0.1);

            advanceTime(120_000);
            scheduler.tick();

            expect(statuses.at(-1)).toEqual({ kind: 'perdue', ageMs: 120_000 });
        });

        it('alors un silence court ne déclenche rien', () => {
            const { geolocation, scheduler, advanceTime, statuses } = testBed();
            geolocation.emitFix(46.0, 0.1);

            advanceTime(10_000);
            scheduler.tick();

            expect(statuses).toEqual([{ kind: 'attente' }]);
        });
    });

    describe('Étant donné un fix vieux du silence toléré, à la milliseconde près', () => {
        it('alors il est encore frais : le chien de garde se taît', () => {
            const { geolocation, scheduler, advanceTime, statuses } = testBed();
            geolocation.emitFix(46.0, 0.3);

            advanceTime(30_000);
            scheduler.tick();

            expect(statuses).toEqual([{ kind: 'attente' }]);
        });

        it('alors une milliseconde de plus le rend périmé', () => {
            const { geolocation, scheduler, advanceTime, statuses } = testBed();
            geolocation.emitFix(46.0, 0.3);

            advanceTime(30_001);
            scheduler.tick();

            expect(statuses.at(-1)).toEqual({ kind: 'perdue', ageMs: 30_001 });
        });
    });

    describe('Étant donné une source arrêtée', () => {
        it('alors plus aucune position n’est transmise et rien ne tourne derrière', () => {
            const { geolocation, scheduler, foreground, source, positions } = testBed();
            geolocation.emitFix(46.0, 0.1);

            source.stop();
            geolocation.emitFix(46.2, 0.3);

            expect(latitudes(positions)).toEqual([46.0]);
            expect(geolocation.openWatches()).toBe(0);
            expect(scheduler.activeTimers()).toBe(0);
            expect(foreground.subscriptions()).toBe(0);
        });

        it('alors un fix déjà en vol au moment de l’arrêt est ignoré', () => {
            const { geolocation, source, positions, statuses } = testBed();
            geolocation.emitFix(46.0, 0.1);

            source.stop();
            geolocation.emitLateFix(46.9, 0.9);

            expect(latitudes(positions)).toEqual([46.0]);
            expect(statuses).toEqual([{ kind: 'attente' }]);
        });
    });

    describe('Étant donné un retour au premier plan', () => {
        it('alors la surveillance redémarre et le prochain fix passe sans attendre le throttle', () => {
            const { geolocation, foreground, positions, advanceTime } = testBed();
            geolocation.emitFix(46.0, 0.1);
            advanceTime(2_000);

            foreground.returnToForeground();
            geolocation.emitFix(46.5, 0.5);

            expect(latitudes(positions)).toEqual([46.0, 46.5]);
        });

        it('alors des retours en rafale ne redémarrent pas la surveillance à chaque fois', () => {
            const { geolocation, foreground, positions, advanceTime } = testBed();
            geolocation.emitFix(46.0, 0.1);
            advanceTime(2_000);

            foreground.returnToForeground();
            geolocation.emitFix(46.1, 0.2);
            advanceTime(2_000);
            // Second réveil 2 s plus tard : ignoré, le throttle n'est pas levé.
            foreground.returnToForeground();
            geolocation.emitFix(46.2, 0.3);

            expect(latitudes(positions)).toEqual([46.0, 46.1]);
        });

        it('alors un réveil reçu au terme exact du délai de garde redémarre bien', () => {
            const { geolocation, foreground, positions, advanceTime } = testBed();
            geolocation.emitFix(46.0, 0.1);
            advanceTime(2_000);
            foreground.returnToForeground();
            geolocation.emitFix(46.1, 0.2);

            // Pile le délai de garde après le réveil précédent : il est retombé,
            // celui-ci doit repartir. Sans quoi une PWA dégelée resterait jusqu'à
            // dix secondes sans recalage, alors que le train avance.
            advanceTime(5_000);
            foreground.returnToForeground();
            geolocation.emitFix(46.2, 0.3);

            expect(latitudes(positions)).toEqual([46.0, 46.1, 46.2]);
        });

        it('alors un réveil reçu page masquée ne redémarre rien : le throttle reste en place', () => {
            const { geolocation, foreground, positions, advanceTime } = testBed();
            geolocation.emitFix(46.0, 0.1);
            advanceTime(2_000);

            foreground.hidePage();
            foreground.emitWakeup();
            geolocation.emitFix(46.5, 0.5);

            expect(latitudes(positions)).toEqual([46.0]);
        });
    });

    describe('Étant donné une acquisition lente au démarrage (gare couverte)', () => {
        it('alors un premier fix qui met 25 s à arriver n’est pas tué par le throttle', () => {
            const { geolocation, advanceTime, positions } = testBed();

            advanceTime(25_000);
            geolocation.emitFix(46.0, 0.1);

            expect(latitudes(positions)).toEqual([46.0]);
        });
    });

    describe('Étant donné un voyage complet simulé dans un wagon', () => {
        it('alors la source raconte fidèlement le voyage : attente, vitres athermiques, tunnel, sortie', () => {
            const { geolocation, scheduler, advanceTime, positions, statuses } = testBed();

            // Départ en gare couverte : 15 s sans le moindre signal.
            advanceTime(15_000);
            scheduler.tick();

            // Premier fix 25 s après le départ : cellulaire, précis à 2 km
            // seulement (loin des 500 m d'un GPS de plein ciel) — utilisé.
            advanceTime(10_000);
            geolocation.emitFix(48.72, 2.26, 2_000);

            // Pleine voie derrière des vitres athermiques : un fix par 2 s,
            // jamais mieux que 1,8 km. Le throttle n'en traite qu'un par 10 s.
            const latitudesBehindTheGlass = [
                48.71, 48.7, 48.69, 48.68, 48.67, 48.66, 48.65, 48.64, 48.63, 48.62,
            ];
            for (const latitude of latitudesBehindTheGlass) {
                advanceTime(2_000);
                geolocation.emitFix(latitude, 2.26, 1_800);
            }

            // Tunnel : une erreur passagère puis plus rien pendant deux minutes.
            advanceTime(1_000);
            geolocation.emitError(2);
            advanceTime(14_000);
            scheduler.tick();
            advanceTime(30_000);
            scheduler.tick();
            advanceTime(75_000);
            scheduler.tick();

            // Sortie de tunnel : le GPS de plein ciel revient, précis à 30 m.
            advanceTime(5_000);
            geolocation.emitFix(48.5, 2.2, 30);
            advanceTime(10_000);
            scheduler.tick();

            // Les positions traitées : la première, puis une par tranche de
            // 10 s pendant les vitres athermiques, puis la sortie de tunnel.
            expect(latitudes(positions)).toEqual([48.72, 48.67, 48.62, 48.5]);
            // Et le récit exact des états mesurés, dans l'ordre, rien de plus :
            // le retour du signal éteint l'alerte (aucun état après la sortie).
            // C'est `sourceStatusText` qui les met en phrases, pas la source.
            expect(statuses).toEqual([
                { kind: 'attente' },
                { kind: 'attente' },
                { kind: 'perdue', ageMs: 45_000 },
                { kind: 'perdue', ageMs: 120_000 },
            ]);
        });
    });
});
