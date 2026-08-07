import {
    EMPTY,
    Observable,
    concat,
    concatMap,
    defer,
    filter,
    map,
    merge,
    of,
    share,
    startWith,
    switchMap,
    throttleTime,
    timer,
    withLatestFrom,
} from 'rxjs';
import { Coordonnee } from '../../trajets/domain/Coordonnee';
import { usableFix } from '../domain/precisionDuFix';
import {
    positionEvent,
    statusEvent,
    type PositionSource,
    type SourceEvent,
} from '../ports/PositionSource';
import type { Foreground } from '../ports/Foreground';
import { BrowserForeground } from './BrowserForeground';

/** Le sous-ensemble de navigator.geolocation dont l'adapter a besoin. */
export interface GeolocationProvider {
    watchPosition(
        success: PositionCallback,
        error?: PositionErrorCallback | null,
        options?: PositionOptions,
    ): number;
    clearWatch(id: number): void;
}

const PERMISSION_DENIED_CODE = 1;
/** Au plus une position traitée par intervalle (ce que l'utilisateur a demandé). */
const INTERVAL_BETWEEN_POSITIONS_MS = 10_000;
/** Au-delà de ce silence, on prévient que la position affichée date. */
const SILENCE_BEFORE_ALERT_MS = 30_000;
const WATCHDOG_INTERVAL_MS = 15_000;
/** Deux réveils à moins de 5 s d'écart : le second ne rouvre pas la surveillance. */
const MINIMUM_DELAY_BETWEEN_RESTARTS_MS = 5_000;

const POSITION_OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 0 };

/** Ce que la plateforme livre : un fix, ou une erreur. */
type PlatformSignal =
    | { readonly kind: 'fix'; readonly fix: GeolocationPosition }
    | { readonly kind: 'error'; readonly code: number };

/** Tout ce que la source emprunte à sa plateforme, remplaçable un par un. */
export interface GpsSourceDependencies {
    /** `null` dit « pas de géolocalisation sur cet appareil », que la source annonce. */
    geolocation?: GeolocationProvider | null;
    foreground?: Foreground;
}

/**
 * `navigator.geolocation` est typé comme toujours présent, mais absent en
 * contexte non sécurisé ou sur de vieux navigateurs. On l'annote optionnel pour
 * l'exprimer honnêtement (`Navigator` s'y assigne sans cast).
 */
function browserGeolocation(): GeolocationProvider | null {
    const navigateur: { geolocation?: Geolocation } = navigator;
    return navigateur.geolocation ?? null;
}

/**
 * Une surveillance ouverte sur la plateforme, le temps d'un abonnement : le
 * `clearWatch` est le rangement de l'`Observable`, et non une poignée à ne pas
 * oublier de rendre. Un fix déjà en vol quand elle se referme n'atteint plus
 * personne — RxJS ignore ce qui arrive après le désabonnement.
 */
function watchPlatform(geolocation: GeolocationProvider): Observable<PlatformSignal> {
    return new Observable<PlatformSignal>((subscriber) => {
        const watchId = geolocation.watchPosition(
            (fix) => {
                subscriber.next({ kind: 'fix', fix });
            },
            (error) => {
                subscriber.next({ kind: 'error', code: error.code });
            },
            POSITION_OPTIONS,
        );
        return () => {
            geolocation.clearWatch(watchId);
        };
    });
}

function toCoordonnee(fix: GeolocationPosition): Coordonnee {
    return Coordonnee.create(fix.coords.latitude, fix.coords.longitude);
}

/**
 * Source de position branchée sur le GPS du navigateur.
 *
 * watchPosition (throttlé) plutôt que getCurrentPosition en boucle : pas de
 * chevauchement de requêtes et la puce GPS reste chaude. Au retour au premier
 * plan (page dégelée par iOS/Android), la surveillance est rouverte, ce qui
 * force une position immédiate.
 *
 * L'adapter **mesure** (mètres, millisecondes) et laisse `presentation.ts`
 * rédiger : il n'écrit aucune phrase destinée à l'utilisateur.
 *
 * Tout le temps de cette source est porté par ses flux : plus d'horloge
 * injectée, plus d'horodatages retranchés les uns des autres, et plus de
 * session à refermer à la main — c'était six champs mutables
 * ([ADR 0009](../../../docs/adr/0009-flux-du-temps-en-rxjs.md)).
 */
export class GeolocationPositionSource implements PositionSource {
    private readonly geolocation: GeolocationProvider | null;
    private readonly foreground: Foreground;

    /** Chaque abonnement ouvre sa propre session, montée à la souscription. */
    readonly events$: Observable<SourceEvent> = defer(() => this.session());

    constructor({
        geolocation = browserGeolocation(),
        foreground = new BrowserForeground(),
    }: GpsSourceDependencies = {}) {
        this.geolocation = geolocation;
        this.foreground = foreground;
    }

