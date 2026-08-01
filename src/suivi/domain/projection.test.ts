import { describe, expect, it } from 'vitest';
import { requireElementAt } from '../../shared/array';
import { Coordonnee } from '../../trajets/domain/Coordonnee';
import {
    computeScrollTarget,
    computeScroll,
    type AncragePrecedent,
    type EtapeDuVoyage,
} from './projection';

// Coordonnées réelles (approchées) de la LGV SEA, dans le sens Paris → Bordeaux.
const massy = Coordonnee.create(48.7266, 2.2617);
const vendome = Coordonnee.create(47.7565, 1.0203);
const poitiers = Coordonnee.create(46.5802, 0.3404);
const angouleme = Coordonnee.create(45.6484, 0.1562);
const marseille = Coordonnee.create(43.2965, 5.3698);

function milieu(a: Coordonnee, b: Coordonnee): Coordonnee {
    return Coordonnee.create((a.latitude + b.latitude) / 2, (a.longitude + b.longitude) / 2);
}

// Le document se lit de bas en haut : les offsets DIMINUENT quand le voyage avance.
const etapesOnOnePage: EtapeDuVoyage[] = [
    { coordonnee: massy, offset: 9000 },
    { coordonnee: vendome, offset: 6000 },
    { coordonnee: poitiers, offset: 3000 },
];

