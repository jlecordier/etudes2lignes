/**
 * L'état d'une source de position, tel qu'une source le **mesure** : des mètres
 * et des millisecondes, jamais une phrase. C'est `sourceStatusText`
 * (`presentation.ts`) qui rédige le texte destiné à l'utilisateur — une source
 * n'a pas à connaître la langue de l'interface ni ses arrondis.
 *
 * - `attente` : démarrée, aucune position encore obtenue.
 * - `imprecise` : la source répond, mais trop grossièrement pour caler la page
 *   (voir `usableFix` dans `precisionDuFix.ts`).
 * - `perdue` : plus de position depuis `ageMs`.
 * - `permission-refusee` : l'utilisateur a refusé l'accès à sa position.
 * - `indisponible` : l'appareil n'offre pas de géolocalisation.
 */
export type SourceStatus =
    | { kind: 'attente' }
    | { kind: 'imprecise'; imprecisionMetres: number }
    | { kind: 'perdue'; ageMs: number }
    | { kind: 'permission-refusee' }
    | { kind: 'indisponible' };
