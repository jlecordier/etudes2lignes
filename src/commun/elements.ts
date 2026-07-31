/**
 * Fabrique des éléments d'interface partagés par les écrans.
 *
 * `dom.ts` interroge le DOM existant ; ce module en crée. Le bouton d'action
 * était auparavant recopié dans les deux écrans — d'où des intitulés accessibles
 * présents ici et oubliés là : `intitule` est donc **obligatoire**, l'oubli
 * devient impossible.
 */

/** Le bouton posé sur une image est minuscule : il porte une infobulle et n'éveille pas la zone sous lui. */
export type VarianteDeBouton = 'secondaire' | 'flottant';

export interface Bouton {
    readonly texte: string;
    /** Le nom accessible, lu par les lecteurs d'écran. Obligatoire. */
    readonly intitule: string;
    readonly action: () => void;
    readonly danger?: boolean;
    readonly variante?: VarianteDeBouton;
}

export function creerBouton(bouton: Bouton): HTMLButtonElement {
    const variante = bouton.variante ?? 'secondaire';
    const element = document.createElement('button');
    element.type = 'button';
    element.className = classes(variante, bouton.danger ?? false);
    element.textContent = bouton.texte;
    element.setAttribute('aria-label', bouton.intitule);
    if (variante === 'flottant') {
        element.title = bouton.intitule;
    }
    element.addEventListener('click', (evenement) => {
        if (variante === 'flottant') {
            // Sans cela, le clic atteindrait la zone de l'image sous le bouton,
            // qui y ajouterait ou déplacerait un point.
            evenement.stopPropagation();
        }
        bouton.action();
    });
    return element;
}

/**
 * Les quatre combinaisons sont écrites en clair, et non assemblées morceau par
 * morceau : une classe composée à l'exécution devient invisible à qui relit le
 * code comme aux outils qui traquent les règles CSS mortes.
 */
function classes(variante: VarianteDeBouton, danger: boolean): string {
    if (variante === 'flottant') {
        return danger ? 'secondaire bouton-flottant danger' : 'secondaire bouton-flottant';
    }
    return danger ? 'secondaire danger' : 'secondaire';
}
