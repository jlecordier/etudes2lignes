/**
 * L'échelle de l'aperçu du trajet : la seule chose que la feuille de style ne
 * peut pas déduire toute seule.
 *
 * L'aperçu n'a pas de taille propre — sa largeur est celle qui fait tenir la
 * pile entière dans la hauteur disponible :
 *
 *     largeur = hauteur disponible ÷ Σ (hauteur / largeur)
 *
 * La somme porte sur le ratio **propre à chaque page** : rien ici ne suppose
 * que les pages d'un trajet se ressemblent. Toutes sont posées à la même
 * largeur et chacune garde son ratio, donc l'égalité
 * `Σ hauteurs affichées = hauteur disponible` est exacte pour n'importe quel
 * mélange de formats. Le TypeScript écrit cette somme, le CSS fait la division.
 */

/** Une page vue par l'aperçu : à cette échelle, seules ses proportions comptent. */
export interface PageProportions {
    readonly largeur: number;
    readonly hauteur: number;
}

/**
 * Somme des ratios `hauteur / largeur` des pages. Vaut 0 sans page — et c'est
 * ce zéro que l'écran vérifie avant d'écrire la propriété CSS, faute de quoi la
 * feuille de style diviserait par zéro.
 *
 * L'agrégat garantit des dimensions entières strictement positives
 * (`Trajet.admitImage`), donc aucun ratio n'est ici ni nul ni infini.
 */
export function ratiosSum(pages: readonly PageProportions[]): number {
    return pages.reduce((total, page) => total + page.hauteur / page.largeur, 0);
}
