/**
 * Prédicats de type pour les données venues du dehors : fichier JSON importé
 * **et** enregistrements relus d'IndexedDB. Les deux frontières partagent ces
 * gardes ; chacune formule son propre message d'erreur, car « fichier
 * incomplet » et « trajet illisible en base » ne se disent pas à l'utilisateur
 * de la même façon.
 *
 * Ce sont des prédicats de type au sens d'ADR 0002 : ils **vérifient** à
 * l'exécution ce qu'un `as` se contenterait d'affirmer.
 */

export function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isArray(value: unknown): value is unknown[] {
    return Array.isArray(value);
}

export function isString(value: unknown): value is string {
    return typeof value === 'string';
}

export function isStringArray(value: unknown): value is string[] {
    return isArray(value) && value.every(isString);
}

/**
 * Le `typeof` paraît redondant — `Number.isFinite` rend déjà `false` pour tout
 * ce qui n'est pas un nombre, sans conversion — mais il est là pour le
 * compilateur : `Number.isFinite` n'est pas un prédicat de type, et sans lui
 * TypeScript refuserait de conclure `value is number`. Ne pas le retirer.
 */
export function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

/** Une dimension d'image en pixels : un entier strictement positif. */
export function isPositiveInteger(value: unknown): value is number {
    return isFiniteNumber(value) && Number.isInteger(value) && value > 0;
}

/** Une date utilisable : le clone structuré peut rendre une `Date` invalide. */
export function isDate(value: unknown): value is Date {
    return value instanceof Date && Number.isFinite(value.getTime());
}

/** Les octets d'une image telle qu'IndexedDB les rend (cf. ADR 0005). */
export function isArrayBuffer(value: unknown): value is ArrayBuffer {
    return value instanceof ArrayBuffer;
}
