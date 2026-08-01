import { Coordonnee } from '../../trajets/domain/Coordonnee';
import type { SourceStatus } from '../domain/sourceStatus';
import { usableFix } from '../domain/precisionDuFix';
import type { PositionSource } from '../ports/PositionSource';
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

/** Planifie une action répétée ; rend la fonction d'annulation. */
export interface Scheduler {
    every(milliseconds: number, action: () => void): () => void;
}

const PERMISSION_DENIED_CODE = 1;
/** Au plus une position traitée par intervalle (ce que l'utilisateur a demandé). */
const INTERVAL_BETWEEN_POSITIONS_MS = 10_000;
/** Au-delà de ce silence, on prévient que la position affichée date. */
const SILENCE_BEFORE_ALERT_MS = 30_000;
const WATCHDOG_INTERVAL_MS = 15_000;
/** Deux réveils à moins de 5 s d'écart : le second ne redémarre pas le watch. */
const MINIMUM_DELAY_BETWEEN_RESTARTS_MS = 5_000;

const POSITION_OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 0 };

/**
 * Une session de surveillance : les rappels de l'appelant, les poignées à rendre
 * en partant, et les horodatages de **cette** session. Rien n'y survit à
 * `arreter` — sinon le premier fix d'une nouvelle session serait avalé par le
 * throttle de la session morte, et le chien de garde annoncerait un silence
 * hérité.
 */
interface ActiveWatch {
    readonly type: 'enCours';
    readonly onPosition: (position: Coordonnee) => void;
    readonly onStatus: (status: SourceStatus) => void;
    readonly cancelWatchdog: () => void;
    readonly unsubscribeFromForeground: () => void;
    watchId: number | null;
    lastHandledMs: number | null;
    lastFixMs: number | null;
    /** Dernier signe de vie du GPS, fixes trop imprécis compris. */
    lastSignalMs: number | null;
    lastImprecisionMetres: number | null;
    lastRestartMs: number | null;
    /**
     * La permission a été refusée. C'est le seul état dont l'utilisateur peut
     * lui-même sortir, et la consigne est la seule à lui dire comment : le chien
     * de garde ne doit pas la recouvrir d'une attente muette au bout de 15 s.
     * Remise à faux quand une nouvelle veille s'ouvre — la permission a
     * peut-être été accordée entre-temps.
     */
    permissionDenied: boolean;
}

type Watch = { readonly type: 'arretee' } | ActiveWatch;

/** Tout ce que la source emprunte à sa plateforme, remplaçable un par un. */
export interface GpsSourceDependencies {
    /** `null` dit « pas de géolocalisation sur cet appareil », que la source annonce. */
    geolocation?: GeolocationProvider | null;
    now?: () => number;
    scheduler?: Scheduler;
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

function systemNow(): number {
    return Date.now();
}

/**
 * Source de position branchée sur le GPS du navigateur.
 *
 * watchPosition (throttlé) plutôt que getCurrentPosition en boucle : pas de
 * chevauchement de requêtes et la puce GPS reste chaude. Au retour au premier
 * plan (page dégelée par iOS/Android), une position immédiate est demandée.
 *
 * L'adapter **mesure** (mètres, millisecondes) et laisse `presentation.ts`
 * rédiger : il n'écrit aucune phrase destinée à l'utilisateur.
 */
export class GeolocationPositionSource implements PositionSource {
    private readonly geolocation: GeolocationProvider | null;
    private readonly now: () => number;
    private readonly scheduler: Scheduler;
    private readonly foreground: Foreground;

    private watch: Watch = { type: 'arretee' };

    constructor({
        geolocation = browserGeolocation(),
        now = systemNow,
        scheduler = defaultScheduler,
        foreground = new BrowserForeground(),
    }: GpsSourceDependencies = {}) {
        this.geolocation = geolocation;
        this.now = now;
        this.scheduler = scheduler;
        this.foreground = foreground;
    }

    start(
        onPosition: (position: Coordonnee) => void,
        onStatus: (status: SourceStatus) => void,
    ): void {
        // Idempotent : une session déjà en cours est refermée d'un bloc, sinon sa
        // minuterie et sa surveillance tourneraient à vide pour toujours.
        this.stop();
        if (this.geolocation === null) {
            onStatus({ kind: 'indisponible' });
            return;
        }
        onStatus({ kind: 'attente' });
        const cancelWatchdog = this.scheduler.every(WATCHDOG_INTERVAL_MS, () => {
            this.checkForSilence();
        });
        const unsubscribeFromForeground = this.foreground.onReturnToForeground(() => {
            this.requestImmediatePosition();
        });
        const watch: ActiveWatch = {
            type: 'enCours',
            onPosition,
            onStatus,
            cancelWatchdog,
            unsubscribeFromForeground,
            watchId: null,
            lastHandledMs: null,
            lastFixMs: null,
            lastSignalMs: null,
            lastImprecisionMetres: null,
            lastRestartMs: null,
            // Valeur de forme : `openWatch` la repose juste après,
            // chaque veille neuve pouvant trouver la permission accordée.
            permissionDenied: false,
        };
        this.watch = watch;
        this.openWatch(watch);
    }

