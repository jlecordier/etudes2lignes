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

/**
 * Ce que la liste annonce d'un point : où il tombe dans le trajet, et sur quelle
 * page.
 *
 * Un pourcentage, et pas une distance : l'application ne connaît ni les PK du
 * schéma ni la longueur de la ligne. L'avancement vient de l'agrégat, qui le
 * mesure dans le document (`Trajet.progressOfPoint`) ; la page est numérotée
 * depuis le haut de la pile, comme la pastille peinte sur l'image.
 */
export function pointDescriptionText(progress: number, pageNumber: number): string {
    return `${String(Math.round(progress * 100))} % du trajet · page ${String(pageNumber)}`;
}

/**
 * La coordonnée d'un point, telle que son infobulle la donne. Elle a quitté la
 * phrase de la liste — la carte, à côté, la montre mieux — mais relire une
 * coordonnée qu'on vient de placer reste légitime.
 */
export function pointCoordonneeText(latitude: number, longitude: number): string {
    return `Coordonnée : ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
}

/** Le français met au pluriel à partir de deux. */
function plural(mot: string, count: number): string {
    return count > 1 ? `${mot}s` : mot;
}
