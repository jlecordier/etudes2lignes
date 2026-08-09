import { query, requireConfiguration } from '../../shared/dom';
import { createTemplate } from '../../shared/template';
import type { Coordonnee } from '../domain/Coordonnee';
import type { PointId } from '../domain/ids';
import { emitIntent, type PointIntent } from './intents';
import { pointActions } from './pointActions';

import html from './PointMarker.html?raw';

/** Un point posé sur une page : sa hauteur relative, son numéro, ses actions. */
export interface DisplayedMarker extends PointIntent {
    /** Hauteur sur la page, dans [0, 1] — 0 en haut. */
    readonly fraction: number;
    /** Sa coordonnée, portée par le repère sans être montrée. */
    readonly coordonnee: Coordonnee;
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
    // La coordonnée reste sur le repère — c'est ce qu'il marque — mais elle ne
    // s'affiche plus : illisible pour un humain, elle occupait un survol que la
    // pastille a mieux à employer.
    element.dataset['coordonnee'] =
        `${String(marker.coordonnee.latitude)},${String(marker.coordonnee.longitude)}`;
    element.append(content());
    element.style.top = `${String(marker.fraction * 100)}%`;
    const pastille = query('.point-number', HTMLButtonElement, element);
    pastille.textContent = String(marker.number);
    // Le nom accessible et l'infobulle disent la même chose : sous 560 px la
    // feuille de style masque les libellés visibles, et une pastille muette
    // s'annoncerait « 2 » sans dire ce qu'un clic en ferait.
    const intitule = `Voir le point ${String(marker.number)} sur la carte`;
    pastille.setAttribute('aria-label', intitule);
    pastille.title = intitule;
    pastille.addEventListener('click', (event) => {
        // Sans cela, le clic atteindrait la zone de l'image sous la pastille,
        // qui y ajouterait ou déplacerait un point — comme pour les boutons
        // flottants du point.
        event.stopPropagation();
        emitIntent(element, 'show-point-on-carte', {
            pointId: marker.pointId,
            number: marker.number,
        });
    });
    query('.point-actions', HTMLDivElement, element).append(
        ...pointActions(element, { pointId: marker.pointId, number: marker.number }, 'floating'),
    );
    return element;
}
