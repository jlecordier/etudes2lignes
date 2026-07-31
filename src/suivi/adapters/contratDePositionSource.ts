import { describe, expect, it } from 'vitest';
import { Coordonnee } from '../../trajets/domain/Coordonnee';
import type { EtatDeLaSource } from '../domain/etatDeLaSource';
import type { PositionSource } from '../ports/PositionSource';

/**
 * Le banc d'essai d'une source de position : la source, le moyen de faire
 * émettre une position par la plateforme qui l'alimente (GPS simulé, main de
 * l'utilisateur…), et le compte des ressources qu'elle tient encore.
 */
export interface BancDeSource {
    readonly source: PositionSource;
    /** Fait émettre une position par la plateforme sous-jacente. */
    emettreUnePosition(position: Coordonnee): void;
    /**
     * Les ressources que la source tient sur sa plateforme : surveillance
     * ouverte, minuterie, abonnement au premier plan. Le contrat exige qu'elles
     * retombent à zéro après `arreter` et qu'un second `demarrer` n'en
     * accumule pas.
     */
    ressourcesTenues(): number;
}

interface Abonnement {
    readonly positions: Coordonnee[];
    readonly etats: EtatDeLaSource[];
}

const poitiers = Coordonnee.creer(46.5802, 0.3404);
const angouleme = Coordonnee.creer(45.6484, 0.1562);

function demarrer(source: PositionSource): Abonnement {
    const positions: Coordonnee[] = [];
    const etats: EtatDeLaSource[] = [];
    source.demarrer(
        (position) => positions.push(position),
        (etat) => etats.push(etat),
    );
    return { positions, etats };
}

function latitudes(positions: readonly Coordonnee[]): number[] {
    return positions.map((position) => position.latitude);
}

/**
 * La suite de contrat du port `PositionSource`, jouée contre chacun de ses
 * adapters : c'est elle qui les empêche de diverger à nouveau sur ce que « démarrer »
 * et « arrêter » veulent dire.
 */
export function verifierLeContratDePositionSource(
    nom: string,
    creerLeBanc: () => BancDeSource,
): void {
    describe(`Contrat de PositionSource — ${nom}`, () => {
        describe('Étant donné une source qui démarre, quand aucune position n’est encore arrivée', () => {
            it('alors elle annonce l’attente, sous forme d’état du domaine et non de phrase', () => {
                const banc = creerLeBanc();

                const abonnement = demarrer(banc.source);

                expect(abonnement.etats).toEqual([{ etat: 'attente' }]);
                expect(abonnement.positions).toEqual([]);
            });
        });

        describe('Étant donné une source démarrée puis arrêtée, quand la plateforme émet encore une position', () => {
            it('alors aucun rappel n’est reçu et plus aucune ressource n’est tenue', () => {
                const banc = creerLeBanc();
                const abonnement = demarrer(banc.source);
                banc.emettreUnePosition(poitiers);

                banc.source.arreter();
                banc.emettreUnePosition(angouleme);

                expect(latitudes(abonnement.positions)).toEqual([poitiers.latitude]);
                expect(abonnement.etats).toEqual([{ etat: 'attente' }]);
                expect(banc.ressourcesTenues()).toBe(0);
            });
        });

        describe('Étant donné une source arrêtée, quand je la redémarre', () => {
            it('alors elle émet à nouveau', () => {
                const banc = creerLeBanc();
                demarrer(banc.source);
                banc.emettreUnePosition(poitiers);
                banc.source.arreter();

                const abonnement = demarrer(banc.source);
                banc.emettreUnePosition(angouleme);

                expect(abonnement.positions.at(-1)).toEqual(angouleme);
            });
        });

        describe('Étant donné une source déjà démarrée, quand je la démarre une seconde fois', () => {
            it('alors la position n’arrive qu’une fois, au dernier abonné, et rien ne s’accumule', () => {
                const banc = creerLeBanc();
                const premier = demarrer(banc.source);
                const ressourcesDUneSeuleSession = banc.ressourcesTenues();

                const second = demarrer(banc.source);
                banc.emettreUnePosition(poitiers);

                expect(latitudes(premier.positions)).toEqual([]);
                expect(latitudes(second.positions)).toEqual([poitiers.latitude]);
                expect(banc.ressourcesTenues()).toBe(ressourcesDUneSeuleSession);
            });

            it('alors un seul « arrêter » suffit à tout couper : aucune session fantôme ne survit', () => {
                const banc = creerLeBanc();
                const premier = demarrer(banc.source);
                const second = demarrer(banc.source);

                banc.source.arreter();
                banc.emettreUnePosition(poitiers);

                expect(latitudes(premier.positions)).toEqual([]);
                expect(latitudes(second.positions)).toEqual([]);
                expect(banc.ressourcesTenues()).toBe(0);
            });
        });
    });
}
