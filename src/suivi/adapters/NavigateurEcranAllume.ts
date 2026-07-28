import type { EcranAllume } from '../ports/EcranAllumePort';

/**
 * Wake lock du navigateur : garde l'écran allumé pendant le suivi.
 *
 * Best effort assumé : sur iOS en PWA installée, l'API n'est fiable que
 * depuis iOS 18.4 — tout échec est avalé, l'appli fonctionne sans verrou.
 * Le verrou est libéré par le système quand la page est masquée : on le
 * redemande au retour au premier plan tant que `maintenir` est actif.
 */
export class NavigateurEcranAllume implements EcranAllume {
    private verrou: WakeLockSentinel | null = null;
    private actif = false;

    private readonly surVisibilite = (): void => {
        if (document.visibilityState === 'visible' && this.actif) {
            void this.acquerir();
        }
    };

    async maintenir(): Promise<void> {
        this.actif = true;
        document.addEventListener('visibilitychange', this.surVisibilite);
        await this.acquerir();
    }

    async relacher(): Promise<void> {
        this.actif = false;
        document.removeEventListener('visibilitychange', this.surVisibilite);
        try {
            await this.verrou?.release();
        } catch {
            // Déjà libéré par le système : rien à faire.
        }
        this.verrou = null;
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
