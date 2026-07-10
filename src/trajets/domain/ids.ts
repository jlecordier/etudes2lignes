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

export function nouvelImageId(): ImageId {
    return crypto.randomUUID() as ImageId;
}

export function nouveauPointId(): PointId {
    return crypto.randomUUID() as PointId;
}
