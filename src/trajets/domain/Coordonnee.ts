/**
 * Coordonnée géographique (WGS84, degrés décimaux).
 * Value object : validée à la construction, immuable, égalité par valeur.
 */
export class Coordonnee {
    private constructor(
        readonly latitude: number,
        readonly longitude: number,
    ) {}

    static creer(latitude: number, longitude: number): Coordonnee {
        if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
            throw new Error(`Latitude invalide : ${latitude}`);
        }
        if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
            throw new Error(`Longitude invalide : ${longitude}`);
        }
        return new Coordonnee(latitude, longitude);
    }

    egale(autre: Coordonnee): boolean {
        return this.latitude === autre.latitude && this.longitude === autre.longitude;
    }
}
