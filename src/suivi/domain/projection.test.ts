import { describe, expect, it } from 'vitest';
import { elementA } from '../../commun/tableau';
import { Coordonnee } from '../../trajets/domain/Coordonnee';
import { calculerCibleDeScroll, calculerDefilement, type EtapeDuVoyage } from './projection';

// Coordonnées réelles (approchées) de la LGV SEA, dans le sens Paris → Bordeaux.
const massy = Coordonnee.creer(48.7266, 2.2617);
const vendome = Coordonnee.creer(47.7565, 1.0203);
const poitiers = Coordonnee.creer(46.5802, 0.3404);
const angouleme = Coordonnee.creer(45.6484, 0.1562);
const marseille = Coordonnee.creer(43.2965, 5.3698);

function milieu(a: Coordonnee, b: Coordonnee): Coordonnee {
    return Coordonnee.creer((a.latitude + b.latitude) / 2, (a.longitude + b.longitude) / 2);
}

// Le document se lit de bas en haut : les offsets DIMINUENT quand le voyage avance.
const etapesSurUnePage: EtapeDuVoyage[] = [
    { coordonnee: massy, offset: 9000 },
    { coordonnee: vendome, offset: 6000 },
    { coordonnee: poitiers, offset: 3000 },
];

describe('calculerCibleDeScroll', () => {
    describe('Étant donné moins de deux étapes', () => {
        it('alors le suivi est impossible', () => {
            expect(calculerCibleDeScroll([], massy, null)).toEqual({ etat: 'pas-assez-de-points' });
            expect(calculerCibleDeScroll([elementA(etapesSurUnePage, 0)], massy, null)).toEqual({
                etat: 'pas-assez-de-points',
            });
        });
    });

    describe('Étant donné une position exactement sur une étape', () => {
        it('alors la cible est l’offset de cette étape', () => {
            const resultat = calculerCibleDeScroll(etapesSurUnePage, vendome, null);

            expect(resultat.etat).toBe('sur-trajet');
            if (resultat.etat === 'sur-trajet') {
                expect(resultat.scrollCible).toBeCloseTo(6000, 0);
            }
        });
    });

    describe('Étant donné une position à mi-chemin entre deux étapes', () => {
        it('alors la cible est interpolée à mi-hauteur entre leurs offsets', () => {
            const resultat = calculerCibleDeScroll(etapesSurUnePage, milieu(massy, vendome), null);

            expect(resultat.etat).toBe('sur-trajet');
            if (resultat.etat === 'sur-trajet') {
                expect(resultat.scrollCible).toBeGreaterThan(7400);
                expect(resultat.scrollCible).toBeLessThan(7600);
            }
        });
    });

    describe('Étant donné une position avant la première étape ou après la dernière', () => {
        it('alors la cible est bornée à la première (ou dernière) étape', () => {
            const avantMassy = Coordonnee.creer(48.8, 2.35);
            const apresPoitiers = Coordonnee.creer(46.5, 0.33);

            const avant = calculerCibleDeScroll(etapesSurUnePage, avantMassy, null);
            const apres = calculerCibleDeScroll(etapesSurUnePage, apresPoitiers, null);

            expect(avant.etat).toBe('sur-trajet');
            if (avant.etat === 'sur-trajet') {
                expect(avant.scrollCible).toBeCloseTo(9000, 0);
            }
            expect(apres.etat).toBe('sur-trajet');
            if (apres.etat === 'sur-trajet') {
                expect(apres.scrollCible).toBeCloseTo(3000, 0);
            }
        });
    });

    describe('Étant donné une position très loin du trajet (Marseille)', () => {
        it('alors on est hors trajet, avec la distance en mètres', () => {
            const resultat = calculerCibleDeScroll(etapesSurUnePage, marseille, null);

            expect(resultat.etat).toBe('hors-trajet');
            if (resultat.etat === 'hors-trajet') {
                expect(resultat.distanceMetres).toBeGreaterThan(100_000);
            }
        });
    });

    describe('Étant donné le seuil adaptatif « hors trajet »', () => {
        // 0,1° de longitude à cette latitude ≈ 7,7 km d'écart avec une ligne à lon 0,2.
        const ecartDe7700m = Coordonnee.creer(46.12, 0.1);

        it('alors ~7,7 km d’écart sur un segment court (~10 km) déclenchent « hors trajet »', () => {
            const segmentCourt: EtapeDuVoyage[] = [
                { coordonnee: Coordonnee.creer(46.16, 0.2), offset: 2000 },
                { coordonnee: Coordonnee.creer(46.07, 0.2), offset: 1000 },
            ];

            expect(calculerCibleDeScroll(segmentCourt, ecartDe7700m, null).etat).toBe(
                'hors-trajet',
            );
        });

        it('alors un écart comparable sur un segment long (~110 km) reste « sur trajet »', () => {
            const segmentLong: EtapeDuVoyage[] = [
                { coordonnee: poitiers, offset: 3000 },
                { coordonnee: angouleme, offset: 1000 },
            ];

            expect(calculerCibleDeScroll(segmentLong, ecartDe7700m, null).etat).toBe('sur-trajet');
        });
    });

    describe('Étant donné une jonction de pages (même lieu en haut de page 1 et en bas de page 2)', () => {
        // Lecture bas → haut : page 1 va de 7000 (bas) à 3600 (haut),
        // page 2 de 14000 (bas) à 10500. Poitiers est dupliqué à la jonction.
        const etapesSurDeuxPages: EtapeDuVoyage[] = [
            { coordonnee: vendome, offset: 6000 },
            { coordonnee: poitiers, offset: 3600 },
            { coordonnee: poitiers, offset: 13900 },
            { coordonnee: angouleme, offset: 10500 },
        ];
        // ~0,0016° de latitude ≈ 180 m ; de quoi simuler le bruit GPS autour de la jonction.
        const unPeuAvantPoitiers = Coordonnee.creer(46.5818, 0.3414);
        const unPeuApresPoitiers = Coordonnee.creer(46.5786, 0.3394);
        const bienApresPoitiers = Coordonnee.creer(46.49, 0.32);

        it('alors le segment de longueur nulle ne fait pas diviser par zéro', () => {
            const resultat = calculerCibleDeScroll(etapesSurDeuxPages, poitiers, null);

            expect(resultat.etat).toBe('sur-trajet');
        });

        it('alors du bruit GPS autour de la jonction ne fait pas osciller la page', () => {
            let precedent: { indexSegment: number; scrollCible: number } | null = {
                indexSegment: 0,
                scrollCible: 3600,
            };
            const cibles: number[] = [];
            const bruit = [unPeuAvantPoitiers, unPeuApresPoitiers, unPeuAvantPoitiers, poitiers];

            for (const position of bruit) {
                const resultat = calculerCibleDeScroll(etapesSurDeuxPages, position, precedent);
                expect(resultat.etat).toBe('sur-trajet');
                if (resultat.etat === 'sur-trajet') {
                    precedent = resultat;
                    cibles.push(resultat.scrollCible);
                }
            }

            // Toutes les cibles restent sur la page 1 (autour de 3600), aucune ne saute vers 13900.
            for (const cible of cibles) {
                expect(cible).toBeLessThan(7000);
            }
        });

        it('alors, une fois passé en page 2, du bruit GPS juste derrière la jonction ne fait pas resauter la page 1', () => {
            const dejaSurLaPage2 = { indexSegment: 2, scrollCible: 13000 };

            const resultat = calculerCibleDeScroll(
                etapesSurDeuxPages,
                unPeuAvantPoitiers,
                dejaSurLaPage2,
            );

            expect(resultat.etat).toBe('sur-trajet');
            if (resultat.etat === 'sur-trajet') {
                expect(resultat.scrollCible).toBeGreaterThan(10000);
            }
        });

        it('alors une fois la jonction nettement passée, la cible bascule en bas de la page 2', () => {
            const resultat = calculerCibleDeScroll(etapesSurDeuxPages, bienApresPoitiers, {
                indexSegment: 0,
                scrollCible: 3600,
            });

            expect(resultat.etat).toBe('sur-trajet');
            if (resultat.etat === 'sur-trajet') {
                expect(resultat.scrollCible).toBeGreaterThan(10500);
                expect(resultat.scrollCible).toBeLessThanOrEqual(13900);
            }
        });
    });
});

describe('calculerDefilement', () => {
    describe('Étant donné une cible au milieu du document', () => {
        it('alors le défilement place la cible aux trois quarts de l’écran (un quart du bas)', () => {
            // cible 5000, écran 800 → la cible doit être à 600 px du haut → scrollTop 4400.
            expect(calculerDefilement(5000, 800, 20000)).toBe(4400);
        });
    });

    describe('Étant donné une cible proche du haut ou du bas du document', () => {
        it('alors le défilement est borné aux limites du document', () => {
            expect(calculerDefilement(100, 800, 20000)).toBe(0);
            expect(calculerDefilement(19950, 800, 20000)).toBe(19200);
        });
    });
});
