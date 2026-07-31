import type { PremierPlan } from '../ports/PremierPlan';

/**
 * Le seul endroit du projet qui sache reconnaître un retour au premier plan.
 *
 * Trois événements, parce qu'aucun ne suffit seul : `visibilitychange` manque le
 * retour d'un onglet déjà visible, `pageshow` est le seul émis quand iOS ressort
 * la page de son cache de navigation, et `focus` rattrape le retour après une
 * alerte système. Le même réveil en déclenche donc souvent plusieurs — l'abonné
 * est prévenu par le contrat du port.
 */
export class NavigateurPremierPlan implements PremierPlan {
    surRetourAuPremierPlan(action: () => void): () => void {
        const reagir = (): void => {
            action();
        };
        document.addEventListener('visibilitychange', reagir);
        window.addEventListener('pageshow', reagir);
        window.addEventListener('focus', reagir);
        return () => {
            document.removeEventListener('visibilitychange', reagir);
            window.removeEventListener('pageshow', reagir);
            window.removeEventListener('focus', reagir);
        };
    }

    estAuPremierPlan(): boolean {
        return document.visibilityState === 'visible';
    }
}
