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

export type ResultatDeSuivi =
    | { etat: 'pas-assez-de-points' }
    | { etat: 'hors-trajet'; distanceMetres: number }
    | { etat: 'sur-trajet'; scrollCible: number; indexSegment: number };

/** L'ancrage du tick précédent (un résultat « sur-trajet »), pour l'adhérence. */
export interface AncragePrecedent {
    readonly indexSegment: number;
    readonly scrollCible: number;
}

/** En-deçà de cette distance du trajet, on ne s'inquiète jamais. */
const SEUIL_MINIMUM_METRES = 5000;
/** Part de la longueur du segment tolérée en écart (la corde s'éloigne de la vraie ligne). */
const PART_DE_LA_LONGUEUR_DU_SEGMENT = 0.2;
/** Marge d'adhérence : un autre segment doit être nettement plus proche pour être retenu. */
const MARGE_D_ADHERENCE_METRES = 200;
/** La position courante s'affiche aux trois quarts de l'écran (un quart du bas). */
const FRACTION_D_ECRAN_DE_LA_POSITION = 0.75;

/**
 * Trouve où placer le document pour la position donnée : projette la position
 * sur le segment le plus proche du trajet et interpole entre les offsets de
 * ses deux étapes. `precedent` (résultat du tick précédent) sert d'adhérence :
 * sans lui, le bruit GPS ferait sauter la page quand la ligne repasse près
 * d'elle-même ou que des points partagent le même lieu.
 */
export function calculerCibleDeScroll(
    etapes: readonly EtapeDuVoyage[],
    position: Coordonnee,
    precedent: AncragePrecedent | null,
): ResultatDeSuivi {
    if (etapes.length < 2) {
        return { etat: 'pas-assez-de-points' };
    }

    const projections = projeterSurChaqueSegment(etapes, position);
    const indexRetenu = choisirLeSegment(projections, etapes, precedent);
    const projection = projections[indexRetenu]!;

    if (projection.distanceMetres > seuilHorsTrajet(projection.longueurMetres)) {
        return { etat: 'hors-trajet', distanceMetres: projection.distanceMetres };
    }

    const depart = etapes[indexRetenu]!.offset;
    const arrivee = etapes[indexRetenu + 1]!.offset;
    return {
        etat: 'sur-trajet',
        scrollCible: interpoler(depart, arrivee, projection.t),
        indexSegment: indexRetenu,
    };
}

/**
 * Position de défilement (scrollTop) qui place la cible aux trois quarts de
 * l'écran, bornée aux limites du document.
 */
export function calculerDefilement(
    cible: number,
    hauteurViewport: number,
    hauteurDocument: number,
): number {
    const defilement = cible - FRACTION_D_ECRAN_DE_LA_POSITION * hauteurViewport;
    return borner(defilement, 0, Math.max(0, hauteurDocument - hauteurViewport));
}

interface ProjectionSurSegment {
    /** Avancement le long du segment, borné à [0, 1]. */
    readonly t: number;
    readonly distanceMetres: number;
    readonly longueurMetres: number;
}

function projeterSurChaqueSegment(
    etapes: readonly EtapeDuVoyage[],
    position: Coordonnee,
): ProjectionSurSegment[] {
    const projections: ProjectionSurSegment[] = [];
    for (let index = 0; index < etapes.length - 1; index++) {
        projections.push(
            projeterSurSegment(etapes[index]!.coordonnee, etapes[index + 1]!.coordonnee, position),
        );
    }
    return projections;
}

/**
 * Projection orthogonale de P sur le segment [A, B], dans un plan local en
 * mètres (approximation équirectangulaire — largement suffisante à l'échelle
 * d'un segment de ligne en France).
 */
function projeterSurSegment(a: Coordonnee, b: Coordonnee, p: Coordonnee): ProjectionSurSegment {
    const versB = versPlanLocalEnMetres(a, b);
    const versP = versPlanLocalEnMetres(a, p);
    const longueurCarree = versB.x * versB.x + versB.y * versB.y;

    // Segment de longueur nulle (deux points posés au même endroit, par
    // exemple le PK répété de part et d'autre d'une jonction de pages) :
    // on le traite comme un point, sinon division par zéro.
    if (longueurCarree < 1) {
        return { t: 0, distanceMetres: Math.hypot(versP.x, versP.y), longueurMetres: 0 };
    }

    const t = borner((versP.x * versB.x + versP.y * versB.y) / longueurCarree, 0, 1);
    const distanceMetres = Math.hypot(versP.x - t * versB.x, versP.y - t * versB.y);
    return { t, distanceMetres, longueurMetres: Math.sqrt(longueurCarree) };
}

function versPlanLocalEnMetres(origine: Coordonnee, point: Coordonnee): { x: number; y: number } {
    const METRES_PAR_DEGRE = 111_320;
    const metresParDegreDeLongitude =
        METRES_PAR_DEGRE * Math.cos((origine.latitude * Math.PI) / 180);
    return {
        x: (point.longitude - origine.longitude) * metresParDegreDeLongitude,
        y: (point.latitude - origine.latitude) * METRES_PAR_DEGRE,
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
function choisirLeSegment(
    projections: readonly ProjectionSurSegment[],
    etapes: readonly EtapeDuVoyage[],
    precedent: AncragePrecedent | null,
): number {
    const indexLePlusProche = indexDeLaDistanceMinimale(projections);
    if (precedent === null) {
        return indexLePlusProche;
    }

    const distanceMinimale = projections[indexLePlusProche]!.distanceMetres;
    let indexRetenu = indexLePlusProche;
    let plusPetitEcartDeCible = Number.POSITIVE_INFINITY;
    for (let index = 0; index < projections.length; index++) {
        if (projections[index]!.distanceMetres > distanceMinimale + MARGE_D_ADHERENCE_METRES) {
            continue;
        }
        const cible = interpoler(
            etapes[index]!.offset,
            etapes[index + 1]!.offset,
            projections[index]!.t,
        );
        const ecart = Math.abs(cible - precedent.scrollCible);
        if (ecart < plusPetitEcartDeCible) {
            plusPetitEcartDeCible = ecart;
            indexRetenu = index;
        }
    }
    return indexRetenu;
}

function indexDeLaDistanceMinimale(projections: readonly ProjectionSurSegment[]): number {
    let meilleur = 0;
    for (let index = 1; index < projections.length; index++) {
        if (projections[index]!.distanceMetres < projections[meilleur]!.distanceMetres) {
            meilleur = index;
        }
    }
    return meilleur;
}

function seuilHorsTrajet(longueurDuSegmentMetres: number): number {
    return Math.max(SEUIL_MINIMUM_METRES, PART_DE_LA_LONGUEUR_DU_SEGMENT * longueurDuSegmentMetres);
}

function interpoler(depart: number, arrivee: number, t: number): number {
    return depart + (arrivee - depart) * t;
}

function borner(valeur: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, valeur));
}