    private session(): Observable<SourceEvent> {
        const geolocation = this.geolocation;
        if (geolocation === null) {
            return of(statusEvent({ kind: 'indisponible' }));
        }

        // Un retour au premier plan rouvre la surveillance : celle en cours peut
        // être morte (iOS gèle tout), et une neuve force un fix rapide. Pas deux
        // fois de suite pour autant — des réveils en rafale (focus, alertes)
        // relanceraient sans cesse l'acquisition et dégraderaient les fixes.
        const restarts$ = this.foreground.returnToForeground$.pipe(
            throttleTime(MINIMUM_DELAY_BETWEEN_RESTARTS_MS),
            share(),
        );

        // Les signaux de la plateforme pour toute la session, quelle que soit la
        // surveillance qui les livre : un réveil change de surveillance, pas de
        // session. L'âge d'une position ne repart donc pas de zéro sous prétexte
        // qu'on a rouvert l'œil.
        const signals$ = restarts$.pipe(
            startWith(undefined),
            switchMap(() => watchPlatform(geolocation)),
            share(),
        );

        const fixes$ = signals$.pipe(
            concatMap((signal) => (signal.kind === 'fix' ? of(signal.fix) : EMPTY)),
            share(),
        );

        // Un fix trop grossier ne cale pas la page, mais il prouve que le GPS
        // parle : les deux moitiés servent, et pas au même endroit.
        const preciseFixes$ = fixes$.pipe(
            concatMap((fix) => (usableFix(fix.coords.accuracy) ? of(fix) : EMPTY)),
            share(),
        );
        const imprecisions$ = fixes$.pipe(
            concatMap((fix) => (usableFix(fix.coords.accuracy) ? EMPTY : of(fix.coords.accuracy))),
            share(),
        );

        const permissionDenied$ = signals$.pipe(
            concatMap((signal) =>
                signal.kind === 'error' && signal.code === PERMISSION_DENIED_CODE ?
                    of(statusEvent({ kind: 'permission-refusee' }))
                :   EMPTY,
            ),
            share(),
        );

        // Au plus une position par intervalle — mais le compteur repart à chaque
        // réveil, sans quoi une PWA dégelée resterait jusqu'à dix secondes sans
        // se recaler, alors que le train avance. C'est le `switchMap` qui le
        // remet à zéro : l'opérateur naît et meurt avec la surveillance.
        const positions$ = restarts$.pipe(
            startWith(undefined),
            switchMap(() => preciseFixes$.pipe(throttleTime(INTERVAL_BETWEEN_POSITIONS_MS))),
            map((fix) => positionEvent(toCoordonnee(fix))),
        );

        return merge(
            positions$,
            imprecisions$.pipe(
                map((imprecisionMetres) => statusEvent({ kind: 'imprecise', imprecisionMetres })),
            ),
            permissionDenied$,
            this.watchdog(preciseFixes$, imprecisions$, permissionDenied$, restarts$),
        ).pipe(
            // Le contrat le veut avant toute position : la source dit qu'elle
            // cherche, dès qu'on l'écoute.
            startWith(statusEvent({ kind: 'attente' })),
        );
    }

    /**
     * Le chien de garde : ce que la source annonce quand elle n'a plus rien à
     * annoncer.
     *
     * Le silence se compte tout seul — un compteur relancé à chaque fix
     * exploitable, muet le temps du silence toléré, puis battant à sa cadence.
     * **L'âge annoncé est celui que ce compteur a lui-même mesuré**, et non la
     * différence de deux horodatages relevés à deux moments différents.
     *
     * Les erreurs passagères (tunnels) ne le déclenchent plus : elles ne
     * disaient rien qu'il ne sache déjà, puisqu'on ne s'alarme jamais que d'un
     * silence, et jamais d'une erreur.
     */
    private watchdog(
        preciseFixes$: Observable<GeolocationPosition>,
        imprecisions$: Observable<number>,
        permissionDenied$: Observable<SourceEvent>,
        restarts$: Observable<unknown>,
    ): Observable<SourceEvent> {
        const silence$ = preciseFixes$.pipe(
            map(() => true),
            startWith(false),
            switchMap((everFixed) =>
                timer(SILENCE_BEFORE_ALERT_MS, WATCHDOG_INTERVAL_MS).pipe(
                    map((beat) => ({
                        everFixed,
                        ageMs: SILENCE_BEFORE_ALERT_MS + beat * WATCHDOG_INTERVAL_MS,
                    })),
                ),
            ),
        );

        // L'imprécision du dernier fix grossier, tant qu'elle est fraîche. Passé
        // le silence toléré elle ne dit plus rien de l'instant : annoncer
        // « ± 1 km » sur la foi d'un fix vieux d'une minute reviendrait à
        // l'inventer, et on dit alors ce qu'on sait — le silence.
        const freshImprecision$ = imprecisions$.pipe(
            switchMap((imprecisionMetres) =>
                concat(of(imprecisionMetres), timer(SILENCE_BEFORE_ALERT_MS).pipe(map(() => null))),
            ),
            startWith(null),
        );

        // La consigne « autorisez la géolocalisation » est le seul état dont
        // l'utilisateur puisse lui-même sortir, et la seule à lui dire comment :
        // le chien de garde ne doit pas la recouvrir d'une attente muette. Il se
        // tait jusqu'à la surveillance suivante, qui peut trouver la permission
        // accordée entre-temps.
        // Annoté, et pas seulement déduit : sans le type, `false` pourrait
        // devenir n'importe quelle valeur fausse sans que rien s'en aperçoive.
        const denied$: Observable<boolean> = merge(
            permissionDenied$.pipe(map(() => true)),
            restarts$.pipe(map(() => false)),
        ).pipe(startWith(false));

        return silence$.pipe(
            withLatestFrom(freshImprecision$, denied$),
            filter(([, , denied]) => !denied),
            map(([{ everFixed, ageMs }, imprecisionMetres]) => {
                // Le GPS répond, mais trop grossièrement pour caler la page : le
                // dire, plutôt que « signal perdu ».
                if (imprecisionMetres !== null) {
                    return statusEvent({ kind: 'imprecise', imprecisionMetres });
                }
                return statusEvent(everFixed ? { kind: 'perdue', ageMs } : { kind: 'attente' });
            }),
        );
    }
}
