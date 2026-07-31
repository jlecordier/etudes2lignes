import { describe, expect, it } from 'vitest';
import { texteDEtatDeLaSource, texteDEtatDuSuivi } from './presentation';

describe('texteDEtatDuSuivi', () => {
    describe('Étant donné un trajet sans assez de points', () => {
        it('alors le texte invite à géo-référencer', () => {
            expect(texteDEtatDuSuivi({ etat: 'pas-assez-de-points' })).toBe(
                'Ajoutez au moins deux points géo-référencés pour activer le suivi.',
            );
        });
    });

    describe('Étant donné une position hors trajet', () => {
        it('alors le texte donne la distance en kilomètres arrondis', () => {
            expect(texteDEtatDuSuivi({ etat: 'hors-trajet', distanceMetres: 12_400 })).toBe(
                'Hors trajet (à 12 km de la ligne).',
            );
        });
    });

    describe('Étant donné une position sur le trajet', () => {
        it('alors aucun texte d’état n’est affiché', () => {
            expect(texteDEtatDuSuivi({ etat: 'sur-trajet', scrollCible: 100 })).toBe('');
        });
    });
});

describe('texteDEtatDeLaSource', () => {
    describe('Étant donné une source qui attend encore sa première position', () => {
        it('alors le texte annonce l’attente du signal', () => {
            expect(texteDEtatDeLaSource({ etat: 'attente' })).toBe('En attente du signal GPS…');
        });
    });

    describe('Étant donné un état « imprécise » à 2 400 m', () => {
        it('alors le texte donne l’imprécision en kilomètres arrondis', () => {
            expect(texteDEtatDeLaSource({ etat: 'imprecise', imprecisionMetres: 2_400 })).toBe(
                'Position approximative (± 2 km) — trop imprécise pour caler la page.',
            );
        });

        it('alors une imprécision inférieure au kilomètre s’annonce quand même « ± 1 km »', () => {
            expect(texteDEtatDeLaSource({ etat: 'imprecise', imprecisionMetres: 400 })).toBe(
                'Position approximative (± 1 km) — trop imprécise pour caler la page.',
            );
        });
    });

    describe('Étant donné un état « perdue » depuis deux minutes', () => {
        it('alors le texte donne l’ancienneté de la dernière position', () => {
            expect(texteDEtatDeLaSource({ etat: 'perdue', ancienneteMs: 120_000 })).toBe(
                'Signal GPS perdu — dernière position il y a 2 min.',
            );
        });

        it('alors un silence de moins d’une minute s’annonce quand même « 1 min »', () => {
            expect(texteDEtatDeLaSource({ etat: 'perdue', ancienneteMs: 20_000 })).toBe(
                'Signal GPS perdu — dernière position il y a 1 min.',
            );
        });
    });

    describe('Étant donné une permission de localisation refusée', () => {
        it('alors le texte explique comment autoriser la localisation', () => {
            expect(texteDEtatDeLaSource({ etat: 'permission-refusee' })).toBe(
                'Accès à la position refusé — autorisez la localisation pour ce site puis revenez.',
            );
        });
    });

    describe('Étant donné un appareil sans géolocalisation', () => {
        it('alors le texte le dit sans jargon', () => {
            expect(texteDEtatDeLaSource({ etat: 'indisponible' })).toBe(
                'La géolocalisation n’est pas disponible sur cet appareil.',
            );
        });
    });
});
