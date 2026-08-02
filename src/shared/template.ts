/**
 * Compile un gabarit HTML importé en `?raw`.
 *
 * Le balisage des éléments vit dans un fichier `.html` à côté de son `.ts` :
 * l'éditeur le colore, Prettier le formate, et le module reste testable sans
 * `index.html`. Un gabarit se compile une fois par module, puis se clone.
 *
 * `template.innerHTML` reçoit du contenu figé à la compilation, jamais une
 * saisie de l'utilisateur.
 */
export function createTemplate(html: string): HTMLTemplateElement {
    const template = document.createElement('template');
    template.innerHTML = html;
    return template;
}
