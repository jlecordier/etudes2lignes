import type { Coordonnee } from '../../trajets/domain/Coordonnee';

/**
 * Port : fournir des positions au fil de l'eau (GPS réel, simulation…).
 *
 * Contrat : `demarrer` appelle `surPosition` à chaque position retenue et
 * `surErreur` avec un message lisible quand la source est en difficulté
 * (permission refusée, signal perdu). `arreter` coupe tout ; redémarrable.
 */
export interface PositionSource {
    demarrer(
        surPosition: (position: Coordonnee) => void,
        surErreur: (message: string) => void,
    ): void;
    arreter(): void;
}
