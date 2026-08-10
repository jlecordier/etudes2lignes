import { query, requireConfiguration } from '../../shared/dom';
import { createButton, type Button } from '../../shared/elements';
import type { SchemaPageElement } from '../../shared/SchemaPage';
import { createTemplate } from '../../shared/template';
import { FractionVerticale } from '../domain/FractionVerticale';
import type { ImageId } from '../domain/ids';
import { emitIntent } from './intents';
import { createPointMarker, type DisplayedMarker } from './PointMarker';

import html from './ImageFrame.html?raw';

/**
 * Une page du schéma telle que l'éditeur l'habille : sa barre et ses repères.
 *
 * Le cadre reçoit la page **déjà montée** au lieu de la fabriquer : c'est ce qui
 * permet à l'écran de rendre à nouveau sans faire redécoder une image que rien
 * n'a changée — une page de schéma pèse une trentaine de mégaoctets.
 */
export interface FramedPage {
    readonly schemaPage: SchemaPageElement;
    readonly imageId: ImageId;
    readonly nom: string;
    /** Son rang dans la pile, compté depuis le haut : ce que la liste des points annonce. */
    readonly pageNumber: number;
    readonly markers: readonly DisplayedMarker[];
}

const content = createTemplate(html);

/** Une page du schéma, entourée de sa barre d'outils et de ses repères. */
export class ImageFrameElement extends HTMLElement {
    #imageId: ImageId | null = null;

    set imageId(value: ImageId) {
        this.#imageId = value;
    }

    /**
     * L'image que ce cadre encadre. C'est ce que le glisser d'un point
     * interroge pour nommer la page sous le doigt : la `<schema-page>` qu'il
     * contient porte le même identifiant, mais typé `string` là où `ImageId`
     * est marqué — le lire de là demanderait un `as`.
     */
    get imageId(): ImageId {
        return requireConfiguration(this.#imageId, this);
    }
}

customElements.define('image-frame', ImageFrameElement);

export function createImageFrame(framed: FramedPage): ImageFrameElement {
    const element = new ImageFrameElement();
    element.append(content());
    element.imageId = framed.imageId;

    query('.image-name', HTMLSpanElement, element).textContent = framed.nom;
    query('.image-bar', HTMLDivElement, element).append(
        ...pageButtons(element, framed).map(createButton),
    );

    const area = query('.image-area', HTMLDivElement, element);
    query('.page-number', HTMLSpanElement, area).textContent = String(framed.pageNumber);
    area.append(framed.schemaPage);
    area.append(...framed.markers.map(createPointMarker));

    area.addEventListener('click', (event) => {
        emitIntent(element, 'click-page', {
            imageId: framed.imageId,
            fraction: fractionFromPosition(area, event.clientY),
        });
    });
    // Le menu contextuel natif du navigateur est remplacé par l'ajout direct du point.
    area.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        emitIntent(element, 'right-click-page', {
            imageId: framed.imageId,
            fraction: fractionFromPosition(area, event.clientY),
        });
    });

    return element;
}

/**
 * La pile étant affichée dans l'ordre inverse du voyage (première page en bas),
 * monter une page à l'écran la fait **avancer** dans le voyage. Les intitulés
 * parlent de l'écran, l'intention parle du voyage : l'équivalence est écrite
 * ici, une fois.
 */
function pageButtons(host: HTMLElement, framed: FramedPage): Button[] {
    const { nom } = framed;
    return [
        {
            icon: '🔼',
            ariaLabel: `Monter ${nom}`,
            action: () => {
                emitIntent(host, 'move-image', {
                    imageId: framed.imageId,
                    direction: 'forward',
                });
            },
        },
        {
            icon: '🔽',
            ariaLabel: `Descendre ${nom}`,
            action: () => {
                emitIntent(host, 'move-image', {
                    imageId: framed.imageId,
                    direction: 'backward',
                });
            },
        },
        {
            icon: '🗑️',
            label: 'Supprimer',
            ariaLabel: `Supprimer ${nom}`,
            action: () => {
                emitIntent(host, 'delete-image', { imageId: framed.imageId });
            },
            danger: true,
        },
    ];
}

/**
 * La page mesure sa propre boîte. L'écran n'a plus à le faire à sa place :
 * il ne connaît que la fraction, jamais les pixels.
 */
function fractionFromPosition(area: HTMLElement, clientY: number): FractionVerticale {
    const frame = area.getBoundingClientRect();
    return FractionVerticale.fromHeight(clientY - frame.top, frame.height);
}
