/**
 * Une page de schéma affichée, et **le propriétaire** de son URL d'objet.
 *
 * L'attachement au document décide de tout : la page monte son image en
 * arrivant, la libère en partant. Auparavant, une pile tenait une `Map` des
 * pages affichées et une convention disait quand révoquer — révoquer sans
 * retirer le `<img>` ne libère d'ailleurs rien du tout, la page décodée
 * (une trentaine de mégaoctets) restant en mémoire. Ici c'est le navigateur qui
 * garantit le cycle de vie, pas nous.
 */
import html from './SchemaPage.html?raw';
import { query, requireConfiguration } from './dom';
import { createTemplate } from './template';

/** Une page à afficher. `ImageDeTrajet` s'y assigne : aucun domaine n'est requis. */
export interface DisplayablePage {
    readonly id: string;
    readonly nom: string;
    readonly blob: Blob;
    readonly largeur: number;
    readonly hauteur: number;
}

/** La création d'URL d'objet, injectable pour que les tests observent les libérations. */
export interface ObjectUrls {
    create(blob: Blob): string;
    revoke(url: string): void;
}

const browserUrls: ObjectUrls = {
    create: (blob) => URL.createObjectURL(blob),
    revoke: (url) => {
        URL.revokeObjectURL(url);
    },
};

const content = createTemplate(html);

export class SchemaPageElement extends HTMLElement {
    #page: DisplayablePage | null = null;
    #urls: ObjectUrls = browserUrls;
    #url: string | null = null;

    set page(value: DisplayablePage) {
        this.#page = value;
    }

    set urls(value: ObjectUrls) {
        this.#urls = value;
    }

    /** L'identifiant de la page affichée, pour la retrouver dans la pile. */
    get pageId(): string {
        return requireConfiguration(this.#page, this).id;
    }

    connectedCallback(): void {
        // Déjà montée : c'est un simple déplacement dans le document, pas une
        // arrivée. Remonter ici fabriquerait une seconde URL et perdrait la
        // première, que la microtâche de départ ne libérera pas.
        if (this.#url !== null) {
            return;
        }
        const page = requireConfiguration(this.#page, this);
        const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
        const url = this.#urls.create(page.blob);
        this.#url = url;
        root.replaceChildren(content());

        const image = query('img', HTMLImageElement, root);
        image.src = url;
        image.alt = page.nom;
        // Réservées avant tout décodage : la mise en page est figée, donc les
        // offsets restent stables quand les images arrivent en différé.
        image.width = page.largeur;
        image.height = page.hauteur;
    }

    disconnectedCallback(): void {
        const url = this.#url;
        if (url === null) {
            return;
        }
        // `replaceChildren` détache puis rattache dans la même tâche : libérer
        // tout de suite tuerait une page qui n'a fait que bouger. La microtâche
        // laisse le déplacement s'achever. `moveBefore()` rendra cette garde
        // inutile le jour où Safari l'implémentera.
        queueMicrotask(() => {
            if (this.isConnected) {
                return;
            }
            this.#url = null;
            this.#urls.revoke(url);
            // Retirer le `<img>` du document, et pas seulement révoquer :
            // c'est lui qui retient la page décodée en mémoire.
            this.shadowRoot?.replaceChildren();
        });
    }
}

customElements.define('schema-page', SchemaPageElement);

/**
 * La seule porte : la page est posée **avant** l'attachement, donc l'élément
 * n'existe jamais dans le document sans savoir ce qu'il affiche.
 */
export function createSchemaPage(
    page: DisplayablePage,
    urls: ObjectUrls = browserUrls,
): SchemaPageElement {
    const element = new SchemaPageElement();
    element.page = page;
    element.urls = urls;
    return element;
}
