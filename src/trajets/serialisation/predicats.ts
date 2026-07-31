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

export function estUnObjet(valeur: unknown): valeur is Record<string, unknown> {
    return typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur);
}

export function estUnTableau(valeur: unknown): valeur is unknown[] {
    return Array.isArray(valeur);
}

export function estUneChaine(valeur: unknown): valeur is string {
    return typeof valeur === 'string';
}

export function estUnTableauDeChaines(valeur: unknown): valeur is string[] {
    return estUnTableau(valeur) && valeur.every(estUneChaine);
}

export function estUnNombreFini(valeur: unknown): valeur is number {
    return typeof valeur === 'number' && Number.isFinite(valeur);
}

/** Une dimension d'image en pixels : un entier strictement positif. */
export function estUnEntierPositif(valeur: unknown): valeur is number {
    return estUnNombreFini(valeur) && Number.isInteger(valeur) && valeur > 0;
}

/** Une date utilisable : le clone structuré peut rendre une `Date` invalide. */
export function estUneDate(valeur: unknown): valeur is Date {
    return valeur instanceof Date && Number.isFinite(valeur.getTime());
}

/** Les octets d'une image telle qu'IndexedDB les rend (cf. ADR 0005). */
export function estUnTampon(valeur: unknown): valeur is ArrayBuffer {
    return valeur instanceof ArrayBuffer;
}
