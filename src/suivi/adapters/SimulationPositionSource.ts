import type { Coordonnee } from '../../trajets/domain/Coordonnee';
import type { SourceStatus } from '../domain/sourceStatus';
import type { PositionSimulator } from '../ports/PositionSimulator';

/**
 * Source de position simulée : rejoue la coordonnée choisie à la main.
 * C'est le mode test de l'application — un simple adapter de plus,
 * l'écran de suivi ne connaît que le port PositionSimulator.
 */
export class SimulationPositionSource implements PositionSimulator {
    private onPosition: ((position: Coordonnee) => void) | null = null;
    private lastSimulation: Coordonnee | null = null;

    start(
        onPosition: (position: Coordonnee) => void,
        onStatus: (status: SourceStatus) => void,
    ): void {
        this.onPosition = onPosition;
        // Le contrat du port vaut aussi en simulation : sans cette annonce, la
        // ligne d'état garderait le dernier état du GPS réel.
        onStatus({ kind: 'attente' });
        if (this.lastSimulation !== null) {
            onPosition(this.lastSimulation);
        }
    }

    stop(): void {
        this.onPosition = null;
    }

    simulate(position: Coordonnee): void {
        this.lastSimulation = position;
        this.onPosition?.(position);
    }

    get lastPosition(): Coordonnee | null {
        return this.lastSimulation;
    }
}
