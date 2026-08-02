import { query } from '../../shared/dom';
import { createButton, type Button } from '../../shared/elements';
import { createTemplate } from '../../shared/template';
import type { TrajetSummary } from '../ports/TrajetRepository';
import { emitIntent } from './intents';

import html from './TrajetRow.html?raw';

const content = createTemplate(html);

/** Une ligne de la liste des trajets. `role="listitem"`, comme `<point-row>`. */
export class TrajetRowElement extends HTMLElement {}

customElements.define('trajet-row', TrajetRowElement);

export function createTrajetRow(summary: TrajetSummary): TrajetRowElement {
    const element = new TrajetRowElement();
    element.setAttribute('role', 'listitem');
    element.append(content());

    const openButton = query('.trajet-name', HTMLButtonElement, element);
    openButton.textContent = summary.nom;
    openButton.addEventListener('click', () => {
        emitIntent(element, 'open-trajet', { summary });
    });

    query('.trajet-details', HTMLSpanElement, element).textContent =
        `${String(summary.imageCount)} image(s) · ${String(summary.pointCount)} point(s)`;

    element.append(...trajetActions(element, summary).map(createButton));
    return element;
}

function trajetActions(host: HTMLElement, summary: TrajetSummary): Button[] {
    return [
        {
            text: '✏️ Renommer',
            ariaLabel: `Renommer ${summary.nom}`,
            action: () => {
                emitIntent(host, 'rename-trajet', { summary });
            },
        },
        {
            text: '⬇️ Exporter',
            ariaLabel: `Exporter ${summary.nom}`,
            action: () => {
                emitIntent(host, 'export-trajet', { summary });
            },
        },
        {
            text: '🗑️ Supprimer',
            ariaLabel: `Supprimer ${summary.nom}`,
            action: () => {
                emitIntent(host, 'delete-trajet', { summary });
            },
            danger: true,
        },
    ];
}
