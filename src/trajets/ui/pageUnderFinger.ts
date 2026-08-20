import { query, queryAll } from '../../shared/dom';
import type { FractionVerticale } from '../domain/FractionVerticale';
import type { ImageId } from '../domain/ids';
import { ImageFrameElement } from './ImageFrame';
import { fractionInArea } from './pageFraction';

/** Une page de la pile, et la hauteur qu'un doigt y désigne. */
export interface AimedArea {
    readonly area: HTMLDivElement;
    readonly imageId: ImageId;
    readonly fraction: FractionVerticale;
}

/**
 * La page dont le cadre contient cette hauteur. Le X ne compte pas : les pages
 * sont empilées en pleine largeur.
 *
 * Vit ici et non dans `pageFraction` parce qu'elle connaît `ImageFrameElement`,
 * que `ImageFrame` importerait alors en retour — un cycle. La géométrie d'une
 * zone seule ne dépend de rien, celle de la pile dépend des cadres.
 */
export function areaUnderFinger(stack: HTMLElement, clientY: number): AimedArea | null {
    for (const frame of queryAll('image-frame', ImageFrameElement, stack)) {
        const area = query('.image-area', HTMLDivElement, frame);
        const rect = area.getBoundingClientRect();
        // Une page sans hauteur n'a pas de fraction : `fromHeight` lève plutôt
        // que de diviser par zéro, et jsdom rend justement des cadres nuls.
        if (rect.height <= 0 || clientY < rect.top || clientY > rect.bottom) {
            continue;
        }
        return { area, imageId: frame.imageId, fraction: fractionInArea(area, clientY) };
    }
    return null;
}
