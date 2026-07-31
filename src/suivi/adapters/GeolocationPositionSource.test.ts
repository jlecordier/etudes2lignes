import { describe, expect, it } from 'vitest';
import type { Coordonnee } from '../../trajets/domain/Coordonnee';
import type { EtatDeLaSource } from '../domain/etatDeLaSource';
import { verifierLeContratDePositionSource } from './contratDePositionSource';
import { FauxPremierPlan } from './fauxPremierPlan';
import {
    GeolocationPositionSource,
    type Cadenceur,
    type FournisseurDeGeolocalisation,
} from './GeolocationPositionSource';

interface Veille {
    readonly succes: PositionCallback;
    readonly erreur: PositionErrorCallback | null;
}

/** Géolocalisation simulée, pilotée à la main par le test. */
class FausseGeolocalisation implements FournisseurDeGeolocalisation {
    private prochainId = 1;
    private readonly veilles = new Map<number, Veille>();
    /**
     * La dernière veille enregistrée, gardée même après `clearWatch` : elle sert
     * à simuler un fix déjà en vol au moment où la surveillance est coupée.
     */
    private derniereVeille: Veille | null = null;

    watchPosition(succes: PositionCallback, erreur?: PositionErrorCallback | null): number {
        const id = this.prochainId++;
        const veille: Veille = { succes, erreur: erreur ?? null };
        this.veilles.set(id, veille);
        this.derniereVeille = veille;
        return id;
    }

    clearWatch(id: number): void {
        this.veilles.delete(id);
    }

    /** Combien de surveillances la source laisse ouvertes. */
    veillesOuvertes(): number {
        return this.veilles.size;
    }

    emettreUnFix(latitude: number, longitude: number, precision = 10): void {
        for (const veille of [...this.veilles.values()]) {
            veille.succes(fix(latitude, longitude, precision));
        }
    }

    /**
     * Un fix déjà acquis quand la surveillance est coupée : le système le livre
     * quand même au thread principal, après le `clearWatch`.
     */
    emettreUnFixEnRetard(latitude: number, longitude: number): void {
        this.derniereVeille?.succes(fix(latitude, longitude, 10));
    }

    emettreUneErreur(code: number): void {
        for (const veille of [...this.veilles.values()]) {
            veille.erreur?.({
                code,
                message: '',
                PERMISSION_DENIED: 1,
                POSITION_UNAVAILABLE: 2,
                TIMEOUT: 3,
            });
        }
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
    private prochainId = 1;
    private readonly minuteries = new Map<number, () => void>();

    toutesLes(_millisecondes: number, action: () => void): () => void {
        const id = this.prochainId++;
        this.minuteries.set(id, action);
        return () => {
            this.minuteries.delete(id);
        };
    }

    /** Combien de minuteries la source laisse tourner. */
    minuteriesEnCours(): number {
        return this.minuteries.size;
    }

    battre(): void {
        for (const action of [...this.minuteries.values()]) {
            action();
        }
    }
}

interface Banc {
    geolocalisation: FausseGeolocalisation;
    cadenceur: CadenceurManuel;
    premierPlan: FauxPremierPlan;
    avancerLeTemps: (ms: number) => void;
    source: GeolocationPositionSource;
    positions: Coordonnee[];
    etats: EtatDeLaSource[];
}

function banc(): Banc {
    const { geolocalisation, cadenceur, premierPlan, avancerLeTemps, source } = sourceNonDemarree();
    const positions: Coordonnee[] = [];
    const etats: EtatDeLaSource[] = [];
    source.demarrer(
        (position) => positions.push(position),
        (etat) => etats.push(etat),
    );
    return { geolocalisation, cadenceur, premierPlan, avancerLeTemps, source, positions, etats };
}

function sourceNonDemarree(): Omit<Banc, 'positions' | 'etats'> {
    const geolocalisation = new FausseGeolocalisation();
    const cadenceur = new CadenceurManuel();
    const premierPlan = new FauxPremierPlan();
    let tempsCourant = 0;
    const source = new GeolocationPositionSource({
        geolocalisation,
        maintenant: () => tempsCourant,
        cadenceur,
        premierPlan,
    });
    return {
        geolocalisation,
        cadenceur,
        premierPlan,
        avancerLeTemps: (ms) => {
            tempsCourant += ms;
        },
        source,
    };
}

function latitudes(positions: readonly Coordonnee[]): number[] {
    return positions.map((position) => position.latitude);
}

verifierLeContratDePositionSource('GeolocationPositionSource', () => {
    const { geolocalisation, cadenceur, premierPlan, avancerLeTemps, source } = sourceNonDemarree();
    return {
        source,
        emettreUnePosition: (position) => {
            // Le throttle de la source est laissé de côté ici : le contrat parle
            // de démarrage et d'arrêt, pas de cadence.
            avancerLeTemps(11_000);
            geolocalisation.emettreUnFix(position.latitude, position.longitude);
        },
        ressourcesTenues: () =>
            geolocalisation.veillesOuvertes() +
            cadenceur.minuteriesEnCours() +
            premierPlan.abonnements(),
    };
});

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

