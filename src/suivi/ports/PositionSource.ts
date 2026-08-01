import type { Coordonnee } from '../../trajets/domain/Coordonnee';
import type { SourceStatus } from '../domain/sourceStatus';

/**
 * Port : fournir des positions au fil de l'eau (GPS réel, simulation…).
 *
 * Contrat :
 * - `demarrer` appelle `onPosition` à chaque position retenue et `onStatus` à
 *   chaque changement d'état de la source — un **état mesuré** du domaine
 *   (mètres, millisecondes), jamais une phrase : c'est `sourceStatusText`
 *   qui rédige le texte de l'interface.
 * - `demarrer` annonce `{ kind: 'attente' }` avant d'avoir la moindre position,
 *   et il est **idempotent** : un second appel referme la session précédente
 *   (ni double abonnement, ni minuterie orpheline, ni horodatage hérité) et
 *   n'alimente plus que les derniers rappels reçus.
 * - `arreter` coupe tout (rappels, poignées, minuteries) ; la source reste
 *   redémarrable.
 *
 * La suite de contrat `contratDePositionSource.ts` éprouve ces règles contre
 * chaque adapter.
 */
export interface PositionSource {
    start(onPosition: (position: Coordonnee) => void, onStatus: (kind: SourceStatus) => void): void;
    stop(): void;
}
