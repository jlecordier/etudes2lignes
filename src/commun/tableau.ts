/**
 * Accès indexé sûr, pour remplacer `tableau[i]!` quand l'index est
 * prouvablement valide (issu d'un `findIndex`, d'une borne de boucle vérifiée…).
 * Lève si l'index est hors bornes — c'est-à-dire seulement si un invariant est
 * rompu, ce que le `!` aurait de toute façon transformé en plantage plus loin.
 */
export function elementA<T>(tableau: readonly T[], index: number): T {
    const element = tableau[index];
    if (element === undefined) {
        throw new RangeError(`Index ${index} hors bornes (longueur ${tableau.length}).`);
    }
    return element;
}