            expect(latitudes(positions)).toEqual([46.58]);
        });
    });

    describe('Étant donné un fix vraiment trop imprécis (5 km)', () => {
        it('alors il n’est pas transmis mais l’état mesure l’imprécision', () => {
            const { geolocalisation, positions, etats } = banc();

            geolocalisation.emettreUnFix(46.58, 0.34, 5_000);

            expect(positions).toEqual([]);
            expect(etats.at(-1)).toEqual({ etat: 'imprecise', imprecisionMetres: 5_000 });
        });

        it('alors le chien de garde parle d’imprécision, jamais de signal perdu', () => {
            const { geolocalisation, cadenceur, avancerLeTemps, etats } = banc();
            geolocalisation.emettreUnFix(46.0, 0.1);
            avancerLeTemps(60_000);
            geolocalisation.emettreUnFix(46.01, 0.11, 8_000);
            avancerLeTemps(10_000);

            cadenceur.battre();

            expect(etats.at(-1)).toEqual({ etat: 'imprecise', imprecisionMetres: 8_000 });
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

            expect(latitudes(positions)).toEqual([46.0, 46.2]);
        });
    });

    describe('Étant donné une permission refusée', () => {
        it('alors l’état dit que la permission est refusée', () => {
            const { geolocalisation, etats } = banc();

            geolocalisation.emettreUneErreur(1);

            expect(etats.at(-1)).toEqual({ etat: 'permission-refusee' });
        });
    });

    describe('Étant donné un appareil sans géolocalisation', () => {
        it('alors le démarrage annonce l’indisponibilité et rien n’est mis en place', () => {
            const premierPlan = new FauxPremierPlan();
            const cadenceur = new CadenceurManuel();
            // Aucune géolocalisation injectée et aucune sur la plateforme de test :
            // exactement la situation d'un navigateur en contexte non sécurisé.
            const source = new GeolocationPositionSource({ premierPlan, cadenceur });
            const etats: EtatDeLaSource[] = [];

            source.demarrer(
                () => {
                    throw new Error('aucune position ne peut arriver');
                },
                (etat) => etats.push(etat),
            );

            expect(etats).toEqual([{ etat: 'indisponible' }]);
            expect(cadenceur.minuteriesEnCours()).toBe(0);
            expect(premierPlan.abonnements()).toBe(0);
        });
    });

    describe('Étant donné une erreur passagère (position indisponible)', () => {
        it('alors rien n’est signalé tant que le dernier fix est frais', () => {
            const { geolocalisation, avancerLeTemps, etats } = banc();
            geolocalisation.emettreUnFix(46.0, 0.1);
            avancerLeTemps(2_000);

            geolocalisation.emettreUneErreur(2);

            // Rien de plus que l'attente annoncée au démarrage.
            expect(etats).toEqual([{ etat: 'attente' }]);
        });

        it('alors, après un long silence, l’état mesure l’ancienneté', () => {
            const { geolocalisation, avancerLeTemps, etats } = banc();
            geolocalisation.emettreUnFix(46.0, 0.1);
            avancerLeTemps(120_000);

            geolocalisation.emettreUneErreur(2);

            expect(etats.at(-1)).toEqual({ etat: 'perdue', ancienneteMs: 120_000 });
        });
    });

    describe('Étant donné un long silence du GPS', () => {
        it('alors, avant tout fix, le chien de garde signale l’attente', () => {
            const { cadenceur, avancerLeTemps, etats } = banc();

            avancerLeTemps(60_000);
            cadenceur.battre();

            expect(etats.at(-1)).toEqual({ etat: 'attente' });
        });

        it('alors, après un fix, l’état mesure l’ancienneté de la dernière position', () => {
            const { geolocalisation, cadenceur, avancerLeTemps, etats } = banc();
            geolocalisation.emettreUnFix(46.0, 0.1);

            avancerLeTemps(120_000);
            cadenceur.battre();

            expect(etats.at(-1)).toEqual({ etat: 'perdue', ancienneteMs: 120_000 });
        });

        it('alors un silence court ne déclenche rien', () => {
            const { geolocalisation, cadenceur, avancerLeTemps, etats } = banc();
            geolocalisation.emettreUnFix(46.0, 0.1);

            avancerLeTemps(10_000);
            cadenceur.battre();

            expect(etats).toEqual([{ etat: 'attente' }]);
        });
    });

    describe('Étant donné une source arrêtée', () => {
        it('alors plus aucune position n’est transmise et rien ne tourne derrière', () => {
            const { geolocalisation, cadenceur, premierPlan, source, positions } = banc();
            geolocalisation.emettreUnFix(46.0, 0.1);

            source.arreter();
            geolocalisation.emettreUnFix(46.2, 0.3);

            expect(latitudes(positions)).toEqual([46.0]);
            expect(geolocalisation.veillesOuvertes()).toBe(0);
            expect(cadenceur.minuteriesEnCours()).toBe(0);
            expect(premierPlan.abonnements()).toBe(0);
        });

        it('alors un fix déjà en vol au moment de l’arrêt est ignoré', () => {
            const { geolocalisation, source, positions, etats } = banc();
            geolocalisation.emettreUnFix(46.0, 0.1);

            source.arreter();
            geolocalisation.emettreUnFixEnRetard(46.9, 0.9);

            expect(latitudes(positions)).toEqual([46.0]);
            expect(etats).toEqual([{ etat: 'attente' }]);
        });
    });

    describe('Étant donné un retour au premier plan', () => {
        it('alors la surveillance redémarre et le prochain fix passe sans attendre le throttle', () => {
            const { geolocalisation, premierPlan, positions, avancerLeTemps } = banc();
            geolocalisation.emettreUnFix(46.0, 0.1);
            avancerLeTemps(2_000);

            premierPlan.revenirAuPremierPlan();
            geolocalisation.emettreUnFix(46.5, 0.5);

            expect(latitudes(positions)).toEqual([46.0, 46.5]);
        });

        it('alors des retours en rafale ne redémarrent pas la surveillance à chaque fois', () => {
            const { geolocalisation, premierPlan, positions, avancerLeTemps } = banc();
            geolocalisation.emettreUnFix(46.0, 0.1);
            avancerLeTemps(2_000);

            premierPlan.revenirAuPremierPlan();
            geolocalisation.emettreUnFix(46.1, 0.2);
            avancerLeTemps(2_000);
            // Second réveil 2 s plus tard : ignoré, le throttle n'est pas levé.
            premierPlan.revenirAuPremierPlan();
            geolocalisation.emettreUnFix(46.2, 0.3);

            expect(latitudes(positions)).toEqual([46.0, 46.1]);
        });

        it('alors un réveil reçu page masquée ne redémarre rien : le throttle reste en place', () => {
            const { geolocalisation, premierPlan, positions, avancerLeTemps } = banc();
            geolocalisation.emettreUnFix(46.0, 0.1);
            avancerLeTemps(2_000);

            premierPlan.masquerLaPage();
            premierPlan.emettreUnReveil();
            geolocalisation.emettreUnFix(46.5, 0.5);

            expect(latitudes(positions)).toEqual([46.0]);
        });
    });

    describe('Étant donné une acquisition lente au démarrage (gare couverte)', () => {
        it('alors un premier fix qui met 25 s à arriver n’est pas tué par le throttle', () => {
            const { geolocalisation, avancerLeTemps, positions } = banc();

            avancerLeTemps(25_000);
            geolocalisation.emettreUnFix(46.0, 0.1);

            expect(latitudes(positions)).toEqual([46.0]);
        });
    });

    describe('Étant donné un voyage complet simulé dans un wagon', () => {
        it('alors la source raconte fidèlement le voyage : attente, vitres athermiques, tunnel, sortie', () => {
            const { geolocalisation, cadenceur, avancerLeTemps, positions, etats } = banc();

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
            expect(latitudes(positions)).toEqual([48.72, 48.67, 48.62, 48.5]);
            // Et le récit exact des états mesurés, dans l'ordre, rien de plus :
            // le retour du signal éteint l'alerte (aucun état après la sortie).
            // C'est `texteDEtatDeLaSource` qui les met en phrases, pas la source.
            expect(etats).toEqual([
                { etat: 'attente' },
                { etat: 'attente' },
                { etat: 'perdue', ancienneteMs: 45_000 },
                { etat: 'perdue', ancienneteMs: 120_000 },
            ]);
        });
    });
});
