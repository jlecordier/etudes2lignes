import { requireConfiguration } from './dom';
import { createTemplate } from './template';

/**
 * Déclare un écran-élément et rend sa fabrique.
 *
 * Le navigateur construit les custom elements lui-même — le parseur appelle
 * `new` — donc rien ne peut leur être passé par constructeur. La configuration
 * arrive par propriété, et la fabrique la pose **avant** de rendre l'élément :
 * `connectedCallback` la trouve donc toujours, sans état « configuré ou pas »
 * à interroger nulle part.
 *
 * `mount` reçoit trois choses et n'a rien d'autre à ranger :
 * - la racine de l'écran, où interroger le gabarit déjà cloné ;
 * - ses dépendances ;
 * - un signal avorté au détachement. Les écouteurs posés avec lui partent
 *   d'eux-mêmes, y compris ceux posés sur `window` ; y brancher `abort` suffit
 *   pour tout le reste (arrêter une source, démonter une carte). Les pages, elles,
 *   libèrent leurs URL d'objet en quittant le document avec l'écran.
 */
export function defineScreen<Dependencies>(
    tag: string,
    html: string,
    mount: (root: HTMLElement, dependencies: Dependencies, signal: AbortSignal) => void,
): (dependencies: Dependencies) => HTMLElement {
    const content = createTemplate(html);

    class ScreenElement extends HTMLElement {
        #dependencies: Dependencies | null = null;
        #abort: AbortController | null = null;

        set dependencies(value: Dependencies) {
            this.#dependencies = value;
        }

        connectedCallback(): void {
            const dependencies = requireConfiguration(this.#dependencies, this);
            const abort = new AbortController();
            this.#abort = abort;
            this.replaceChildren(content());
            mount(this, dependencies, abort.signal);
        }

        disconnectedCallback(): void {
            this.#abort?.abort();
            this.#abort = null;
        }
    }

    customElements.define(tag, ScreenElement);

    return (dependencies) => {
        const element = new ScreenElement();
        element.dependencies = dependencies;
        return element;
    };
}
