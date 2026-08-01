/**
 * Fabrique des éléments d'interface partagés par les écrans.
 *
 * `dom.ts` interroge le DOM existant ; ce module en crée. Le bouton d'action
 * était auparavant recopié dans les deux écrans — d'où des intitulés accessibles
 * présents ici et oubliés là : `ariaLabel` est donc **obligatoire**, l'oubli
 * devient impossible.
 */

/** Le bouton posé sur une image est minuscule : il porte une infobulle et n'éveille pas la zone sous lui. */
export type ButtonVariant = 'secondary' | 'floating';

export interface Button {
    readonly text: string;
    /** Le nom accessible, lu par les lecteurs d'écran. Obligatoire. */
    readonly ariaLabel: string;
    readonly action: () => void;
    readonly danger?: boolean;
    readonly variant?: ButtonVariant;
}

export function createButton(button: Button): HTMLButtonElement {
    const variant = button.variant ?? 'secondary';
    const element = document.createElement('button');
    element.type = 'button';
    element.className = classes(variant, button.danger ?? false);
    element.textContent = button.text;
    element.setAttribute('aria-label', button.ariaLabel);
    if (variant === 'floating') {
        element.title = button.ariaLabel;
    }
    element.addEventListener('click', (event) => {
        if (variant === 'floating') {
            // Sans cela, le clic atteindrait la zone de l'image sous le bouton,
            // qui y ajouterait ou déplacerait un point.
            event.stopPropagation();
        }
        button.action();
    });
    return element;
}

/**
 * Les quatre combinaisons sont écrites en clair, et non assemblées morceau par
 * morceau : une classe composée à l'exécution devient invisible à qui relit le
 * code comme aux outils qui traquent les règles CSS mortes.
 */
function classes(variant: ButtonVariant, danger: boolean): string {
    if (variant === 'floating') {
        return danger ? 'secondary floating-button danger' : 'secondary floating-button';
    }
    return danger ? 'secondary danger' : 'secondary';
}
