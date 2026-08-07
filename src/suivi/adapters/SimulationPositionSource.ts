import { ReplaySubject, map, startWith, type Observable } from 'rxjs';
import type { Coordonnee } from '../../trajets/domain/Coordonnee';
import { positionEvent, statusEvent, type SourceEvent } from '../ports/PositionSource';
import type { PositionSimulator } from '../ports/PositionSimulator';

/**
 * Source de position simulée : rejoue la coordonnée choisie à la main.
 * C'est le mode test de l'application — un simple adapter de plus,
 * l'écran de suivi ne connaît que le port PositionSimulator.
 *
 * Un `ReplaySubject` de taille 1 dit exactement ce que le port demande : le
 * dernier choix est rejoué à qui se remet à écouter — et rien n'est rejoué tant
 * qu'aucun choix n'a été fait. C'était la mémoire tenue à la main.
 */
export class SimulationPositionSource implements PositionSimulator {
    private readonly simulations = new ReplaySubject<Coordonnee>(1);
    private lastSimulation: Coordonnee | null = null;

    /**
     * Le contrat du port vaut aussi en simulation : sans l'attente annoncée
     * d'entrée, la ligne d'état garderait le dernier état du GPS réel.
     */
    readonly events$: Observable<SourceEvent> = this.simulations.pipe(
        map(positionEvent),
        startWith(statusEvent({ kind: 'attente' })),
    );

    simulate(position: Coordonnee): void {
        this.lastSimulation = position;
        this.simulations.next(position);
    }

    get lastPosition(): Coordonnee | null {
        return this.lastSimulation;
    }
}
