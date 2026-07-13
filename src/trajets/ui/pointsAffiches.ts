import type { PointAffiche } from '../../carte/ports/CarteDesPointsPort';
import type { Trajet } from '../domain/Trajet';

/** Les points du trajet numérotés dans l'ordre du voyage, prêts pour une carte. */
export function pointsAffiches(trajet: Trajet): PointAffiche[] {
    return trajet
        .ordreVoyageDesPoints()
        .map((point, index) => ({ id: point.id, numero: index + 1, coordonnee: point.coordonnee }));
}
