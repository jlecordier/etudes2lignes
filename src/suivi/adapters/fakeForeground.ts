import type { Foreground } from '../ports/Foreground';

/**
 * Faux premier plan écrit à la main, pour les tests : la visibilité de la page
 * et ses réveils, pilotés à la main, sans navigateur ni jsdom.
 */
export class FakeForeground implements Foreground {
    private nextId = 1;
    private readonly subscribers = new Map<number, () => void>();
    private visible = true;

    onReturnToForeground(action: () => void): () => void {
        const id = this.nextId++;
        this.subscribers.set(id, action);
        return () => {
            this.subscribers.delete(id);
        };
    }

    isInForeground(): boolean {
        return this.visible;
    }

    /** Combien d'abonnements l'abonné laisse ouverts. */
    subscriptions(): number {
        return this.subscribers.size;
    }

    hidePage(): void {
        this.visible = false;
    }

    returnToForeground(): void {
        this.visible = true;
        this.emitWakeup();
    }

    /** Un réveil brut, sans supposer que la page soit redevenue visible. */
    emitWakeup(): void {
        for (const action of [...this.subscribers.values()]) {
            action();
        }
    }
}
