import { query } from '../../shared/dom';
import { createTemplate } from '../../shared/template';
import { emitIntent, type PointIntent } from './intents';
import { pointActions } from './pointActions';

import html from './PointRow.html?raw';

/** Une ligne de la liste des points : sa description rédigée, et ses actions. */
export interface DisplayedPointRow extends PointIntent {
    /** Où le point tombe dans le trajet — c'est aussi le libellé de la cible. */
    readonly description: string;
    /** Sa coordonnée, telle que l'infobulle de la ligne la donne. */
    readonly coordonnee: string;
}

const content = createTemplate(html);

/**
 * Une ligne de la liste des points.
 *
 * `role="listitem"` : un custom element ne peut pas être un `<li>` — les
 * éléments intégrés personnalisés (`<li is="…">`) ne verront jamais le jour,
 * WebKit s'y refuse depuis 2018. Le rôle rend la sémantique de liste que la
 * balise ne peut plus porter, et son conteneur porte `role="list"`.
 */
export class PointRowElement extends HTMLElement {}

customElements.define('point-row', PointRowElement);

export function createPointRow(row: DisplayedPointRow): PointRowElement {
    const element = new PointRowElement();
    element.setAttribute('role', 'listitem');
    // La coordonnée a quitté la phrase pour l'infobulle : la carte la montre
    // mieux, mais relire celle qu'on vient de placer reste légitime.
    element.title = row.coordonnee;
    element.append(content());
    query('.point-number', HTMLSpanElement, element).textContent = String(row.number);

    const description = query('.point-description', HTMLButtonElement, element);
    description.textContent = row.description;
    // Le nom accessible se compose de la phrase affichée, et d'elle seule : deux
    // rédactions pour la même ligne finiraient par diverger.
    description.setAttribute(
        'aria-label',
        `Aller au point ${String(row.number)} — ${row.description}`,
    );
    description.addEventListener('click', () => {
        emitIntent(element, 'show-point', {
            pointId: row.pointId,
            number: row.number,
        });
    });

    element.append(...pointActions(element, { pointId: row.pointId, number: row.number }));
    return element;
}
