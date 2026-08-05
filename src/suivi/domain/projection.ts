import { clamp } from '../../shared/number';
import { requireElementAt } from '../../shared/array';
import type { Coordonnee } from '../../trajets/domain/Coordonnee';

/**
 * Une étape du voyage : un point géo-référencé projeté dans le référentiel
 * du document affiché (offset en pixels depuis le haut du document).
 * Les étapes sont fournies dans l'ordre du voyage ; les pages étant empilées
 * première-du-voyage en bas, les offsets décroissent au fil du voyage.
 * L'algorithme ne suppose de toute façon aucune monotonie (il tolère des
 * documents mal ordonnés et des lignes qui se recroisent).
 */
export interface EtapeDuVoyage {
    readonly coordonnee: Coordonnee;
    readonly offset: number;
}

/**
 * Où l'on est **sur le trajet** : le segment retenu et l'avancement dessus.
 *
 * Indépendante de tout référentiel de pixels, et c'est tout son intérêt : la
 * pile qui défile et l'aperçu du trajet entier mesurent des offsets différents,
 * mais réinterpolent la **même** décision. Sans elle il faudrait projeter deux
 * fois, donc entretenir deux ancrages d'adhérence — et les deux vues pourraient
 * retenir deux segments différents près d'une jonction, exactement le bruit que
 * `chooseSegment` existe pour absorber.
 */
export interface TrajetPosition {
    readonly segmentIndex: number;
    /** Avancement le long du segment retenu, borné à [0, 1]. */
    readonly t: number;
}

/**
 * La position tombe sur le trajet : elle dit **où sur le trajet** on est, et
 * l'offset visé dans le référentiel des étapes fournies. L'écran en garde le
 * dernier, dont il se sert pour trois choses — l'adhérence du tick suivant, le
 * défilement, et la barre de l'aperçu.
 */
export type SurTrajet = { kind: 'sur-trajet'; scrollTarget: number } & TrajetPosition;

export type SuiviResult =
    { kind: 'pas-assez-de-points' } | { kind: 'hors-trajet'; distanceMetres: number } | SurTrajet;

/**
 * La cible de défilement retenue au tick précédent, pour l'adhérence : c'est
 * l'écart de cible — jamais un numéro de segment — qui départage les segments
 * quasi ex æquo (voir `chooseSegment`).
 */
export interface AncragePrecedent {
    readonly scrollTarget: number;
}

/** En-deçà de cette distance du trajet, on ne s'inquiète jamais. */
export const SEUIL_MINIMUM_METRES = 5000;
/**
 * En-deçà de cette longueur, un segment est traité comme un point : à cette
 * échelle, l'orientation d'un segment n'a plus de sens (et sa division non plus).
 */
const MINIMUM_SEGMENT_LENGTH_METRES = 1;
/** Part de la longueur du segment tolérée en écart (la corde s'éloigne de la vraie ligne). */
const SEGMENT_LENGTH_SHARE = 0.2;
/** Marge d'adhérence : un autre segment doit être nettement plus proche pour être retenu. */
const ADHERENCE_MARGIN_METRES = 200;
/**
 * La position courante s'affiche aux trois quarts de l'écran (un quart du bas).
 *
 * Exportée parce que le repère visuel de l'écran de suivi doit tomber au même
 * endroit : la valeur était recopiée dans le CSS (`top: 75vh`) et dans les tests
 * de bout en bout, où elle pouvait diverger sans que rien ne le signale — la
 * ligne bleue aurait alors menti sur la position réelle.
 */
export const POSITION_VIEWPORT_FRACTION = 0.75;

/**
 * Trouve où placer le document pour la position donnée : projette la position
 * sur le segment le plus proche du trajet et interpole entre les offsets de
 * ses deux étapes. `previous` (résultat du tick précédent) sert d'adhérence :
 * sans lui, le bruit GPS ferait sauter la page quand la ligne repasse près
 * d'elle-même ou que des points partagent le même lieu.
 */
export function computeScrollTarget(
    etapes: readonly EtapeDuVoyage[],
    position: Coordonnee,
    previous: AncragePrecedent | null,
): SuiviResult {
    if (etapes.length < 2) {
        return { kind: 'pas-assez-de-points' };
    }

    const projections = projectOnEachSegment(etapes, position);
    const chosenIndex = chooseSegment(projections, etapes, previous);
    const projection = requireElementAt(projections, chosenIndex);

    if (projection.distanceMetres > seuilHorsTrajet(projection.lengthMetres)) {
        return { kind: 'hors-trajet', distanceMetres: projection.distanceMetres };
    }

    const trajetPosition: TrajetPosition = { segmentIndex: chosenIndex, t: projection.t };
    return {
        kind: 'sur-trajet',
        scrollTarget: offsetAt(etapes, trajetPosition),
        ...trajetPosition,
    };
}

/**
 * L'offset visé pour une position sur le trajet, dans le référentiel des étapes
 * fournies. Appelée une fois par vue : le document pour la pile qui défile, sa
 * propre pile pour l'aperçu. C'est ici, et nulle part ailleurs, qu'une position
 * sur le trajet devient des pixels.
 */
