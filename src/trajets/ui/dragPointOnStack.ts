import {
    EMPTY,
    Observable,
    concatMap,
    defer,
    exhaustMap,
    filter,
    map,
    merge,
    of,
    skipWhile,
    takeLast,
    takeUntil,
    tap,
} from 'rxjs';
import { query, queryAll } from '../../shared/dom';
import { eventsOf } from '../../shared/events';
import { FractionVerticale } from '../domain/FractionVerticale';
import type { ImageId, PointId } from '../domain/ids';
import { ImageFrameElement } from './ImageFrame';
import { PointMarkerElement } from './PointMarker';

/** Un point là où le doigt l'a laissé : de quoi appeler l'agrégat, rien de plus. */
export interface DroppedPoint {
    readonly pointId: PointId;
    readonly imageId: ImageId;
    readonly fraction: FractionVerticale;
}

/**
 * Le seuil, en pixels, au-delà duquel un maintien devient un glisser. Même
 * valeur que le `clickTolerance` de Leaflet — la pastille de la carte tranche
 * déjà à 3 px, et les deux vues doivent réagir pareil — mais pas la même
 * mesure : Leaflet compare `|dx| + |dy|`, alors qu'ici seul l'écart vertical
 * compte, les pages ne s'empilant que dans ce sens. Cette asymétrie est ce
 * qui laisse un doigt s'échapper de la pile à l'horizontale sans jamais
 * franchir le seuil.
 */
const DRAG_THRESHOLD = 3;

/** Le repère saisi, et la hauteur où le doigt s'est posé. */
interface DragStart {
    readonly marker: PointMarkerElement;
    readonly pointerId: number;
    readonly y: number;
}

/** La page visée, et la dépose qu'elle produirait. */
interface Target {
    readonly area: HTMLDivElement;
    readonly drop: DroppedPoint;
}

/** Où le repère se trouvait avant le geste — ce qu'une annulation lui rend. */
interface Origin {
    readonly parent: Element;
    readonly top: string;
}

/**
 * Les glissers de pastille achevés sur la pile, en flux.
 *
 * Pendant le geste, le repère est déplacé pour de vrai — page comprise : ce
 * qu'on voit avant de lâcher est ce qui sera enregistré. Le flux n'émet qu'au
 * relâchement, et seulement si le seuil a été franchi : en deçà, c'était un
 * clic, et il doit atteindre la pastille. Un `pointercancel` — le navigateur
 * qui reprend le pointeur, pas l'utilisateur qui relâche — n'émet rien non
 * plus, et remet le repère où il était.
 */
export function dragsOnStack(stack: HTMLElement): Observable<DroppedPoint> {
    return eventsOf(stack, 'pointerdown').pipe(
        // `exhaustMap` et non `switchMap` : un second doigt posé pendant un
        // glisser est ignoré, il n'en démarre pas un autre.
        exhaustMap((event) => {
            const start = dragStart(event);
            return start === null ? EMPTY : drag(stack, start);
        }),
    );
}

function drag(stack: HTMLElement, start: DragStart): Observable<DroppedPoint> {
    // Le corps ne s'exécute qu'à l'abonnement, pas à l'appel : `exhaustMap`
    // n'a aujourd'hui qu'un seul abonné et un seul geste actif à la fois, donc
    // ça ne change rien d'observable — mais ça rend la création de l'état
    // ci-dessous inoffensive le jour où un `share()` s'ajoute devant.
    return defer(() => {
        // Capturée avant tout déplacement : c'est la seule position que
        // `pointercancel` peut restaurer, le parent ayant pu changer depuis.
        const origin = markerOrigin(start.marker);
        let last: DroppedPoint | null = null;
        let captured = false;
        let cancelled = false;

        // Un second doigt a ses propres `pointermove`/`pointerup`/`pointercancel` :
        // la capture ne fait que retarger ceux du premier, elle ne les empêche pas
        // d'atteindre la pile. Sans ce filtre, le doigt qui a saisi la pastille
        // n'est plus celui qui pilote — ni celui qui termine — son propre geste.
        const fromSameFinger = (event: PointerEvent): boolean =>
            event.pointerId === start.pointerId;

        // Écoutés sur le document, pas sur la pile : sous le seuil, la capture
        // n'est pas encore posée (elle ne l'est qu'au franchissement, plus bas),
        // donc rien ne garantit que le relâchement retarge la pile. Un doigt qui
        // sort de la pile à l'horizontale — en deçà du seuil vertical, voir le
        // commentaire de `DRAG_THRESHOLD` — et se lève ailleurs dans le
        // document (la carte, sur un grand écran) ne dispatcherait alors son
        // `pointerup` sur aucun ancêtre de la pile : ce flux ne se
        // terminerait jamais, et l'`exhaustMap` qui l'attend resterait
        // souscrit pour de bon — plus aucun glisser ne redémarrerait ensuite.
        // `stack.ownerDocument.documentElement` reste un ancêtre de tout ce
        // que le document affiche, capture ou pas.
        const gestureEnd = stack.ownerDocument.documentElement;
        const releases$ = eventsOf(gestureEnd, 'pointerup').pipe(filter(fromSameFinger));
        const cancels$ = eventsOf(gestureEnd, 'pointercancel').pipe(
            filter(fromSameFinger),
            tap(() => {
                cancelled = true;
                origin.parent.append(start.marker);
                start.marker.style.top = origin.top;
            }),
        );

        return eventsOf(stack, 'pointermove').pipe(
            filter(fromSameFinger),
            takeUntil(merge(releases$, cancels$)),
            skipWhile((move) => Math.abs(move.clientY - start.y) < DRAG_THRESHOLD),
            tap(() => {
                // La capture n'est posée qu'ici, au premier mouvement qui franchit
                // le seuil — jamais à l'appui : un simple clic la prendrait aussi,
                // et elle retargeterait alors les événements souris de compatibilité
                // dont ce clic dérive sa cible.
                if (!captured) {
                    captured = true;
                    stack.setPointerCapture(start.pointerId);
                }
            }),
            map((move) => {
                const target = targetUnderFinger(stack, start.marker, move.clientY);
                // Aucune page sous le doigt — un interstice, ou hors de la pile :
                // le repère reste où il était, et c'est cette position-là qui sera
                // enregistrée. Un geste abouti ne doit pas se perdre.
                if (target !== null) {
                    placeMarker(start.marker, target);
                    last = target.drop;
                }
                return last;
            }),
            // Rien n'est passé par `skipWhile` : le seuil n'a jamais été franchi,
            // donc rien n'est émis et le clic suit son cours.
            takeLast(1),
            concatMap((drop) => {
                // Une annulation prime sur toute position survolée : le geste n'a
                // pas abouti, quoi que le doigt ait montré avant que le système ne
                // reprenne le pointeur.
                if (drop === null || cancelled) {
                    return EMPTY;
                }
                swallowNextClick(stack);
                return of(drop);
            }),
        );
    });
}

