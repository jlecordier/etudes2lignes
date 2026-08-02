import { query } from '../../shared/dom';
import { createTemplate } from '../../shared/template';
import type { PointIntent } from './intents';
import { pointActions } from './pointActions';

import html from './PointRow.html?raw';

/** Une ligne de la liste des points : sa description rédigée, et ses actions. */
export interface DisplayedPointRow extends PointIntent {
    readonly description: string;
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
    element.append(content());
    query('.point-description', HTMLSpanElement, element).textContent = row.description;
    element.append(...pointActions(element, { pointId: row.pointId, number: row.number }));
    return element;
}
