/**
 * Compile un gabarit HTML importé en `?raw`, et en rend un clone à chaque appel.
 *
 * Le balisage des éléments vit dans un fichier `.html` à côté de son `.ts` :
 * l'éditeur le colore, Prettier le formate, et le module reste testable sans
 * `index.html`.
 *
 * La compilation est **paresseuse**, faite au premier clone : toucher
 * `document` au chargement du module casserait tout test tournant hors jsdom.
 * `innerHTML` ne reçoit ici que du contenu figé à la compilation, jamais une
 * saisie de l'utilisateur.
 */
export function createTemplate(html: string): () => Node {
    let template: HTMLTemplateElement | null = null;
    return () => {
        template ??= compile(html);
        return template.content.cloneNode(true);
    };
}

function compile(html: string): HTMLTemplateElement {
    const template = document.createElement('template');
    template.innerHTML = html;
    return template;
}