export function offsetAt(etapes: readonly EtapeDuVoyage[], position: TrajetPosition): number {
    const start = requireElementAt(etapes, position.segmentIndex).offset;
    const end = requireElementAt(etapes, position.segmentIndex + 1).offset;
    return interpolate(start, end, position.t);
}

/**
 * Position de défilement (scrollTop) qui place la cible aux trois quarts de
 * l'écran, bornée aux limites du document.
 */
export function computeScroll(
    target: number,
    viewportHeight: number,
    documentHeight: number,
): number {
    const scroll = target - POSITION_VIEWPORT_FRACTION * viewportHeight;
    return clamp(scroll, 0, Math.max(0, documentHeight - viewportHeight));
}

interface SegmentProjection {
    /** Avancement le long du segment, borné à [0, 1]. */
    readonly t: number;
    readonly distanceMetres: number;
    readonly lengthMetres: number;
}

function projectOnEachSegment(
    etapes: readonly EtapeDuVoyage[],
    position: Coordonnee,
): SegmentProjection[] {
    const projections: SegmentProjection[] = [];
    for (let index = 0; index < etapes.length - 1; index++) {
        projections.push(
            projectOnSegment(
                requireElementAt(etapes, index).coordonnee,
                requireElementAt(etapes, index + 1).coordonnee,
                position,
            ),
        );
    }
    return projections;
}

/**
 * Projection orthogonale de P sur le segment [A, B], dans un plan local en
 * mètres (approximation équirectangulaire — largement suffisante à l'échelle
 * d'un segment de ligne en France).
 */
function projectOnSegment(a: Coordonnee, b: Coordonnee, p: Coordonnee): SegmentProjection {
    const toB = toLocalPlaneInMetres(a, b);
    const toP = toLocalPlaneInMetres(a, p);
    const squaredLength = toB.x * toB.x + toB.y * toB.y;

    // Segment plus court qu'un mètre — en pratique deux points posés au même
    // endroit, par exemple le PK répété de part et d'autre d'une jonction de
    // pages : on le traite comme un point, sinon division par (presque) zéro.
    if (squaredLength < MINIMUM_SEGMENT_LENGTH_METRES ** 2) {
        return { t: 0, distanceMetres: Math.hypot(toP.x, toP.y), lengthMetres: 0 };
    }

    const t = clamp((toP.x * toB.x + toP.y * toB.y) / squaredLength, 0, 1);
    const distanceMetres = Math.hypot(toP.x - t * toB.x, toP.y - t * toB.y);
    return { t, distanceMetres, lengthMetres: Math.sqrt(squaredLength) };
}

function toLocalPlaneInMetres(origine: Coordonnee, point: Coordonnee): { x: number; y: number } {
    const METRES_PER_DEGREE = 111_320;
    const metresPerDegreeOfLongitude =
        METRES_PER_DEGREE * Math.cos((origine.latitude * Math.PI) / 180);
    return {
        x: (point.longitude - origine.longitude) * metresPerDegreeOfLongitude,
        y: (point.latitude - origine.latitude) * METRES_PER_DEGREE,
    };
}

/**
 * Retient le segment le plus proche, avec adhérence : quand la ligne repasse
 * près d'elle-même (raccordements, rebroussements) ou que des points partagent
 * le même lieu, plusieurs segments sont presque aussi proches les uns que les
 * autres. Parmi ces quasi-ex-æquo, on retient celui dont la cible de
 * défilement reste la plus proche de la précédente — c'est ce qui empêche la
 * page de sauter à chaque tick de bruit GPS, dans un sens comme dans l'autre.
 */
function chooseSegment(
    projections: readonly SegmentProjection[],
    etapes: readonly EtapeDuVoyage[],
    previous: AncragePrecedent | null,
): number {
    const nearestIndex = indexOfMinimumDistance(projections);
    if (previous === null) {
        return nearestIndex;
    }

    const minimumDistance = requireElementAt(projections, nearestIndex).distanceMetres;
    let chosenIndex = nearestIndex;
    let smallestTargetGap = Number.POSITIVE_INFINITY;
    for (let index = 0; index < projections.length; index++) {
        if (
            requireElementAt(projections, index).distanceMetres >
            minimumDistance + ADHERENCE_MARGIN_METRES
        ) {
            continue;
        }
        const target = interpolate(
            requireElementAt(etapes, index).offset,
            requireElementAt(etapes, index + 1).offset,
            requireElementAt(projections, index).t,
        );
        const ecart = Math.abs(target - previous.scrollTarget);
        if (ecart < smallestTargetGap) {
            smallestTargetGap = ecart;
            chosenIndex = index;
        }
    }
    return chosenIndex;
}

function indexOfMinimumDistance(projections: readonly SegmentProjection[]): number {
    let meilleur = 0;
    for (let index = 1; index < projections.length; index++) {
        if (
            requireElementAt(projections, index).distanceMetres <
            requireElementAt(projections, meilleur).distanceMetres
        ) {
            meilleur = index;
        }
    }
    return meilleur;
}

function seuilHorsTrajet(segmentLengthMetres: number): number {
    return Math.max(SEUIL_MINIMUM_METRES, SEGMENT_LENGTH_SHARE * segmentLengthMetres);
}

function interpolate(start: number, end: number, t: number): number {
    return start + (end - start) * t;
}
