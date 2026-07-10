// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Coordonnee } from '../../trajets/domain/Coordonnee';
import {
    GeolocationPositionSource,
    type Cadenceur,
    type FournisseurDeGeolocalisation,
} from './GeolocationPositionSource';

/** Géolocalisation simulée, pilotée à la main par le test. */
class FausseGeolocalisation implements FournisseurDeGeolocalisation {
    private surFix: PositionCallback | null = null;
    private surErreur: PositionErrorCallback | null = null;

    watchPosition(succes: PositionCallback, erreur?: PositionErrorCallback | null): number {
        this.surFix = succes;
        this.surErreur = erreur ?? null;
        return 7;
    }

    clearWatch(): void {
        this.surFix = null;
        this.surErreur = null;
    }

    emettreUnFix(latitude: number, longitude: number, precision = 10): void {
        this.surFix?.(fix(latitude, longitude, precision));
    }

    emettreUneErreur(code: number): void {
        this.surErreur?.({
            code,
            message: '',
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
        });
    }
}

function fix(latitude: number, longitude: number, accuracy: number): GeolocationPosition {
    return {
        coords: {
            latitude,
            longitude,
            accuracy,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
            toJSON: () => ({}),
        },
        timestamp: 0,
        toJSON: () => ({}),
    };
}

/** Cadenceur battu à la main par le test. */
class CadenceurManuel implements Cadenceur {
    private action: (() => void) | null = null;
    annule = false;

    toutesLes(_millisecondes: number, action: () => void): () => void {
        this.action = action;
        return () => {
            this.annule = true;
            this.action = null;
        };
    }

    battre(): void {
        this.action?.();
    }
}

function banc(): {
    geolocalisation: FausseGeolocalisation;
    cadenceur: CadenceurManuel;
    avancerLeTemps: (ms: number) => void;
    source: GeolocationPositionSource;
    positions: Coordonnee[];
    erreurs: string[];
} {
    const geolocalisation = new FausseGeolocalisation();
    const cadenceur = new CadenceurManuel();
    let tempsCourant = 0;
    const source = new GeolocationPositionSource({
        geolocalisation,
        maintenant: () => tempsCourant,
        cadenceur,
    });
    const positions: Coordonnee[] = [];
    const erreurs: string[] = [];
    source.demarrer(
        (position) => positions.push(position),
        (message) => erreurs.push(message),
    );
    return {
        geolocalisation,
        cadenceur,
        avancerLeTemps: (ms) => {
            tempsCourant += ms;
        },
        source,
        positions,
        erreurs,
    };
}

describe('GeolocationPositionSource', () => {
    describe('Étant donné un fix précis, quand il arrive', () => {
        it('alors la position est transmise', () => {
            const { geolocalisation, positions } = banc();

            geolocalisation.emettreUnFix(46.5802, 0.3404);

            expect(positions.map((p) => [p.latitude, p.longitude])).toEqual([[46.5802, 0.3404]]);
        });
    });

    describe('Étant donné un fix trop imprécis (800 m)', () => {
        it('alors il est ignoré', () => {
            const { geolocalisation, positions } = banc();

            geolocalisation.emettreUnFix(46.58, 0.34, 800);

            expect(positions).toEqual([]);
        });
    });

    describe('Étant donné des fixes rapprochés', () => {
        it('alors au plus une position toutes les 10 s est transmise', () => {
            const { geolocalisation, positions, avancerLeTemps } = banc();

            geolocalisation.emettreUnFix(46.0, 0.1);
            avancerLeTemps(3_000);
            geolocalisation.emettreUnFix(46.1, 0.2);
            avancerLeTemps(8_000);
            geolocalisation.emettreUnFix(46.2, 0.3);

            expect(positions.map((p) => p.latitude)).toEqual([46.0, 46.2]);
        });
    });

    describe('Étant donné une permission refusée', () => {
        it('alors le message explique comment autoriser la localisation', () => {
            const { geolocalisation, erreurs } = banc();

            geolocalisation.emettreUneErreur(1);

            expect(erreurs.at(-1)).toContain('refusé');
        });
    });

    describe('Étant donné une erreur passagère (position indisponible)', () => {
        it('alors rien n’est signalé tant que le dernier fix est frais', () => {
            const { geolocalisation, avancerLeTemps, erreurs } = banc();
            geolocalisation.emettreUnFix(46.0, 0.1);
            avancerLeTemps(2_000);

            geolocalisation.emettreUneErreur(2);

            expect(erreurs).toEqual([]);
        });

        it('alors, après un long silence, le message donne l’ancienneté', () => {
            const { geolocalisation, avancerLeTemps, erreurs } = banc();
            geolocalisation.emettreUnFix(46.0, 0.1);
            avancerLeTemps(120_000);

            geolocalisation.emettreUneErreur(2);

            expect(erreurs.at(-1)).toContain('il y a 2 min');
        });
    });

    describe('Étant donné un long silence du GPS', () => {
        it('alors, avant tout fix, le chien de garde signale l’attente du signal', () => {
            const { cadenceur, avancerLeTemps, erreurs } = banc();

            avancerLeTemps(60_000);
            cadenceur.battre();

            expect(erreurs.at(-1)).toContain('En attente du signal GPS');
        });

        it('alors, après un fix, le message donne l’ancienneté de la dernière position', () => {
            const { geolocalisation, cadenceur, avancerLeTemps, erreurs } = banc();
            geolocalisation.emettreUnFix(46.0, 0.1);

            avancerLeTemps(120_000);
            cadenceur.battre();

            expect(erreurs.at(-1)).toContain('il y a 2 min');
        });

        it('alors un silence court ne déclenche rien', () => {
            const { geolocalisation, cadenceur, avancerLeTemps, erreurs } = banc();
            geolocalisation.emettreUnFix(46.0, 0.1);

            avancerLeTemps(10_000);
            cadenceur.battre();

            expect(erreurs).toEqual([]);
        });
    });

    describe('Étant donné une source arrêtée', () => {
        it('alors plus aucune position n’est transmise et le chien de garde est coupé', () => {
            const { geolocalisation, cadenceur, source, positions } = banc();
            geolocalisation.emettreUnFix(46.0, 0.1);

            source.arreter();
            geolocalisation.emettreUnFix(46.2, 0.3);

            expect(positions.map((p) => p.latitude)).toEqual([46.0]);
            expect(cadenceur.annule).toBe(true);
        });
    });

    describe('Étant donné un retour au premier plan', () => {
        it('alors la surveillance redémarre et le prochain fix passe sans attendre le throttle', () => {
            const { geolocalisation, positions, avancerLeTemps } = banc();
            geolocalisation.emettreUnFix(46.0, 0.1);
            avancerLeTemps(2_000);

            document.dispatchEvent(new Event('visibilitychange'));
            geolocalisation.emettreUnFix(46.5, 0.5);

            expect(positions.map((p) => p.latitude)).toEqual([46.0, 46.5]);
        });
    });
});
