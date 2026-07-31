// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { creerBouton } from './elements';

/** Une zone qui compte les clics qui l'atteignent : la zone d'image de l'éditeur en miniature. */
function zoneQuiCompteLesClics(): { zone: HTMLDivElement; clicsRecus: () => number } {
    let clics = 0;
    const zone = document.createElement('div');
    zone.addEventListener('click', () => {
        clics++;
    });
    document.body.replaceChildren(zone);
    return { zone, clicsRecus: () => clics };
}

describe('creerBouton', () => {
    describe('Étant donné un descriptif, quand je crée le bouton', () => {
        it('alors il porte son texte, son intitulé accessible et le type « button »', () => {
            const bouton = creerBouton({
                texte: '🗑️ Supprimer',
                intitule: 'Supprimer le point 1',
                action: () => undefined,
            });

            expect(bouton.type).toBe('button');
            expect(bouton.textContent).toBe('🗑️ Supprimer');
            expect(bouton.getAttribute('aria-label')).toBe('Supprimer le point 1');
            expect(bouton.className).toBe('secondaire');
        });
    });

    describe('Étant donné un bouton, quand je clique dessus', () => {
        it('alors son action se déclenche', () => {
            let declenchements = 0;
            const bouton = creerBouton({
                texte: '✏️ Renommer',
                intitule: 'Renommer Paris → Bordeaux',
                action: () => {
                    declenchements++;
                },
            });

            bouton.click();
            bouton.click();

            expect(declenchements).toBe(2);
        });
    });

    describe('Étant donné un bouton dangereux, quand je le crée', () => {
        it('alors il porte la classe « danger » en plus', () => {
            const bouton = creerBouton({
                texte: '🗑️ Supprimer',
                intitule: 'Supprimer page-1.jpg',
                action: () => undefined,
                danger: true,
            });

            expect(bouton.className).toBe('secondaire danger');
        });
    });

    describe('Étant donné un bouton flottant posé sur une zone, quand je clique dessus', () => {
        it('alors la zone sous lui ne reçoit pas le clic', () => {
            const { zone, clicsRecus } = zoneQuiCompteLesClics();
            let declenchements = 0;
            zone.append(
                creerBouton({
                    texte: '🗺️ Sur la carte',
                    intitule: 'Déplacer le point 1 sur la carte',
                    action: () => {
                        declenchements++;
                    },
                    variante: 'flottant',
                }),
            );

            zone.querySelector('button')?.click();

            expect(declenchements).toBe(1);
            expect(clicsRecus()).toBe(0);
        });

        it('alors il porte une infobulle, car son texte est minuscule', () => {
            const bouton = creerBouton({
                texte: '🗺️',
                intitule: 'Déplacer le point 2 sur la carte',
                action: () => undefined,
                variante: 'flottant',
            });

            expect(bouton.title).toBe('Déplacer le point 2 sur la carte');
            expect(bouton.className).toBe('secondaire bouton-flottant');
        });
    });

    describe('Étant donné un bouton secondaire posé sur une zone, quand je clique dessus', () => {
        it('alors le clic atteint la zone, contrairement au bouton flottant', () => {
            const { zone, clicsRecus } = zoneQuiCompteLesClics();
            zone.append(
                creerBouton({
                    texte: 'Ordinaire',
                    intitule: 'Un bouton ordinaire',
                    action: () => undefined,
                }),
            );

            zone.querySelector('button')?.click();

            expect(clicsRecus()).toBe(1);
        });
    });

    describe('Étant donné un bouton flottant dangereux, quand je le crée', () => {
        it('alors il cumule les deux classes', () => {
            const bouton = creerBouton({
                texte: '🗑️',
                intitule: 'Supprimer le point 3',
                action: () => undefined,
                danger: true,
                variante: 'flottant',
            });

            expect(bouton.className).toBe('secondaire bouton-flottant danger');
        });
    });
});
