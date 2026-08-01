// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createButton } from './elements';

/** Une zone qui compte les clics qui l'atteignent : la zone d'image de l'éditeur en miniature. */
function clickCountingArea(): { area: HTMLDivElement; clicksReceived: () => number } {
    let clicks = 0;
    const area = document.createElement('div');
    area.addEventListener('click', () => {
        clicks++;
    });
    document.body.replaceChildren(area);
    return { area, clicksReceived: () => clicks };
}

describe('createButton', () => {
    describe('Étant donné un descriptif, quand je crée le bouton', () => {
        it('alors il porte son texte, son intitulé accessible et le type « button »', () => {
            const button = createButton({
                text: '🗑️ Supprimer',
                ariaLabel: 'Supprimer le point 1',
                action: () => undefined,
            });

            expect(button.type).toBe('button');
            expect(button.textContent).toBe('🗑️ Supprimer');
            expect(button.getAttribute('aria-label')).toBe('Supprimer le point 1');
            expect(button.className).toBe('secondary');
        });
    });

    describe('Étant donné un bouton, quand je clique dessus', () => {
        it('alors son action se déclenche', () => {
            let declenchements = 0;
            const button = createButton({
                text: '✏️ Renommer',
                ariaLabel: 'Renommer Paris → Bordeaux',
                action: () => {
                    declenchements++;
                },
            });

            button.click();
            button.click();

            expect(declenchements).toBe(2);
        });
    });

    describe('Étant donné un bouton dangereux, quand je le crée', () => {
        it('alors il porte la classe « danger » en plus', () => {
            const button = createButton({
                text: '🗑️ Supprimer',
                ariaLabel: 'Supprimer page-1.jpg',
                action: () => undefined,
                danger: true,
            });

            expect(button.className).toBe('secondary danger');
        });
    });

    describe('Étant donné un bouton flottant posé sur une zone, quand je clique dessus', () => {
        it('alors la zone sous lui ne reçoit pas le clic', () => {
            const { area, clicksReceived } = clickCountingArea();
            let declenchements = 0;
            area.append(
                createButton({
                    text: '🗺️ Sur la carte',
                    ariaLabel: 'Déplacer le point 1 sur la carte',
                    action: () => {
                        declenchements++;
                    },
                    variant: 'floating',
                }),
            );

            area.querySelector('button')?.click();

            expect(declenchements).toBe(1);
            expect(clicksReceived()).toBe(0);
        });

        it('alors il porte une infobulle, car son texte est minuscule', () => {
            const button = createButton({
                text: '🗺️',
                ariaLabel: 'Déplacer le point 2 sur la carte',
                action: () => undefined,
                variant: 'floating',
            });

            expect(button.title).toBe('Déplacer le point 2 sur la carte');
            expect(button.className).toBe('secondary floating-button');
        });
    });

    describe('Étant donné un bouton secondaire posé sur une zone, quand je clique dessus', () => {
        it('alors le clic atteint la zone, contrairement au bouton flottant', () => {
            const { area, clicksReceived } = clickCountingArea();
            area.append(
                createButton({
                    text: 'Ordinaire',
                    ariaLabel: 'Un bouton ordinaire',
                    action: () => undefined,
                }),
            );

            area.querySelector('button')?.click();

            expect(clicksReceived()).toBe(1);
        });
    });

    describe('Étant donné un bouton flottant dangereux, quand je le crée', () => {
        it('alors il cumule les deux classes', () => {
            const button = createButton({
                text: '🗑️',
                ariaLabel: 'Supprimer le point 3',
                action: () => undefined,
                danger: true,
                variant: 'floating',
            });

            expect(button.className).toBe('secondary floating-button danger');
        });
    });
});