/**
 * Là où le repère se trouvait avant que le geste ne commence. Le repère saisi
 * a toujours un parent — sa fabrique le monte avant de le rendre — donc ce
 * n'est jamais qu'une garde inatteignable, posée pour la même raison que
 * `requireConfiguration` : `!` est banni.
 */
function markerOrigin(marker: PointMarkerElement): Origin {
    const parent = marker.parentElement;
    if (parent === null) {
        throw new Error(
            "Le repère saisi n'a pas de parent : il devrait déjà être monté sur une page.",
        );
    }
    return { parent, top: marker.style.top };
}

/** Le repère saisi, ou rien si l'appui ne visait pas une pastille. */
function dragStart(event: PointerEvent): DragStart | null {
    // Aligné sur `Draggable` de Leaflet, qui ignore tout bouton autre que le
    // principal (`button === 2` exclu) : sans ce garde, un clic droit qui
    // dérive de 3 px déplacerait le point **et** ferait remonter son
    // `contextmenu` jusqu'à `.image-area`, qui y ajouterait un second point —
    // deux mutations pour un seul geste. Le tactile n'est pas concerné :
    // `button` y vaut toujours 0.
    if (event.button !== 0) {
        return null;
    }
    const pressed = event.target;
    if (!(pressed instanceof HTMLElement) || !pressed.classList.contains('point-number')) {
        return null;
    }
    const marker = pressed.closest('point-marker');
    if (!(marker instanceof PointMarkerElement)) {
        return null;
    }
    return { marker, pointerId: event.pointerId, y: event.clientY };
}

/**
 * La page dont le cadre contient cette hauteur. Le X ne compte pas : les pages
 * sont empilées en pleine largeur.
 */
function targetUnderFinger(
    stack: HTMLElement,
    marker: PointMarkerElement,
    clientY: number,
): Target | null {
    for (const frame of queryAll('image-frame', ImageFrameElement, stack)) {
        const area = query('.image-area', HTMLDivElement, frame);
        const rect = area.getBoundingClientRect();
        // Une page sans hauteur n'a pas de fraction : `fromHeight` lève plutôt
        // que de diviser par zéro, et jsdom rend justement des cadres nuls.
        if (rect.height <= 0 || clientY < rect.top || clientY > rect.bottom) {
            continue;
        }
        return {
            area,
            drop: {
                pointId: marker.pointId,
                imageId: frame.imageId,
                fraction: FractionVerticale.fromHeight(clientY - rect.top, rect.height),
            },
        };
    }
    return null;
}

function placeMarker(marker: PointMarkerElement, target: Target): void {
    if (marker.parentElement !== target.area) {
        target.area.append(marker);
    }
    marker.style.top = `${String(target.drop.fraction.value * 100)}%`;
}

/**
 * Avale le clic que le navigateur dispatche après un `pointerup` : il viserait
 * la pastille et ouvrirait la carte, alors qu'on vient de déplacer le point.
 *
 * À la **capture**, sur la pile : la phase descendante précède la cible, donc
 * l'écouteur de la pastille n'est jamais atteint — et le repère n'a rien à
 * savoir du geste qui le déplace.
 */
function swallowNextClick(stack: HTMLElement): void {
    const swallow = (event: Event): void => {
        event.stopPropagation();
    };
    stack.addEventListener('click', swallow, { capture: true, once: true });
    // Désarmé par l'interaction suivante, pas par un délai : au tactile, le
    // clic synthétique peut atterrir dans une tâche postérieure à un minuteur
    // à 0 ms, qui désarmerait alors le piège trop tôt et laisserait passer un
    // clic qui vise encore la pastille qu'on vient de déplacer.
    //
    // Deux désarmeurs, pas un seul : le `pointerdown` d'une interaction
    // ultérieure précède toujours son propre clic, mais une pastille activée
    // au clavier (Tab puis Entrée/Espace) ne dispatche aucun `pointerdown` —
    // seulement un `keydown` puis le `click` qu'il produit. Sans ce second
    // désarmeur, cette activation-là restait avalée par le piège du glisser
    // précédent.
    const disarm = (): void => {
        stack.removeEventListener('click', swallow, { capture: true });
    };
    stack.addEventListener('pointerdown', disarm, { once: true });
    stack.addEventListener('keydown', disarm, { once: true });
}
