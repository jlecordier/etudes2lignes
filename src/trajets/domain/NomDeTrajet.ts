/**
 * Nom d'un trajet, saisi par l'utilisateur.
 * Value object : non vide, débarrassé des espaces superflus.
 */
export class NomDeTrajet {
    private constructor(readonly value: string) {}

    static create(text: string): NomDeTrajet {
        const nettoye = text.trim();
        if (nettoye === '') {
            throw new Error('Nom de trajet invalide : il ne peut pas être vide');
        }
        return new NomDeTrajet(nettoye);
    }
}
