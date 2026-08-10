import {
    EMPTY,
    Observable,
    concatMap,
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
export interface PointDepose {
    readonly pointId: PointId;
    readonly imageId: ImageId;
    readonly fraction: FractionVerticale;
}

/**
 * Le seuil, en pixels, au-delà duquel un maintien devient un glisser. C'est le
 * `clickTolerance` de Leaflet : la pastille de la carte tranche déjà ainsi, et
 * les deux vues montrent le même symbole — elles doivent réagir pareil.
 */
const SEUIL_DE_GLISSER = 3;

/** Le repère saisi, et la hauteur où le doigt s'est posé. */
interface Depart {
    readonly repere: PointMarkerElement;
    readonly pointerId: number;
    readonly y: number;
}

/** La page visée, et la dépose qu'elle produirait. */
interface Cible {
    readonly zone: HTMLDivElement;
    readonly depose: PointDepose;
}

/** Où le repère se trouvait avant le geste — ce qu'une annulation lui rend. */
interface Origine {
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
export function glissersSurLaPile(pile: HTMLElement): Observable<PointDepose> {
    return eventsOf(pile, 'pointerdown').pipe(
        // `exhaustMap` et non `switchMap` : un second doigt posé pendant un
        // glisser est ignoré, il n'en démarre pas un autre.
        exhaustMap((event) => {
            const depart = departDeGlisser(event);
            return depart === null ? EMPTY : glisser(pile, depart);
        }),
    );
}

function glisser(pile: HTMLElement, depart: Depart): Observable<PointDepose> {
    // Capturée avant tout déplacement : c'est la seule position que
    // `pointercancel` peut restaurer, le parent ayant pu changer depuis.
    const origine = origineDuRepere(depart.repere);
    let derniere: PointDepose | null = null;
    let capture = false;
    let annule = false;

    // Un second doigt a ses propres `pointermove`/`pointerup`/`pointercancel` :
    // la capture ne fait que retarger ceux du premier, elle ne les empêche pas
    // d'atteindre la pile. Sans ce filtre, le doigt qui a saisi la pastille
    // n'est plus celui qui pilote — ni celui qui termine — son propre geste.
    const duMemeDoigt = (event: PointerEvent): boolean => event.pointerId === depart.pointerId;

    const relachements$ = eventsOf(pile, 'pointerup').pipe(filter(duMemeDoigt));
    const annulations$ = eventsOf(pile, 'pointercancel').pipe(
        filter(duMemeDoigt),
        tap(() => {
            annule = true;
            origine.parent.append(depart.repere);
            depart.repere.style.top = origine.top;
        }),
    );

    return eventsOf(pile, 'pointermove').pipe(
        filter(duMemeDoigt),
        takeUntil(merge(relachements$, annulations$)),
        skipWhile((move) => Math.abs(move.clientY - depart.y) < SEUIL_DE_GLISSER),
        tap(() => {
            // La capture n'est posée qu'ici, au premier mouvement qui franchit
            // le seuil — jamais à l'appui : un simple clic la prendrait aussi,
            // et elle retargeterait alors les événements souris de compatibilité
            // dont ce clic dérive sa cible.
            if (!capture) {
                capture = true;
                pile.setPointerCapture(depart.pointerId);
            }
        }),
        map((move) => {
            const cible = cibleSousLeDoigt(pile, depart.repere, move.clientY);
            // Aucune page sous le doigt — un interstice, ou hors de la pile :
            // le repère reste où il était, et c'est cette position-là qui sera
            // enregistrée. Un geste abouti ne doit pas se perdre.
            if (cible !== null) {
                poserLeRepere(depart.repere, cible);
                derniere = cible.depose;
            }
            return derniere;
        }),
        // Rien n'est passé par `skipWhile` : le seuil n'a jamais été franchi,
        // donc rien n'est émis et le clic suit son cours.
        takeLast(1),
        concatMap((depose) => {
            // Une annulation prime sur toute position survolée : le geste n'a
            // pas abouti, quoi que le doigt ait montré avant que le système ne
            // reprenne le pointeur.
            if (depose === null || annule) {
                return EMPTY;
            }
            avalerLeProchainClic(pile);
            return of(depose);
        }),
    );
}

/**
 * Là où le repère se trouvait avant que le geste ne commence. Le repère saisi
 * a toujours un parent — sa fabrique le monte avant de le rendre — donc ce
 * n'est jamais qu'une garde inatteignable, posée pour la même raison que
 * `requireConfiguration` : `!` est banni.
 */
function origineDuRepere(repere: PointMarkerElement): Origine {
    const parent = repere.parentElement;
    if (parent === null) {
        throw new Error(
            "Le repère saisi n'a pas de parent : il devrait déjà être monté sur une page.",
        );
    }
    return { parent, top: repere.style.top };
}

/** Le repère saisi, ou rien si l'appui ne visait pas une pastille. */
function departDeGlisser(event: PointerEvent): Depart | null {
    const cible = event.target;
    if (!(cible instanceof HTMLElement) || !cible.classList.contains('point-number')) {
        return null;
    }
    const repere = cible.closest('point-marker');
    if (!(repere instanceof PointMarkerElement)) {
        return null;
    }
    return { repere, pointerId: event.pointerId, y: event.clientY };
}

/**
 * La page dont le cadre contient cette hauteur. Le X ne compte pas : les pages
 * sont empilées en pleine largeur.
 */
function cibleSousLeDoigt(
    pile: HTMLElement,
    repere: PointMarkerElement,
    clientY: number,
): Cible | null {
    for (const cadre of queryAll('image-frame', ImageFrameElement, pile)) {
        const zone = query('.image-area', HTMLDivElement, cadre);
        const boite = zone.getBoundingClientRect();
        // Une page sans hauteur n'a pas de fraction : `fromHeight` lève plutôt
        // que de diviser par zéro, et jsdom rend justement des cadres nuls.
        if (boite.height <= 0 || clientY < boite.top || clientY > boite.bottom) {
            continue;
        }
        return {
            zone,
            depose: {
                pointId: repere.pointId,
                imageId: cadre.imageId,
                fraction: FractionVerticale.fromHeight(clientY - boite.top, boite.height),
            },
        };
    }
    return null;
}

function poserLeRepere(repere: PointMarkerElement, cible: Cible): void {
    if (repere.parentElement !== cible.zone) {
        cible.zone.append(repere);
    }
    repere.style.top = `${String(cible.depose.fraction.value * 100)}%`;
}

/**
 * Avale le clic que le navigateur dispatche après un `pointerup` : il viserait
 * la pastille et ouvrirait la carte, alors qu'on vient de déplacer le point.
 *
 * À la **capture**, sur la pile : la phase descendante précède la cible, donc
 * l'écouteur de la pastille n'est jamais atteint — et le repère n'a rien à
 * savoir du geste qui le déplace.
 */
function avalerLeProchainClic(pile: HTMLElement): void {
    const avaler = (event: Event): void => {
        event.stopPropagation();
    };
    pile.addEventListener('click', avaler, { capture: true, once: true });
    // Désarmé par le geste suivant, pas par un délai : au tactile, le clic
    // synthétique peut atterrir dans une tâche postérieure à un minuteur à
    // 0 ms, qui désarmerait alors le piège trop tôt et laisserait passer un
    // clic qui vise encore la pastille qu'on vient de déplacer. Le
    // `pointerdown` d'une interaction ultérieure, lui, précède toujours son
    // propre clic — et ne peut jamais survenir avant celui du geste en cours.
    pile.addEventListener(
        'pointerdown',
        () => {
            pile.removeEventListener('click', avaler, { capture: true });
        },
        { once: true },
    );
}
