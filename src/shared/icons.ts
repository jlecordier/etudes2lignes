/**
 * Les pictogrammes de l'interface : des symboles monochromes, pas des emoji.
 *
 * La HIG demande des symboles monochromes sur le verre — ils s'assombrissent
 * sur un fond clair et s'éclaircissent sur un fond sombre, ce qu'un emoji
 * polychrome ne sait pas faire. Chaque pictogramme n'est donc qu'une référence
 * vers un symbole du jeu, et prend la couleur de son texte.
 *
 * Le nom est une **union fermée** : un pictogramme qui n'existe pas ne compile
 * pas. Ce que le type ne peut pas voir — un `<use>` écrit à la main dans un
 * gabarit —, c'est `icons.test.ts` qui le confronte au jeu.
 */
import { createTemplate } from './template';

import html from './Icons.html?raw';

export type IconName =
    | 'arrow-clockwise'
    | 'arrow-down-circle'
    | 'arrows-up-down'
    | 'checkmark'
    | 'chevron-down'
    | 'chevron-left'
    | 'chevron-up'
    | 'flask'
    | 'location'
    | 'location-line'
    | 'map'
    | 'mappin'
    | 'pencil'
    | 'photo'
    | 'play'
    | 'plus'
    | 'sidebar-trailing'
    | 'square-arrow-down'
    | 'square-arrow-up'
    | 'trash'
    | 'xmark';

const SVG = 'http://www.w3.org/2000/svg';

const JEU = 'jeu-de-symboles';

const content = createTemplate(html);

/**
 * Pose le jeu de symboles dans le document, une fois.
 *
 * Un `<use>` ne va chercher son symbole que dans le document qui le porte : sans
 * ce montage, tous les pictogrammes seraient vides. C'est donc la racine de
 * composition qui l'appelle, au même titre que le reste du câblage.
 *
 * Reposer le jeu ne le duplique pas : deux symboles de même identifiant se
 * disputeraient chaque `use`, et lequel gagne ne se lit nulle part.
 */
export function mountIcons(): void {
    if (document.getElementById(JEU) !== null) {
        return;
    }
    document.body.prepend(content());
}

/**
 * Le pictogramme d'un nom, prêt à être posé dans un bouton.
 *
 * `aria-hidden` sans réserve : un pictogramme ne nomme jamais son bouton, c'est
 * l'`aria-label` qui s'en charge — la feuille de style masque les libellés
 * visibles sous 560 px, et un bouton dont le nom accessible vivrait dans son
 * dessin deviendrait muet.
 */
export function createIcon(name: IconName): SVGSVGElement {
    const icon = document.createElementNS(SVG, 'svg');
    icon.setAttribute('class', 'icon');
    icon.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(SVG, 'use');
    use.setAttribute('href', `#i-${name}`);
    icon.append(use);
    return icon;
}
