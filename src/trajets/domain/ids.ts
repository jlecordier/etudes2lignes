/**
 * Identifiants typés : de simples chaînes (UUID), mais que le compilateur
 * refuse de mélanger entre elles grâce à une marque de type.
 */

export type TrajetId = string & { readonly __marque: 'TrajetId' };
export type ImageId = string & { readonly __marque: 'ImageId' };
export type PointId = string & { readonly __marque: 'PointId' };

export function nouveauTrajetId(): TrajetId {
    return crypto.randomUUID() as TrajetId;
}

/**
 * Reconnaît un identifiant de trajet dans une chaîne venue du dehors (mémoire de
 * session, lien partagé). Rend `null` si la chaîne n'en est pas un.
 *
 * C'est la **seule** porte d'entrée : partout ailleurs, un identifiant se
 * fabrique par `nouveauTrajetId`. Sans elle, chaque frontière recopiait un
 * `as TrajetId` sur une chaîne que personne n'avait vérifiée — le compilateur
 * croyait alors tenir un identifiant là où il n'y avait qu'un texte.
 *
 * Reconnaître la forme ne dit pas que le trajet existe : c'est au dépôt de le
 * dire, en rendant `null` au chargement.
 */
export function trajetIdDepuis(texte: string): TrajetId | null {
    return FORME_D_UUID.test(texte) ? (texte as TrajetId) : null;
}

/** La forme rendue par `crypto.randomUUID`. */
const FORME_D_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function nouvelImageId(): ImageId {
    return crypto.randomUUID() as ImageId;
}

export function nouveauPointId(): PointId {
    return crypto.randomUUID() as PointId;
}
