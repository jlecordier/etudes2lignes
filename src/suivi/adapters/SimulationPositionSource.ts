import type { Coordonnee } from '../../trajets/domain/Coordonnee';
import type { EtatDeLaSource } from '../domain/etatDeLaSource';
import type { SimulateurDePosition } from '../ports/SimulateurDePosition';

/**
 * Source de position simulée : rejoue la coordonnée choisie à la main.
 * C'est le mode test de l'application — un simple adapter de plus,
 * l'écran de suivi ne connaît que le port SimulateurDePosition.
 */
export class SimulationPositionSource implements SimulateurDePosition {
    private surPosition: ((position: Coordonnee) => void) | null = null;
    private derniereSimulation: Coordonnee | null = null;

    demarrer(
        surPosition: (position: Coordonnee) => void,
        surEtat: (etat: EtatDeLaSource) => void,
    ): void {
        this.surPosition = surPosition;
        // Le contrat du port vaut aussi en simulation : sans cette annonce, la
        // ligne d'état garderait le dernier état du GPS réel.
        surEtat({ etat: 'attente' });
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
