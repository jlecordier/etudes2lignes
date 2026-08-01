import { clamp } from '../../shared/number';

/**
 * Position verticale relative sur une image : 0 = bord haut, 1 = bord bas.
 * Value object : validée à la construction, immuable, égalité par valeur.
 */
export class FractionVerticale {
    private constructor(readonly value: number) {}

    static create(value: number): FractionVerticale {
        if (!Number.isFinite(value) || value < 0 || value > 1) {
            throw new Error(`Fraction verticale invalide : ${value}`);
        }
        return new FractionVerticale(value);
    }

    /**
     * Fraction d'une distance mesurée depuis le bord haut d'une zone de hauteur
     * donnée (l'une et l'autre dans la même unité, typiquement des pixels).
     * L'intervalle `[0, 1]` est borné ici, et nulle part ailleurs : un pointeur
     * qui sort de la zone pendant un glisser donne 0 ou 1, pas un refus.
     * Une hauteur nulle ou négative est en revanche refusée : la fraction n'a
     * alors pas de sens.
     */
    static fromHeight(distance: number, hauteur: number): FractionVerticale {
        if (!Number.isFinite(hauteur) || hauteur <= 0) {
            throw new Error(`Hauteur invalide pour une fraction verticale : ${hauteur}`);
        }
        return FractionVerticale.create(clamp(distance / hauteur, 0, 1));
    }

    equals(other: FractionVerticale): boolean {
        return this.value === other.value;
    }
}
