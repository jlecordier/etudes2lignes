/**
 * Nom d'un trajet, saisi par l'utilisateur.
 * Value object : non vide, débarrassé des espaces superflus.
 */
export class NomDeTrajet {
    private constructor(readonly valeur: string) {}

    static creer(texte: string): NomDeTrajet {
        const nettoye = texte.trim();
        if (nettoye === '') {
            throw new Error('Nom de trajet invalide : il ne peut pas être vide');
        }
        return new NomDeTrajet(nettoye);
    }
}
