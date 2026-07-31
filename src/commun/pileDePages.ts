/**
 * La pile des pages d'un schéma, et **le propriétaire** de leurs URL d'objet.
 *
 * Auparavant, chaque écran passait un tableau d'URL à remplir à la fonction qui
 * créait les images, puis le vidait en partant : un contrat par convention, que
 * rien ne vérifiait — et surtout, révoquer les URL sans retirer les `<img>` du
 * document ne libérait rien du tout, les pages décodées restant en mémoire
 * (une page de schéma pèse une trentaine de mégaoctets). Ici, la pile possède ce
 * qu'elle crée : `rendre` libère le rendu précédent, `detruire` libère et vide.
 */

/** Une page à afficher. `ImageDeTrajet` s'y assigne : aucun domaine n'est requis. */
export interface PageAAfficher {
    readonly id: string;
    readonly nom: string;
    readonly blob: Blob;
    readonly largeur: number;
    readonly hauteur: number;
}

/** La création d'URL d'objet, injectable pour que les tests observent les libérations. */
export interface UrlsDObjet {
    creer(blob: Blob): string;
    revoquer(url: string): void;
}

/**
 * Habille une page pour l'affichage. L'écran de suivi empile les images nues ;
 * l'éditeur les entoure d'une barre d'outils et de marqueurs. La pile reste
 * propriétaire des URL et du conteneur dans les deux cas.
 */
export type Habillage = (page: PageAAfficher, image: HTMLImageElement) => HTMLElement;

export interface PileDePages {
    /** Remplace les pages affichées, en libérant celles du rendu précédent. */
    rendre(pages: readonly PageAAfficher[], habiller?: Habillage): void;
    /** L'image affichée d'une page. Lève si la page n'est pas rendue. */
    elementDeLaPage(id: string): HTMLImageElement;
    /** Libère les URL **et** vide le conteneur : plus aucune page décodée en mémoire. */
    detruire(): void;
}

const urlsDuNavigateur: UrlsDObjet = {
    creer: (blob) => URL.createObjectURL(blob),
    revoquer: (url) => {
        URL.revokeObjectURL(url);
    },
};

export function creerPileDePages(
    conteneur: HTMLElement,
    urls: UrlsDObjet = urlsDuNavigateur,
): PileDePages {
    const affichees = new Map<string, { element: HTMLImageElement; url: string }>();

    function libererLeRenduPrecedent(): void {
        for (const { url } of affichees.values()) {
            urls.revoquer(url);
        }
        affichees.clear();
    }

    return {
        rendre(pages, habiller = (_page, image) => image) {
            libererLeRenduPrecedent();
            conteneur.replaceChildren(
                ...pages.map((page) => {
                    const url = urls.creer(page.blob);
                    const element = imageDeLaPage(page, url);
                    affichees.set(page.id, { element, url });
                    return habiller(page, element);
                }),
            );
        },

        elementDeLaPage(id) {
            const affichee = affichees.get(id);
            if (affichee === undefined) {
                throw new Error(`Page absente de la pile affichée : ${id}`);
            }
            return affichee.element;
        },

        detruire() {
            libererLeRenduPrecedent();
            conteneur.replaceChildren();
        },
    };
}

/**
 * Les dimensions sont réservées avant tout décodage : la mise en page est figée,
 * donc les offsets restent stables quand les images arrivent en différé.
 */
function imageDeLaPage(page: PageAAfficher, url: string): HTMLImageElement {
    const element = document.createElement('img');
    element.src = url;
    element.alt = page.nom;
    element.width = page.largeur;
    element.height = page.hauteur;
    element.loading = 'lazy';
    element.decoding = 'async';
    return element;
}
