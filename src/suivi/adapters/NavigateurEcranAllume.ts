import type { EcranAllume } from '../ports/EcranAllumePort';
import type { PremierPlan } from '../ports/PremierPlan';
import { NavigateurPremierPlan } from './NavigateurPremierPlan';

/**
 * Wake lock du navigateur : garde l'écran allumé pendant le suivi.
 *
 * Best effort assumé : sur iOS en PWA installée, l'API n'est fiable que
 * depuis iOS 18.4 — tout échec est avalé, l'appli fonctionne sans verrou.
 * Le verrou est libéré par le système quand la page est masquée : on le
 * redemande au retour au premier plan tant que `maintenir` est actif — via le
 * port `PremierPlan`, le seul endroit qui sache reconnaître ce retour.
 */
export class NavigateurEcranAllume implements EcranAllume {
    private readonly premierPlan: PremierPlan;
    private verrou: WakeLockSentinel | null = null;
    /**
     * Non nul exactement entre `maintenir` et `relacher` : c'est à la fois la
     * poignée de désabonnement et la marque « le verrou est voulu ».
     */
    private seDesabonnerDuPremierPlan: (() => void) | null = null;

    constructor(dependances?: { premierPlan?: PremierPlan }) {
        this.premierPlan = dependances?.premierPlan ?? new NavigateurPremierPlan();
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
        try {
            await this.verrou?.release();
        } catch {
            // Déjà libéré par le système : rien à faire.
        }
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
        // navigator.wakeLock est typé comme toujours présent, mais n'existe pas
        // partout (iOS < 18.4, contexte non sécurisé). On l'annote optionnel pour
        // l'exprimer (Navigator s'y assigne sans cast).
        const navigateur: { wakeLock?: WakeLock } = navigator;
        try {
            this.verrou = (await navigateur.wakeLock?.request('screen')) ?? null;
        } catch {
            this.verrou = null;
        }
    }
}
