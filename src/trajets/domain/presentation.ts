/**
 * Ce que contient un trajet, tel que la liste l'annonce.
 *
 * Le pluriel est porté par chaque compte séparément — « 6 images · 1 point » —
 * et l'absence se dit en mots plutôt que par un zéro. Un trajet sans image n'a
 * pas de point à compter : l'agrégat garantit qu'un point vise une de ses
 * images, donc la phrase s'arrête là.
 */
export function trajetContentsText(imageCount: number, pointCount: number): string {
    if (imageCount === 0) {
        return 'Aucune image';
    }
    const images = `${String(imageCount)} ${plural('image', imageCount)}`;
    if (pointCount === 0) {
        return `${images} · aucun point`;
    }
    return `${images} · ${String(pointCount)} ${plural('point', pointCount)}`;
}

/** Le français met au pluriel à partir de deux. */
function plural(mot: string, count: number): string {
    return count > 1 ? `${mot}s` : mot;
}
