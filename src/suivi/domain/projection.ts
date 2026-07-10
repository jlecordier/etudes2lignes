import type { Coordonnee } from '../../trajets/domain/Coordonnee';

/**
 * Une étape du voyage : un point géo-référencé projeté dans le référentiel
 * du document affiché (offset en pixels depuis le haut du document).
 * Les étapes sont fournies dans l'ordre du voyage ; comme les pages se lisent
 * de bas en haut, les offsets ne sont PAS monotones (dents de scie aux
 * changements de page) — l'algorithme n'en a pas besoin.
 */
export interface EtapeDuVoyage {
    readonly coordonnee: Coordonnee;
    readonly offset: number;
}

export type ResultatDeSuivi =
    | { etat: 'pas-assez-de-points' }
    | { etat: 'hors-trajet'; distanceMetres: number }
    | { etat: 'sur-trajet'; scrollCible: number; indexSegment: number };

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
 * ses deux étapes. `segmentPrecedent` (résultat du tick précédent) sert
 * d'adhérence : sans lui, le bruit GPS ferait osciller la page aux jonctions.
 */
export function calculerCibleDeScroll(
    etapes: readonly EtapeDuVoyage[],
    position: Coordonnee,
    segmentPrecedent: number | null,
): ResultatDeSuivi {
    if (etapes.length < 2) {
        return { etat: 'pas-assez-de-points' };
    }

    const projections = projeterSurChaqueSegment(etapes, position);
    const indexRetenu = choisirLeSegment(projections, segmentPrecedent);
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

    // Segment de longueur nulle (point de jonction dupliqué entre deux pages) :
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
 * Retient le segment le plus proche, avec adhérence : si un voisin immédiat
 * du segment précédent est presque aussi proche que le meilleur candidat
 * global, on le préfère pour éviter les sauts de page intempestifs.
 */
function choisirLeSegment(
    projections: readonly ProjectionSurSegment[],
    segmentPrecedent: number | null,
): number {
    const indexLePlusProche = indexDeLaDistanceMinimale(projections, 0, projections.length - 1);
    if (segmentPrecedent === null) {
        return indexLePlusProche;
    }

    const indexDuMeilleurVoisin = indexDeLaDistanceMinimale(
        projections,
        Math.max(0, segmentPrecedent - 1),
        Math.min(projections.length - 1, segmentPrecedent + 1),
    );
    const ecart =
        projections[indexDuMeilleurVoisin]!.distanceMetres -
        projections[indexLePlusProche]!.distanceMetres;
    return ecart <= MARGE_D_ADHERENCE_METRES ? indexDuMeilleurVoisin : indexLePlusProche;
}

function indexDeLaDistanceMinimale(
    projections: readonly ProjectionSurSegment[],
    de: number,
    a: number,
): number {
    let meilleur = de;
    for (let index = de + 1; index <= a; index++) {
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
