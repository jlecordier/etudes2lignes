import { borner } from '../../commun/nombre';

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

    /**
     * Fraction d'une distance mesurée depuis le bord haut d'une zone de hauteur
     * donnée (l'une et l'autre dans la même unité, typiquement des pixels).
     * L'intervalle `[0, 1]` est borné ici, et nulle part ailleurs : un pointeur
     * qui sort de la zone pendant un glisser donne 0 ou 1, pas un refus.
     * Une hauteur nulle ou négative est en revanche refusée : la fraction n'a
     * alors pas de sens.
     */
    static depuisHauteur(distance: number, hauteur: number): FractionVerticale {
        if (!Number.isFinite(hauteur) || hauteur <= 0) {
            throw new Error(`Hauteur invalide pour une fraction verticale : ${hauteur}`);
        }
        return FractionVerticale.creer(borner(distance / hauteur, 0, 1));
    }

    egale(autre: FractionVerticale): boolean {
        return this.valeur === autre.valeur;
    }
}
