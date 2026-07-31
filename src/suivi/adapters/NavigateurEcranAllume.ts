import type { EcranAllume } from '../ports/EcranAllumePort';
import type { PremierPlan } from '../ports/PremierPlan';
import { NavigateurPremierPlan } from './NavigateurPremierPlan';

/** Un verrou d'écran obtenu. `WakeLockSentinel` s'y assigne. */
export interface VerrouDEcran {
    readonly released: boolean;
    release(): Promise<void>;
}

/** Le sous-ensemble de `navigator.wakeLock` dont l'adapter a besoin. */
export interface FournisseurDeVerrouDEcran {
    /** `null` si l'appareil n'offre pas de verrou (iOS < 18.4, contexte non sécurisé). */
    demander(): Promise<VerrouDEcran | null>;
}

const verrouDuNavigateur: FournisseurDeVerrouDEcran = {
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
 * port `PremierPlan`, le seul endroit qui sache reconnaître ce retour.
 *
 * **Un seul verrou à la fois, et aucun orphelin.** Une demande de verrou est
 * lente, et deux courses menacent cette promesse — toutes deux réglées par la
 * mémoire de la demande en vol (`acquisitionEnVol`) :
 * - un même retour au premier plan déclenche plusieurs réveils (trois
 *   événements l'annoncent) : sans cette mémoire, chacun obtiendrait son verrou
 *   et un seul serait rangé — les autres garderaient l'écran allumé jusqu'à la
 *   fermeture de l'onglet, et se rallumeraient à chaque retour ;
 * - `relacher` peut passer pendant qu'une demande est en vol : il l'attend,
 *   sinon le verrou arriverait après lui et personne ne l'éteindrait.
 */
export class NavigateurEcranAllume implements EcranAllume {
    private readonly premierPlan: PremierPlan;
    private readonly fournisseur: FournisseurDeVerrouDEcran;
    private verrou: VerrouDEcran | null = null;
    /** La demande en cours, partagée par tous ceux qui réclament en même temps. */
    private acquisitionEnVol: Promise<void> | null = null;
    /**
     * Non nul exactement entre `maintenir` et `relacher` : c'est à la fois la
     * poignée de désabonnement et la marque « le verrou est voulu ».
     */
    private seDesabonnerDuPremierPlan: (() => void) | null = null;

    constructor(dependances?: {
        premierPlan?: PremierPlan;
        fournisseurDeVerrou?: FournisseurDeVerrouDEcran;
    }) {
        this.premierPlan = dependances?.premierPlan ?? new NavigateurPremierPlan();
        this.fournisseur = dependances?.fournisseurDeVerrou ?? verrouDuNavigateur;
    }

    async maintenir(): Promise<void> {
        // Un second `maintenir` ne doit pas ouvrir un second abonnement.
        this.seDesabonnerDuPremierPlan ??= this.premierPlan.surRetourAuPremierPlan(() => {
            this.redemanderAuPremierPlan();
        });
        await this.acquerir();
    }

    async relacher(): Promise<void> {
        this.seDesabonnerDuPremierPlan?.();
        this.seDesabonnerDuPremierPlan = null;
        // Une demande en vol se rangerait après nous, et l'écran resterait
        // allumé sans personne pour l'éteindre : on l'attend d'abord.
        const enVol = this.acquisitionEnVol;
        if (enVol !== null) {
            await enVol;
        }
        await this.libererSansBruit(this.verrou);
        this.verrou = null;
    }

    private redemanderAuPremierPlan(): void {
        // Un réveil arrive parfois alors que la page est encore masquée :
        // redemander le verrou échouerait (l'API exige une page visible).
        if (this.seDesabonnerDuPremierPlan === null || !this.premierPlan.estAuPremierPlan()) {
            return;
        }
        // `acquerir` avale ses propres échecs : rien à rattraper ici.
        void this.acquerir();
    }

    private async acquerir(): Promise<void> {
        this.acquisitionEnVol ??= this.demanderLeVerrou();
        try {
            await this.acquisitionEnVol;
        } finally {
            this.acquisitionEnVol = null;
        }
    }

    private async demanderLeVerrou(): Promise<void> {
        if (this.verrou !== null && !this.verrou.released) {
            return;
        }
        let obtenu: VerrouDEcran | null;
        try {
            obtenu = await this.fournisseur.demander();
        } catch {
            return;
        }
        if (obtenu === null) {
            return;
        }
        // Un verrou arrivé après `relacher` n'aurait plus de propriétaire. Il ne
        // reste pourtant aucune garde ici : `relacher` attend la demande en vol
        // avant de libérer, donc il trouve toujours ce verrou rangé. Deux
        // protections pour un seul cas, c'en serait une jamais éprouvée.
        this.verrou = obtenu;
    }

    private async libererSansBruit(verrou: VerrouDEcran | null): Promise<void> {
        try {
            await verrou?.release();
        } catch {
            // Déjà libéré par le système : rien à faire.
        }
    }
}
