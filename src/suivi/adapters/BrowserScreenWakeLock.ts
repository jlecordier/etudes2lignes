import type { ScreenWakeLock } from '../ports/ScreenWakeLockPort';
import type { Foreground } from '../ports/Foreground';
import { BrowserForeground } from './BrowserForeground';

/** Un verrou d'écran obtenu. `WakeLockSentinel` s'y assigne. */
export interface WakeLockHandle {
    readonly released: boolean;
    release(): Promise<void>;
}

/** Le sous-ensemble de `navigator.wakeLock` dont l'adapter a besoin. */
export interface WakeLockProvider {
    /** `null` si l'appareil n'offre pas de verrou (iOS < 18.4, contexte non sécurisé). */
    demander(): Promise<WakeLockHandle | null>;
}

const browserWakeLock: WakeLockProvider = {
    demander: async () => {
        // navigator.wakeLock est typé comme toujours présent, mais n'existe pas
        // partout. On l'annote optionnel pour l'exprimer (Navigator s'y assigne
        // sans cast).
        const navigateur: { wakeLock?: WakeLock } = navigator;
        return (await navigateur.wakeLock?.request('screen')) ?? null;
    },
};

/**
 * Wake lock du navigateur : garde l'écran allumé pendant le suivi.
 *
 * Best effort assumé : sur iOS en PWA installée, l'API n'est fiable que
 * depuis iOS 18.4 — tout échec est avalé, l'appli fonctionne sans verrou.
 * Le verrou est libéré par le système quand la page est masquée : on le
 * redemande au retour au premier plan tant que `maintenir` est actif — via le
 * port `Foreground`, le seul endroit qui sache reconnaître ce retour.
 *
 * **Un seul verrou à la fois, et aucun orphelin.** Une demande de verrou est
 * lente, et deux courses menacent cette promesse — toutes deux réglées par la
 * mémoire de la demande en vol (`inFlightAcquisition`) :
 * - un même retour au premier plan déclenche plusieurs réveils (trois
 *   événements l'annoncent) : sans cette mémoire, chacun obtiendrait son verrou
 *   et un seul serait rangé — les autres garderaient l'écran allumé jusqu'à la
 *   fermeture de l'onglet, et se rallumeraient à chaque retour ;
 * - `relacher` peut passer pendant qu'une demande est en vol : il l'attend,
 *   sinon le verrou arriverait après lui et personne ne l'éteindrait.
 */
export class BrowserScreenWakeLock implements ScreenWakeLock {
    private readonly foreground: Foreground;
    private readonly provider: WakeLockProvider;
    private lock: WakeLockHandle | null = null;
    /** La demande en cours, partagée par tous ceux qui réclament en même temps. */
    private inFlightAcquisition: Promise<void> | null = null;
    /**
     * Non nul exactement entre `maintenir` et `relacher` : c'est à la fois la
     * poignée de désabonnement et la marque « le verrou est voulu ».
     */
    private unsubscribeFromForeground: (() => void) | null = null;

    constructor(dependencies?: { foreground?: Foreground; wakeLockProvider?: WakeLockProvider }) {
        this.foreground = dependencies?.foreground ?? new BrowserForeground();
        this.provider = dependencies?.wakeLockProvider ?? browserWakeLock;
    }

    async acquire(): Promise<void> {
        // Un second `maintenir` ne doit pas ouvrir un second abonnement.
        this.unsubscribeFromForeground ??= this.foreground.onReturnToForeground(() => {
            this.reacquireOnForeground();
        });
        await this.acquerir();
    }

    async release(): Promise<void> {
        this.unsubscribeFromForeground?.();
        this.unsubscribeFromForeground = null;
        // Une demande en vol se rangerait après nous, et l'écran resterait
        // allumé sans personne pour l'éteindre : on l'attend d'abord. Le test de
        // nullité est là pour le lint (`await-thenable`), pas pour la logique —
        // attendre `null` serait inoffensif.
        const inFlight = this.inFlightAcquisition;
        if (inFlight !== null) {
            await inFlight;
        }
        await this.releaseQuietly(this.lock);
        this.lock = null;
    }

    private reacquireOnForeground(): void {
        // Un réveil arrive parfois alors que la page est encore masquée :
        // redemander le verrou échouerait (l'API exige une page visible).
        if (this.unsubscribeFromForeground === null || !this.foreground.isInForeground()) {
            return;
        }
        // `acquerir` avale ses propres échecs : rien à rattraper ici.
        void this.acquerir();
    }

    private async acquerir(): Promise<void> {
        this.inFlightAcquisition ??= this.requestLock();
        try {
            await this.inFlightAcquisition;
        } finally {
            this.inFlightAcquisition = null;
        }
    }

    private async requestLock(): Promise<void> {
        if (this.lock !== null && !this.lock.released) {
            return;
        }
        let obtenu: WakeLockHandle | null;
        try {
            obtenu = await this.provider.demander();
        } catch {
            return;
        }
        // `null` — l'appareil n'accorde rien — se range comme le reste : on
        // n'arrive ici qu'avec un verrou déjà absent ou libéré, donc il n'y a
        // rien à écraser. Et un verrou arrivé après `relacher` n'a pas besoin de
        // garde non plus : `relacher` attend la demande en vol avant de libérer,
        // donc il trouve toujours ce qui vient d'être rangé.
        this.lock = obtenu;
    }

    private async releaseQuietly(lock: WakeLockHandle | null): Promise<void> {
        try {
            await lock?.release();
        } catch {
            // Déjà libéré par le système : rien à faire.
        }
    }
}
