import { query, requireConfiguration } from '../../shared/dom';
import { createTemplate } from '../../shared/template';
import type { PointId } from '../domain/ids';
import type { PointIntent } from './intents';
import { pointActions } from './pointActions';

import html from './PointMarker.html?raw';

/** Un point posé sur une page : sa hauteur relative, son numéro, ses actions. */
export interface DisplayedMarker extends PointIntent {
    /** Hauteur sur la page, dans [0, 1] — 0 en haut. */
    readonly fraction: number;
}

const content = createTemplate(html);

/**
 * Le repère rouge d'un point sur sa page.
 *
 * Contrairement à `<schema-page>`, ce marqueur ne détient aucune ressource :
 * il n'a donc rien à libérer, et se construit à la fabrique plutôt qu'à
 * l'attachement. Le cycle de vie ne se prend que là où il y a quelque chose à
 * rendre.
 */
export class PointMarkerElement extends HTMLElement {
    #marker: DisplayedMarker | null = null;

    set marker(value: DisplayedMarker) {
        this.#marker = value;
    }

    /**
     * Le point que ce repère marque, pour le retrouver dans la pile. C'est ce qui
     * permet à la liste de dire « emmène-moi » sans connaître ni les pages ni les
     * pixels : elle nomme un point, l'écran trouve l'endroit.
     */
    get pointId(): PointId {
        return requireConfiguration(this.#marker, this).pointId;
    }
}

customElements.define('point-marker', PointMarkerElement);

export function createPointMarker(marker: DisplayedMarker): PointMarkerElement {
    const element = new PointMarkerElement();
    element.marker = marker;
    element.append(content());
    element.style.top = `${String(marker.fraction * 100)}%`;
    query('.point-number', HTMLSpanElement, element).textContent = String(marker.number);
    query('.point-actions', HTMLDivElement, element).append(
        ...pointActions(element, { pointId: marker.pointId, number: marker.number }, 'floating'),
    );
    return element;
}