    stop(): void {
        const watch = this.watch;
        if (watch.type === 'arretee') {
            return;
        }
        // La session est abandonnée d'abord : un fix déjà en vol la trouvera
        // périmée et n'appellera plus les rappels de l'appelant.
        this.watch = { type: 'arretee' };
        this.closeWatch(watch);
        watch.cancelWatchdog();
        watch.unsubscribeFromForeground();
    }

    private openWatch(watch: ActiveWatch): void {
        if (this.geolocation === null) {
            return;
        }
        // Une veille neuve peut trouver la permission accordée entre-temps.
        watch.permissionDenied = false;
        watch.watchId = this.geolocation.watchPosition(
            (fix) => {
                this.handleFix(watch, fix);
            },
            (error) => {
                this.handleError(watch, error);
            },
            POSITION_OPTIONS,
        );
    }

    private closeWatch(watch: ActiveWatch): void {
        if (this.geolocation === null || watch.watchId === null) {
            return;
        }
        this.geolocation.clearWatch(watch.watchId);
        watch.watchId = null;
    }

    private handleFix(watch: ActiveWatch, fix: GeolocationPosition): void {
        if (this.watch !== watch) {
            return;
        }
        watch.lastSignalMs = this.now();
        if (!usableFix(fix.coords.accuracy)) {
            watch.lastImprecisionMetres = fix.coords.accuracy;
            this.reportImprecision(watch);
            return;
        }
        watch.lastFixMs = this.now();
        if (
            watch.lastHandledMs !== null &&
            this.now() - watch.lastHandledMs < INTERVAL_BETWEEN_POSITIONS_MS
        ) {
            return;
        }
        watch.lastHandledMs = this.now();
        watch.onPosition(Coordonnee.create(fix.coords.latitude, fix.coords.longitude));
    }

    private handleError(watch: ActiveWatch, error: GeolocationPositionError): void {
        if (this.watch !== watch) {
            return;
        }
        if (error.code === PERMISSION_DENIED_CODE) {
            watch.permissionDenied = true;
            watch.onStatus({ kind: 'permission-refusee' });
            return;
        }
        // Erreur passagère (indisponibilité, timeout) : le GPS réel en émet au
        // passage des tunnels. On ne s'alarme que si la dernière position date.
        this.checkForSilence();
    }

    private checkForSilence(): void {
        const watch = this.watch;
        if (watch.type === 'arretee' || watch.permissionDenied) {
            return;
        }
        if (this.isFresh(watch.lastFixMs)) {
            return;
        }
        // Le GPS répond mais trop imprécisément : le dire, plutôt que « perdu ».
        if (this.isFresh(watch.lastSignalMs)) {
            this.reportImprecision(watch);
            return;
        }
        this.reportSilence(watch);
    }

    private isFresh(instantMs: number | null): boolean {
        return instantMs !== null && this.now() - instantMs <= SILENCE_BEFORE_ALERT_MS;
    }

    private reportImprecision(watch: ActiveWatch): void {
        const imprecisionMetres = watch.lastImprecisionMetres;
        // Annoncer une imprécision inconnue reviendrait à en inventer une : le
        // rédacteur planche à 1 km, l'utilisateur lirait « ± 1 km » sans qu'aucun
        // fix imprécis ne soit jamais arrivé. On dit alors ce qu'on sait : le
        // silence.
        if (imprecisionMetres === null) {
            this.reportSilence(watch);
            return;
        }
        watch.onStatus({ kind: 'imprecise', imprecisionMetres });
    }

    private reportSilence(watch: ActiveWatch): void {
        if (watch.lastFixMs === null) {
            watch.onStatus({ kind: 'attente' });
            return;
        }
        watch.onStatus({
            kind: 'perdue',
            ageMs: this.now() - watch.lastFixMs,
        });
    }

    /**
     * La page vient d'être dégelée : la surveillance en cours peut être morte
     * (iOS gèle tout). On la redémarre — l'abonnement force un fix rapide —
     * et on lève le throttle pour traiter ce fix immédiatement.
     * Débouncé : des réveils en rafale (focus, alertes) relanceraient sans
     * cesse l'acquisition et dégraderaient la précision des fixes.
     */
    private requestImmediatePosition(): void {
        const watch = this.watch;
        if (watch.type === 'arretee') {
            return;
        }
        if (!this.foreground.isInForeground()) {
            return;
        }
        if (
            watch.lastRestartMs !== null &&
            this.now() - watch.lastRestartMs < MINIMUM_DELAY_BETWEEN_RESTARTS_MS
        ) {
            return;
        }
        watch.lastRestartMs = this.now();
        this.closeWatch(watch);
        watch.lastHandledMs = null;
        this.openWatch(watch);
    }
}

const defaultScheduler: Scheduler = {
    every(milliseconds, action) {
        const id = setInterval(action, milliseconds);
        return () => {
            clearInterval(id);
        };
    },
};
