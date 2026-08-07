import { defer, exhaustMap, finalize, ignoreElements, merge, of, type Observable } from 'rxjs';
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
 * Ce qu'un maintien tient réellement : le verrou obtenu, et la dernière demande
 * faite à la plateforme.
 *
 * C'est le seul état qui doive **survivre d'un instant** au désabonnement. Une
 * demande partie juste avant lui livrerait sinon un verrou arrivé trop tard pour
 * que quiconque l'éteigne, et l'écran resterait allumé jusqu'à la fermeture de
 * l'onglet.
 *
 * `lastRequest` n'est pas remise à zéro une fois honorée, et n'a pas à l'être :
 * le rangement l'attend, et attendre une demande déjà servie ne coûte rien. Un
 * champ qu'on remettrait à `null` prétendrait distinguer deux cas dont rien ne
 * dépend.
 */
interface Holding {
    lock: WakeLockHandle | null;
    lastRequest: Promise<void> | null;
}

/**
 * Wake lock du navigateur : garde l'écran allumé pendant le suivi.
 *
 * Best effort assumé : sur iOS en PWA installée, l'API n'est fiable que
 * depuis iOS 18.4 — tout échec est avalé, l'appli fonctionne sans verrou.
 * Le verrou est libéré par le système quand la page est masquée : on le
 * redemande à chaque retour au premier plan, via le port `Foreground`, le seul
 * endroit qui sache reconnaître ce retour.
 *
 * **Un seul verrou à la fois, et aucun orphelin.** Une demande de verrou est
 * lente, et deux courses menacent cette promesse :
 * - un même retour au premier plan déclenche plusieurs réveils (trois
 *   événements l'annoncent) : `exhaustMap` laisse la demande en vol absorber
 *   ceux qui la suivent, là où chacun obtiendrait sinon son propre verrou dont
 *   un seul serait rangé ;
 * - le maintien peut cesser pendant qu'une demande est en vol : le rangement
 *   l'attend, sinon le verrou arriverait après lui.
 */
export class BrowserScreenWakeLock implements ScreenWakeLock {
    private readonly foreground: Foreground;
    private readonly provider: WakeLockProvider;

    /** Chaque abonnement tient son propre maintien, et le rend en partant. */
    readonly held$: Observable<never> = defer(() => this.hold());

    constructor(dependencies?: { foreground?: Foreground; wakeLockProvider?: WakeLockProvider }) {
        this.foreground = dependencies?.foreground ?? new BrowserForeground();
        this.provider = dependencies?.wakeLockProvider ?? browserWakeLock;
    }

    private hold(): Observable<never> {
        const holding: Holding = { lock: null, lastRequest: null };
        return merge(
            // Le verrou est demandé d'entrée, puis repris à chaque retour au
            // premier plan — le système le reprend dès que la page est masquée.
            of(undefined),
            this.foreground.returnToForeground$,
        ).pipe(
            exhaustMap(() => this.acquire(holding)),
            // Le flux ne dit rien à personne : il tient l'écran allumé.
            ignoreElements(),
            finalize(() => {
                void this.release(holding);
            }),
        );
    }

    private acquire(holding: Holding): Promise<void> {
        const request = this.requestLock(holding);
        holding.lastRequest = request;
        return request;
    }

    private async requestLock(holding: Holding): Promise<void> {
        if (holding.lock !== null && !holding.lock.released) {
            return;
        }
        try {
            // `null` — l'appareil n'accorde rien — se range comme le reste : on
            // n'arrive ici qu'avec un verrou déjà absent ou libéré.
            holding.lock = await this.provider.demander();
        } catch {
            // Best effort : l'appli marche sans verrou.
        }
    }

    private async release(holding: Holding): Promise<void> {
        // Une demande en vol se rangerait après nous, et l'écran resterait
        // allumé sans personne pour l'éteindre : on l'attend d'abord. Le test de
        // nullité est là pour le lint (`await-thenable`), pas pour la logique —
        // attendre `null` serait inoffensif.
        const lastRequest = holding.lastRequest;
        if (lastRequest !== null) {
            await lastRequest;
        }
        try {
            await holding.lock?.release();
        } catch {
            // Déjà libéré par le système : rien à faire.
        }
        holding.lock = null;
    }
}
