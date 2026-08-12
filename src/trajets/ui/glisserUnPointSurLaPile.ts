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
export interface PointDepose {
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
    // Le corps ne s'exécute qu'à l'abonnement, pas à l'appel : `exhaustMap`
    // n'a aujourd'hui qu'un seul abonné et un seul geste actif à la fois, donc
    // ça ne change rien d'observable — mais ça rend la création de l'état
    // ci-dessous inoffensive le jour où un `share()` s'ajoute devant.
    return defer(() => {
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

        // Écoutés sur le document, pas sur la pile : sous le seuil, la capture
        // n'est pas encore posée (elle ne l'est qu'au franchissement, plus bas),
        // donc rien ne garantit que le relâchement retarge la pile. Un doigt qui
        // sort de la pile à l'horizontale — en deçà du seuil vertical, voir le
        // commentaire de `SEUIL_DE_GLISSER` — et se lève ailleurs dans le
        // document (la carte, sur un grand écran) ne dispatcherait alors son
        // `pointerup` sur aucun ancêtre de la pile : ce flux ne se
        // terminerait jamais, et l'`exhaustMap` qui l'attend resterait
        // souscrit pour de bon — plus aucun glisser ne redémarrerait ensuite.
        // `pile.ownerDocument.documentElement` reste un ancêtre de tout ce que
        // le document affiche, capture ou pas.
        const finDuGeste = pile.ownerDocument.documentElement;
        const relachements$ = eventsOf(finDuGeste, 'pointerup').pipe(filter(duMemeDoigt));
        const annulations$ = eventsOf(finDuGeste, 'pointercancel').pipe(
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
    });
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
    // Aligné sur `Draggable` de Leaflet, qui ignore tout bouton autre que le
    // principal (`button === 2` exclu) : sans ce garde, un clic droit qui
    // dérive de 3 px déplacerait le point **et** ferait remonter son
    // `contextmenu` jusqu'à `.image-area`, qui y ajouterait un second point —
    // deux mutations pour un seul geste. Le tactile n'est pas concerné :
    // `button` y vaut toujours 0.
    if (event.button !== 0) {
        return null;
    }
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
    const desarmer = (): void => {
        pile.removeEventListener('click', avaler, { capture: true });
    };
    pile.addEventListener('pointerdown', desarmer, { once: true });
    pile.addEventListener('keydown', desarmer, { once: true });
}
