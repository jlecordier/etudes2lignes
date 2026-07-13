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

    describe('Étant donné un fix approximatif (800 m, positionnement cellulaire ou train)', () => {
        it('alors il est utilisé : mieux vaut une position approchée que « signal perdu »', () => {
            const { geolocalisation, positions } = banc();

            geolocalisation.emettreUnFix(46.58, 0.34, 800);

            expect(positions.map((p) => p.latitude)).toEqual([46.58]);
        });
    });

    describe('Étant donné un fix vraiment trop imprécis (5 km)', () => {
        it('alors il n’est pas transmis mais l’état annonce une position approximative', () => {
            const { geolocalisation, positions, erreurs } = banc();

            geolocalisation.emettreUnFix(46.58, 0.34, 5_000);

            expect(positions).toEqual([]);
            expect(erreurs.at(-1)).toBe(
                'Position approximative (± 5 km) — trop imprécise pour caler la page.',
            );
        });

        it('alors le chien de garde parle d’imprécision, jamais de signal perdu', () => {
            const { geolocalisation, cadenceur, avancerLeTemps, erreurs } = banc();
            geolocalisation.emettreUnFix(46.0, 0.1);
            avancerLeTemps(60_000);
            geolocalisation.emettreUnFix(46.01, 0.11, 8_000);
            avancerLeTemps(10_000);

            cadenceur.battre();

            expect(erreurs.at(-1)).toBe(
                'Position approximative (± 8 km) — trop imprécise pour caler la page.',
            );
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

            expect(erreurs.at(-1)).toBe(
                'Accès à la position refusé — autorisez la localisation pour ce site puis revenez.',
            );
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

            expect(erreurs.at(-1)).toBe('Signal GPS perdu — dernière position il y a 2 min.');
        });
    });

    describe('Étant donné un long silence du GPS', () => {
        it('alors, avant tout fix, le chien de garde signale l’attente du signal', () => {
            const { cadenceur, avancerLeTemps, erreurs } = banc();

            avancerLeTemps(60_000);
            cadenceur.battre();

            expect(erreurs.at(-1)).toBe('En attente du signal GPS…');
        });

        it('alors, après un fix, le message donne l’ancienneté de la dernière position', () => {
            const { geolocalisation, cadenceur, avancerLeTemps, erreurs } = banc();
            geolocalisation.emettreUnFix(46.0, 0.1);

            avancerLeTemps(120_000);
            cadenceur.battre();

            expect(erreurs.at(-1)).toBe('Signal GPS perdu — dernière position il y a 2 min.');
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

        it('alors des retours en rafale ne redémarrent pas la surveillance à chaque fois', () => {
            const { geolocalisation, positions, avancerLeTemps } = banc();
            geolocalisation.emettreUnFix(46.0, 0.1);
            avancerLeTemps(2_000);

            document.dispatchEvent(new Event('visibilitychange'));
            geolocalisation.emettreUnFix(46.1, 0.2);
            avancerLeTemps(2_000);
            // Second réveil 2 s plus tard : ignoré, le throttle n'est pas levé.
            document.dispatchEvent(new Event('visibilitychange'));
            geolocalisation.emettreUnFix(46.2, 0.3);

            expect(positions.map((p) => p.latitude)).toEqual([46.0, 46.1]);
        });
    });

    describe('Étant donné une acquisition lente au démarrage (gare couverte)', () => {
        it('alors un premier fix qui met 25 s à arriver n’est pas tué par le throttle', () => {
            const { geolocalisation, avancerLeTemps, positions } = banc();

            avancerLeTemps(25_000);
            geolocalisation.emettreUnFix(46.0, 0.1);

            expect(positions.map((p) => p.latitude)).toEqual([46.0]);
        });
    });

    describe('Étant donné un voyage complet simulé dans un wagon', () => {
        it('alors la source raconte fidèlement le voyage : attente, vitres athermiques, tunnel, sortie', () => {
            const { geolocalisation, cadenceur, avancerLeTemps, positions, erreurs } = banc();

            // Départ en gare couverte : 15 s sans le moindre signal.
            avancerLeTemps(15_000);
            cadenceur.battre();

            // Premier fix 25 s après le départ : cellulaire, précis à 2 km
            // seulement (loin des 500 m d'un GPS de plein ciel) — utilisé.
            avancerLeTemps(10_000);
            geolocalisation.emettreUnFix(48.72, 2.26, 2_000);

            // Pleine voie derrière des vitres athermiques : un fix par 2 s,
            // jamais mieux que 1,8 km. Le throttle n'en traite qu'un par 10 s.
            const latitudesDerriereLesVitres = [
                48.71, 48.7, 48.69, 48.68, 48.67, 48.66, 48.65, 48.64, 48.63, 48.62,
            ];
            for (const latitude of latitudesDerriereLesVitres) {
                avancerLeTemps(2_000);
                geolocalisation.emettreUnFix(latitude, 2.26, 1_800);
            }

            // Tunnel : une erreur passagère puis plus rien pendant deux minutes.
            avancerLeTemps(1_000);
            geolocalisation.emettreUneErreur(2);
            avancerLeTemps(14_000);
            cadenceur.battre();
            avancerLeTemps(30_000);
            cadenceur.battre();
            avancerLeTemps(75_000);
            cadenceur.battre();

            // Sortie de tunnel : le GPS de plein ciel revient, précis à 30 m.
            avancerLeTemps(5_000);
            geolocalisation.emettreUnFix(48.5, 2.2, 30);
            avancerLeTemps(10_000);
            cadenceur.battre();

            // Les positions traitées : la première, puis une par tranche de
            // 10 s pendant les vitres athermiques, puis la sortie de tunnel.
            expect(positions.map((position) => position.latitude)).toEqual([
                48.72, 48.67, 48.62, 48.5,
            ]);
            // Et le récit exact des messages d'état, dans l'ordre, rien de plus :
            // le retour du signal éteint l'alerte (aucun message après la sortie).
            expect(erreurs).toEqual([
                'En attente du signal GPS…',
                'Signal GPS perdu — dernière position il y a 1 min.',
                'Signal GPS perdu — dernière position il y a 2 min.',
            ]);
        });
    });
});
