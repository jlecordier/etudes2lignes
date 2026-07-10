import type { Coordonnee } from '../../trajets/domain/Coordonnee';
import type { PositionSource } from '../ports/PositionSource';

/**
 * Source de position simulée : rejoue la coordonnée choisie à la main.
 * C'est le mode test de l'application — un simple adapter de plus du port
 * PositionSource, l'écran de suivi ne fait aucune différence.
 */
export class SimulationPositionSource implements PositionSource {
  private surPosition: ((position: Coordonnee) => void) | null = null;
  private derniereSimulation: Coordonnee | null = null;

  demarrer(
    surPosition: (position: Coordonnee) => void,
    _surErreur?: (message: string) => void,
  ): void {
    this.surPosition = surPosition;
    if (this.derniereSimulation !== null) {
      surPosition(this.derniereSimulation);
    }
  }

  arreter(): void {
    this.surPosition = null;
  }

  simuler(position: Coordonnee): void {
    this.derniereSimulation = position;
    this.surPosition?.(position);
  }

  get dernierePosition(): Coordonnee | null {
    return this.derniereSimulation;
  }
}
