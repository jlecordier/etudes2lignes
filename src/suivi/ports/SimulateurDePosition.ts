import type { Coordonnee } from '../../trajets/domain/Coordonnee';
import type { PositionSource } from './PositionSource';

/**
 * Port : une source de position pilotable à la main (le mode simulation).
 *
 * C'est un PositionSource comme un autre, avec en plus la commande `simuler`
 * et la mémoire de la dernière position choisie (pour rouvrir la carte
 * dessus). L'écran de suivi ne dépend que de ce contrat — jamais de
 * l'adapter concret.
 */
export interface SimulateurDePosition extends PositionSource {
    simuler(position: Coordonnee): void;
    readonly dernierePosition: Coordonnee | null;
}
