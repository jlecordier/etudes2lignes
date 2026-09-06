import { query } from '../../shared/dom';
import { createButton, type Button } from '../../shared/elements';
import { createTemplate } from '../../shared/template';
import { trajetContentsText } from '../domain/presentation';
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

    query('.trajet-details', HTMLSpanElement, element).textContent = trajetContentsText(
        summary.imageCount,
        summary.pointCount,
    );

    query('.trajet-footer', HTMLDivElement, element).append(
        ...trajetActions(element, summary).map(createButton),
    );
    return element;
}

function trajetActions(host: HTMLElement, summary: TrajetSummary): Button[] {
    return [
        {
            icon: 'pencil',
            label: 'Renommer',
            ariaLabel: `Renommer ${summary.nom}`,
            action: () => {
                emitIntent(host, 'rename-trajet', { summary });
            },
        },
        {
            // La flèche **monte** : elle sort le trajet de l'application, et
            // c'est le sens que la plateforme donne à ce symbole. Le repère
            // s'était installé à l'envers ici — l'import descend, plus bas.
            icon: 'square-arrow-up',
            label: 'Exporter',
            ariaLabel: `Exporter ${summary.nom}`,
            action: () => {
                emitIntent(host, 'export-trajet', { summary });
            },
        },
        {
            icon: 'trash',
            label: 'Supprimer',
            ariaLabel: `Supprimer ${summary.nom}`,
            action: () => {
                emitIntent(host, 'delete-trajet', { summary });
            },
            danger: true,
        },
    ];
}
