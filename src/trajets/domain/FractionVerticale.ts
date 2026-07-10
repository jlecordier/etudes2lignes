/**
 * Position verticale relative sur une image : 0 = bord haut, 1 = bord bas.
 * Value object : validée à la construction, immuable, égalité par valeur.
 */
export class FractionVerticale {
    private constructor(readonly valeur: number) {}

    static creer(valeur: number): FractionVerticale {
        if (!Number.isFinite(valeur) || valeur < 0 || valeur > 1) {
            throw new Error(`Fraction verticale invalide : ${valeur}`);
        }
        return new FractionVerticale(valeur);
    }

    egale(autre: FractionVerticale): boolean {
        return this.valeur === autre.valeur;
    }
}