describe('calculerCibleDeScroll', () => {
    describe('Étant donné moins de deux étapes', () => {
        it('alors le suivi est impossible', () => {
            expect(computeScrollTarget([], massy, null)).toEqual({ kind: 'pas-assez-de-points' });
            expect(
                computeScrollTarget([requireElementAt(etapesOnOnePage, 0)], massy, null),
            ).toEqual({
                kind: 'pas-assez-de-points',
            });
        });
    });

    describe('Étant donné une position exactement sur une étape', () => {
        it('alors la cible est l’offset de cette étape', () => {
            const result = computeScrollTarget(etapesOnOnePage, vendome, null);

            expect(result.kind).toBe('sur-trajet');
            if (result.kind === 'sur-trajet') {
                expect(result.scrollTarget).toBeCloseTo(6000, 0);
            }
        });
    });

    describe('Étant donné une position à mi-chemin entre deux étapes', () => {
        it('alors la cible est interpolée à mi-hauteur entre leurs offsets', () => {
            const result = computeScrollTarget(etapesOnOnePage, milieu(massy, vendome), null);

            expect(result.kind).toBe('sur-trajet');
            if (result.kind === 'sur-trajet') {
                expect(result.scrollTarget).toBeGreaterThan(7400);
                expect(result.scrollTarget).toBeLessThan(7600);
            }
        });
    });

    describe('Étant donné une position avant la première étape ou après la dernière', () => {
        it('alors la cible est bornée à la première (ou dernière) étape', () => {
            const beforeMassy = Coordonnee.create(48.8, 2.35);
            const afterPoitiers = Coordonnee.create(46.5, 0.33);

            const before = computeScrollTarget(etapesOnOnePage, beforeMassy, null);
            const after = computeScrollTarget(etapesOnOnePage, afterPoitiers, null);

            expect(before.kind).toBe('sur-trajet');
            if (before.kind === 'sur-trajet') {
                expect(before.scrollTarget).toBeCloseTo(9000, 0);
            }
            expect(after.kind).toBe('sur-trajet');
            if (after.kind === 'sur-trajet') {
                expect(after.scrollTarget).toBeCloseTo(3000, 0);
            }
        });
    });

    describe('Étant donné une position très loin du trajet (Marseille)', () => {
        it('alors on est hors trajet, avec la distance en mètres', () => {
            const result = computeScrollTarget(etapesOnOnePage, marseille, null);

            expect(result.kind).toBe('hors-trajet');
            if (result.kind === 'hors-trajet') {
                expect(result.distanceMetres).toBeGreaterThan(100_000);
            }
        });
    });

    describe('Étant donné le seuil adaptatif « hors trajet »', () => {
        // 0,1° de longitude à cette latitude ≈ 7,7 km d'écart avec une ligne à lon 0,2.
        const gapOf7700m = Coordonnee.create(46.12, 0.1);

        it('alors ~7,7 km d’écart sur un segment court (~10 km) déclenchent « hors trajet »', () => {
            const segmentCourt: EtapeDuVoyage[] = [
                { coordonnee: Coordonnee.create(46.16, 0.2), offset: 2000 },
                { coordonnee: Coordonnee.create(46.07, 0.2), offset: 1000 },
            ];

            expect(computeScrollTarget(segmentCourt, gapOf7700m, null).kind).toBe('hors-trajet');
        });

        it('alors un écart comparable sur un segment long (~110 km) reste « sur trajet »', () => {
            const segmentLong: EtapeDuVoyage[] = [
                { coordonnee: poitiers, offset: 3000 },
                { coordonnee: angouleme, offset: 1000 },
            ];

            expect(computeScrollTarget(segmentLong, gapOf7700m, null).kind).toBe('sur-trajet');
        });
    });

    describe('Étant donné une jonction de pages (même lieu en haut de page 1 et en bas de page 2)', () => {
        // Lecture bas → haut : page 1 va de 7000 (bas) à 3600 (haut),
        // page 2 de 14000 (bas) à 10500. Poitiers est dupliqué à la jonction.
        const etapesOnTwoPages: EtapeDuVoyage[] = [
            { coordonnee: vendome, offset: 6000 },
            { coordonnee: poitiers, offset: 3600 },
            { coordonnee: poitiers, offset: 13900 },
            { coordonnee: angouleme, offset: 10500 },
        ];
        // ~0,0016° de latitude ≈ 180 m ; de quoi simuler le bruit GPS autour de la jonction.
        const slightlyBeforePoitiers = Coordonnee.create(46.5818, 0.3414);
        const slightlyAfterPoitiers = Coordonnee.create(46.5786, 0.3394);
        const wellAfterPoitiers = Coordonnee.create(46.49, 0.32);

        it('alors le segment dégénéré ne fait pas diviser par zéro', () => {
            const result = computeScrollTarget(etapesOnTwoPages, poitiers, null);

            expect(result.kind).toBe('sur-trajet');
        });

        /**
         * Le trajet le plus court que le domaine autorise — deux points — peut
         * n'avoir qu'un seul segment, et ce segment peut être dégénéré : rien
         * n'empêche de géo-référencer deux fois le même PK. Ici, aucun segment
         * voisin ne peut sauver la mise : si la garde tombe, la cible devient
         * `NaN` et la page reste collée en haut du document pendant tout le
         * voyage, sans que rien ne le signale.
         */
        it('alors un trajet réduit à un segment dégénéré rend quand même une cible chiffrée', () => {
            const aSingleDegenerateSegment: EtapeDuVoyage[] = [
                { coordonnee: poitiers, offset: 7000 },
                { coordonnee: poitiers, offset: 3000 },
            ];

            const result = computeScrollTarget(aSingleDegenerateSegment, poitiers, null);

            expect(result).toEqual({ kind: 'sur-trajet', scrollTarget: 7000 });
        });

        it('alors du bruit GPS autour de la jonction ne fait pas osciller la page', () => {
            let previous: AncragePrecedent | null = { scrollTarget: 3600 };
            const cibles: number[] = [];
            const bruit = [
                slightlyBeforePoitiers,
                slightlyAfterPoitiers,
                slightlyBeforePoitiers,
                poitiers,
            ];

            for (const position of bruit) {
                const result = computeScrollTarget(etapesOnTwoPages, position, previous);
                expect(result.kind).toBe('sur-trajet');
                if (result.kind === 'sur-trajet') {
                    previous = result;
                    cibles.push(result.scrollTarget);
                }
            }

            // Toutes les cibles restent sur la page 1 (autour de 3600), aucune ne saute vers 13900.
            for (const target of cibles) {
                expect(target).toBeLessThan(7000);
            }
        });

        it('alors, une fois passé en page 2, du bruit GPS juste derrière la jonction ne fait pas resauter la page 1', () => {
            const alreadyOnPage2: AncragePrecedent = { scrollTarget: 13000 };

            const result = computeScrollTarget(
                etapesOnTwoPages,
                slightlyBeforePoitiers,
                alreadyOnPage2,
            );

            expect(result.kind).toBe('sur-trajet');
            if (result.kind === 'sur-trajet') {
                expect(result.scrollTarget).toBeGreaterThan(10000);
            }
        });

        it('alors une fois la jonction nettement passée, la cible bascule en bas de la page 2', () => {
            const result = computeScrollTarget(etapesOnTwoPages, wellAfterPoitiers, {
                scrollTarget: 3600,
            });

            expect(result.kind).toBe('sur-trajet');
            if (result.kind === 'sur-trajet') {
                expect(result.scrollTarget).toBeGreaterThan(10500);
                expect(result.scrollTarget).toBeLessThanOrEqual(13900);
            }
        });
    });
});

describe('calculerDefilement', () => {
    describe('Étant donné une cible au milieu du document', () => {
        it('alors le défilement place la cible aux trois quarts de l’écran (un quart du bas)', () => {
            // cible 5000, écran 800 → la cible doit être à 600 px du haut → scrollTop 4400.
            expect(computeScroll(5000, 800, 20000)).toBe(4400);
        });
    });

    describe('Étant donné une cible proche du haut ou du bas du document', () => {
        it('alors le défilement est borné aux limites du document', () => {
            expect(computeScroll(100, 800, 20000)).toBe(0);
            expect(computeScroll(19950, 800, 20000)).toBe(19200);
        });
    });
});
