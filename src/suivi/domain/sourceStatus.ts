import type { Coordonnee } from '../../trajets/domain/Coordonnee';

/**
 * L'état d'une source de position, tel qu'une source le **mesure** : des mètres,
 * des millisecondes et une coordonnée, jamais une phrase. C'est
 * `sourceStatusText` (`presentation.ts`) qui rédige le texte destiné à
 * l'utilisateur — une source n'a pas à connaître la langue de l'interface ni ses
 * arrondis.
 *
 * - `attente` : démarrée, aucune position encore obtenue.
 * - `imprecise` : la source répond, mais trop grossièrement pour caler la page
 *   (voir `usableFix` dans `precisionDuFix.ts`). Elle dit quand même **où** :
 *   `usableFix` protège une décision — choisir une page du schéma — et une carte
 *   n'en prend aucune. Un fix à ± 8 km ne peut pas faire défiler le document,
 *   mais il situe très bien sur une carte de France.
 * - `perdue` : plus de position depuis `ageMs`.
 * - `permission-refusee` : l'utilisateur a refusé l'accès à sa position.
 * - `indisponible` : l'appareil n'offre pas de géolocalisation.
 */
export type SourceStatus =
    | { kind: 'attente' }
    | { kind: 'imprecise'; imprecisionMetres: number; position: Coordonnee }
    | { kind: 'perdue'; ageMs: number }
    | { kind: 'permission-refusee' }
    | { kind: 'indisponible' };
