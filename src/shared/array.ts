/**
 * Accès indexé sûr, pour remplacer `array[i]!` quand l'index est
 * prouvablement valide (issu d'un `findIndex`, d'une borne de boucle vérifiée…).
 * Lève si l'index est hors bornes — c'est-à-dire seulement si un invariant est
 * rompu, ce que le `!` aurait de toute façon transformé en plantage plus loin.
 *
 * Le préfixe `require` dit la garde, et la distingue de `Array.prototype.at()`
 * qui, elle, accepte les indices négatifs et rend `undefined` hors bornes.
 */
export function requireElementAt<T>(array: readonly T[], index: number): T {
    const element = array[index];
    if (element === undefined) {
        throw new RangeError(`Index ${index} hors bornes (longueur ${array.length}).`);
    }
    return element;
}
