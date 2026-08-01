/**
 * Un fix approximatif (cellule, Wi-Fi, vitres athermiques d'un train) vaut mieux
 * que « signal perdu » : le suivi tolère des kilomètres d'incertitude. Au-delà
 * de ce seuil en revanche, caler la page n'a plus de sens.
 *
 * C'est la règle parente du seuil « hors trajet » de `projection.ts` : la valeur
 * doit rester en-deçà de `SEUIL_MINIMUM_METRES`, sinon l'imprécision d'un fix
 * accepté suffirait, à elle seule, à faire croire qu'on a quitté la ligne.
 */
export const PRECISION_MAXIMALE_METRES = 3000;

/**
 * Ce fix est-il assez précis pour caler la page ? Règle métier : elle vaut pour
 * toute source de position, pas seulement pour le GPS du navigateur.
 */
export function usableFix(imprecisionMetres: number): boolean {
    return imprecisionMetres <= PRECISION_MAXIMALE_METRES;
}
