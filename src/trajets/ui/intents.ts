/**
 * Ce que les fragments de l'éditeur **annoncent**, et que l'écran décide.
 *
 * Une feuille (une page, un marqueur, une ligne de point) reçoit des données par
 * propriété et émet des intentions par événement. Elle ne connaît ni l'agrégat,
 * ni les ports : c'est l'écran qui écoute, une fois, sur sa racine — les
 * événements remontent jusqu'à lui.
 *
 * Les noms suivent l'[ADR 0007](../../../docs/adr/0007-langue-du-code-metier-francais-technique-anglais.md) :
 * verbe anglais, complément français quand le mot est au lexique métier.
 */
import type { FractionVerticale } from '../domain/FractionVerticale';
import type { ImageId, PointId } from '../domain/ids';
import type { TrajetSummary } from '../ports/TrajetRepository';

/** Un point visé par une action. Le numéro sert aux intitulés accessibles. */
export interface PointIntent {
    readonly pointId: PointId;
    readonly number: number;
}

/** Une page visée par une action. */
export interface PageIntent {
    readonly imageId: ImageId;
}

/**
 * Une page et le sens du déplacement, dans le langage du **voyage**. Le type
 * n'est pas exporté : l'écran le lit par la carte des événements, il n'a jamais
 * à le nommer.
 */
interface PageMoveIntent extends PageIntent {
    readonly direction: 'forward' | 'backward';
}

/**
 * Un endroit visé sur une page. La fraction est calculée par la page elle-même :
 * c'est elle qui connaît sa boîte, l'écran n'a pas à la mesurer à sa place.
 */
export interface PageAimIntent extends PageIntent {
    readonly fraction: FractionVerticale;
}

/**
 * Un trajet visé depuis la liste, avec de quoi le nommer sans le recharger. Pas
 * exporté : l'écran le lit par la carte des événements, sans le nommer.
 */
interface TrajetIntent {
    readonly summary: TrajetSummary;
}

declare global {
    interface HTMLElementEventMap {
        'open-trajet': CustomEvent<TrajetIntent>;
        'rename-trajet': CustomEvent<TrajetIntent>;
        'export-trajet': CustomEvent<TrajetIntent>;
        'delete-trajet': CustomEvent<TrajetIntent>;
        'show-point-on-carte': CustomEvent<PointIntent>;
        'move-point-on-image': CustomEvent<PointIntent>;
        'move-point-on-carte': CustomEvent<PointIntent>;
        'delete-point': CustomEvent<PointIntent>;
        'click-page': CustomEvent<PageAimIntent>;
        'right-click-page': CustomEvent<PageAimIntent>;
        'move-image': CustomEvent<PageMoveIntent>;
        'delete-image': CustomEvent<PageIntent>;
    }
}

/**
 * Annonce une intention à qui écoute plus haut. `bubbles` est posé ici, une
 * fois : une feuille qui l'oublierait resterait muette sans rien signaler.
 */
export function emitIntent<Type extends keyof HTMLElementEventMap>(
    host: HTMLElement,
    type: Type,
    detail: HTMLElementEventMap[Type] extends CustomEvent<infer Detail> ? Detail : never,
): void {
    host.dispatchEvent(new CustomEvent(type, { detail, bubbles: true }));
}
