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

/** Le pictogramme : ce que le bouton montre quand son libellé est masqué. */
function iconOf(button: HTMLButtonElement): string {
    return [...button.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? '')
        .join('');
}

function labelOf(button: HTMLButtonElement): string | null {
    return button.querySelector('.button-label')?.textContent ?? null;
}

describe('createButton', () => {
    describe('Étant donné un descriptif, quand je crée le bouton', () => {
        it('alors il porte son intitulé accessible et le type « button »', () => {
            const button = createButton({
                icon: '🗑️',
                label: 'Supprimer',
                ariaLabel: 'Supprimer le point 1',
                action: () => undefined,
            });

            expect(button.type).toBe('button');
            expect(button.getAttribute('aria-label')).toBe('Supprimer le point 1');
            expect(button.className).toBe('secondary');
        });

        it('alors le libellé vit dans son propre élément, que la feuille de style peut retirer', () => {
            const button = createButton({
                icon: '🗑️',
                label: 'Supprimer',
                ariaLabel: 'Supprimer le point 1',
                action: () => undefined,
            });

            // Sous 560 px seul le pictogramme reste : le libellé doit donc être
            // atteignable par un sélecteur, et le nom accessible vivre ailleurs.
            expect(iconOf(button)).toBe('🗑️');
            expect(labelOf(button)).toBe('Supprimer');
        });
    });

    describe('Étant donné un descriptif sans libellé, quand je crée le bouton', () => {
        it("alors il n'a pas d'élément de libellé du tout — il n'y a rien à masquer", () => {
            const button = createButton({
                icon: '🔼',
                ariaLabel: 'Monter page-1.png',
                action: () => undefined,
            });

            expect(iconOf(button)).toBe('🔼');
            expect(labelOf(button)).toBeNull();
        });
    });

    describe('Étant donné un bouton, quand je clique dessus', () => {
        it('alors son action se déclenche', () => {
            let declenchements = 0;
            const button = createButton({
                icon: '✏️',
                label: 'Renommer',
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
                icon: '🗑️',
                label: 'Supprimer',
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
                    icon: '🗺️',
                    label: 'Sur la carte',
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
                icon: '🗺️',
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
                    icon: '•',
                    label: 'Ordinaire',
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
                icon: '🗑️',
                ariaLabel: 'Supprimer le point 3',
                action: () => undefined,
                danger: true,
                variant: 'floating',
            });

            expect(button.className).toBe('secondary floating-button danger');
        });
    });
});
