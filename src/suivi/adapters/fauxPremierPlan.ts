import type { PremierPlan } from '../ports/PremierPlan';

/**
 * Faux premier plan écrit à la main, pour les tests : la visibilité de la page
 * et ses réveils, pilotés à la main, sans navigateur ni jsdom.
 */
export class FauxPremierPlan implements PremierPlan {
    private prochainId = 1;
    private readonly abonnes = new Map<number, () => void>();
    private visible = true;

    surRetourAuPremierPlan(action: () => void): () => void {
        const id = this.prochainId++;
        this.abonnes.set(id, action);
        return () => {
            this.abonnes.delete(id);
        };
    }

    estAuPremierPlan(): boolean {
        return this.visible;
    }

    /** Combien d'abonnements l'abonné laisse ouverts. */
    abonnements(): number {
        return this.abonnes.size;
    }

    masquerLaPage(): void {
        this.visible = false;
    }

    revenirAuPremierPlan(): void {
        this.visible = true;
        this.emettreUnReveil();
    }

    /** Un réveil brut, sans supposer que la page soit redevenue visible. */
    emettreUnReveil(): void {
        for (const action of [...this.abonnes.values()]) {
            action();
        }
    }
}
