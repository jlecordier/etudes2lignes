import {
    EMPTY,
    Observable,
    type SchedulerLike,
    asyncScheduler,
    concatMap,
    defer,
    exhaustMap,
    filter,
    finalize,
    ignoreElements,
    map,
    merge,
    of,
    take,
    takeUntil,
    tap,
    timer,
} from 'rxjs';
import { eventsOf } from '../../shared/events';
import { SchemaPageElement } from '../../shared/SchemaPage';
import { ImageFrameElement } from './ImageFrame';
import type { PageAimIntent } from './intents';
import { fractionInArea, placeAt } from './pageFraction';
import { areaUnderFinger } from './pageUnderFinger';

/**
 * Le temps qu'un doigt doit tenir pour que ce soit un appui long, en
 * millisecondes. C'est la valeur qu'Android et iOS emploient pour leur propre
 * appui long : s'en écarter ferait sentir le geste étranger à l'appareil.
 */
const LONG_PRESS_DELAY = 500;

/**
 * Le jeu, en pixels, qu'on accorde à un doigt avant de décider qu'il ne tient
 * pas un appui.
 *
 * Trois fois plus large que le `DRAG_THRESHOLD` du glisser, parce qu'un doigt
 * posé sur du verre tremble plus qu'une souris tenue : 10 px est l'ordre de
 * grandeur du « touch slop » d'Android (8 dp). Le seuil est une limite haute
 * incluse — une dérive de 10 px pile tient encore un appui.
 *
 * Et il se mesure sur **les deux axes**, là où celui du glisser ne regarde que
 * la verticale. Cette asymétrie est délibérée des deux côtés : le glisser laisse
 * exprès un doigt s'échapper de la pile à l'horizontale sans franchir son seuil,
 * alors qu'ici un doigt qui part de côté ne tient pas davantage un appui qu'un
 * doigt qui descend.
 */
const SLOP = 10;

/**
 * Les endroits où l'utilisateur veut un point **tout de suite**, en flux.
 *
 * Trois gestes y mènent — le clic droit, l'appui long, le tap à deux doigts — et
 * ils vivent ensemble parce qu'ils doivent s'arbitrer : sur Android, un appui
 * long émet en plus un `contextmenu` natif, doigt encore posé, et sans arbitrage
 * le même geste poserait deux points. Un arbitrage veut un seul propriétaire.
 *
 * Ce n'est donc pas une feuille : comme `dragsOnStack`, ça ne s'annonce pas par
 * `CustomEvent`, ça rend un flux — l'écran s'y abonne une fois, sous son
 * `takeUntil(parti$)`.
 */
export function addsOnStack(
    stack: HTMLElement,
    scheduler: SchedulerLike = asyncScheduler,
): Observable<PageAimIntent> {
    return defer(() => {
        // Les pointeurs **tactiles** posés sur la pile. Un second abonné aurait
        // le sien, d'où le `defer` — même raison que dans `dragPointOnStack`.
        const doigts = new Set<number>();

        // Relevés et annulations écoutés sur `documentElement`, pas sur la pile :
        // un identifiant qu'on oublierait de retirer resterait dans l'ensemble
        // pour de bon, et étoufferait tous les clics droits suivants.
        const fin = stack.ownerDocument.documentElement;

        const compterLesDoigts$ = merge(
            eventsOf(stack, 'pointerdown').pipe(
                tap((event) => {
                    if (event.pointerType !== 'mouse') {
                        doigts.add(event.pointerId);
                    }
                }),
            ),
            eventsOf(fin, 'pointerup').pipe(
                tap((event) => {
                    doigts.delete(event.pointerId);
                }),
            ),
            eventsOf(fin, 'pointercancel').pipe(
                tap((event) => {
                    doigts.delete(event.pointerId);
                }),
            ),
        ).pipe(ignoreElements());

        const clicsDroits$ = eventsOf(stack, 'contextmenu').pipe(
            concatMap((event) => {
                const vise = aimOf(event.target, event.clientY);
                // Hors d'une page — la barre d'une page, un interstice : le menu
                // natif reste, exactement comme avant que ce module n'existe.
                if (vise === null) {
                    return EMPTY;
                }
                event.preventDefault();
                // Un doigt est encore posé : c'est l'appui long d'Android, et
                // c'est notre geste qui le traite. Le garde est exact sans
                // minuteur parce que le natif arrive **pendant** l'appui.
                return doigts.size > 0 ? EMPTY : of(vise);
            }),
        );

        // Le point ne naît qu'au relâchement, pas à l'armement : ouvrir quoi
        // que ce soit à 500 ms sous un doigt encore posé choisirait une
        // coordonnée au hasard au relâchement. `takeUntil` avant l'armement
        // annule le minuteur si le doigt part plus tôt — un tap — ou s'il
        // dérive assez pour n'être plus un appui.
        const appuisLongs$ = eventsOf(stack, 'pointerdown').pipe(
            // Une souris n'entre pas : son raccourci vers le même point est le
            // clic droit, juste au-dessus, et un curseur oublié sur l'image
            // poserait sinon un point tout seul.
            //
            // Et l'appui ne compte que sur **l'image nue**. Le shadow DOM
            // retargeant l'événement, un doigt posé sur l'`<img>` a pour cible
            // l'hôte `<schema-page>` : ce seul `instanceof` écarte d'un coup la
            // pastille d'un point — qui est la poignée du glisser, pas une cible
            // d'appui —, ses boutons flottants et la barre de la page, sans
            // énumérer d'exclusions qu'un futur bouton viendrait démentir.
            //
            // Enfin, aucun **autre** pointeur ne doit tenir la pile : un second
            // doigt arrivé pendant qu'un premier glisse une pastille armerait un
            // appui long à côté du glisser. `compterLesDoigts$` est fusionné en
            // premier, donc l'ensemble contient déjà celui-ci quand c'est un
            // doigt — d'où « au plus un » et non « aucun ».
            //
            // « Exactement un » dirait presque la même chose, mais rendrait le
            // garde de la souris inutile : une souris n'entre jamais dans cet
            // ensemble, donc elle échouerait ici au lieu d'être écartée là-haut,
            // et le garde de la souris n'aurait plus de témoin. Mesuré : ce
            // mutant-là survivait.
            filter(
                (event) =>
                    event.pointerType !== 'mouse' &&
                    event.target instanceof SchemaPageElement &&
                    doigts.size <= 1,
            ),
            exhaustMap((event) => {
                // Le trait qu'on verra pendant l'armement, avant que le point
                // n'existe : il sert à lire où le point va tomber.
                const fantome = stack.ownerDocument.createElement('div');
                fantome.className = 'point-ghost';

                // Une dérive assez franche dit que le doigt ne tenait pas un
                // appui. **Les deux axes comptent**, là où le glisser ne regarde
                // que la verticale : un doigt qui part de côté ne tient pas
                // davantage un appui qu'un doigt qui descend.
                const derives$ = eventsOf(fin, 'pointermove').pipe(
                    filter(
                        (move) =>
                            Math.abs(move.clientY - event.clientY) > SLOP ||
                            Math.abs(move.clientX - event.clientX) > SLOP,
                    ),
                );

                // Le navigateur qui reprend le pointeur, pas l'utilisateur qui
                // relâche : le geste n'a pas abouti, donc il ne vise rien — avant
                // l'armement comme après, d'où les deux `takeUntil` ci-dessous.
                const annulations$ = eventsOf(fin, 'pointercancel');

                return timer(LONG_PRESS_DELAY, scheduler).pipe(
                    takeUntil(merge(eventsOf(fin, 'pointerup'), annulations$, derives$)),
                    concatMap(() => {
                        const vise = areaUnderFinger(stack, event.clientY);
                        if (vise === null) {
                            return EMPTY;
                        }
                        placeAt(fantome, vise.area, vise.fraction);
                        return eventsOf(fin, 'pointerup').pipe(
                            take(1),
                            map(() => {
                                // Retiré **avant** d'émettre, et non laissé au
                                // `finalize` qui suit : ce que l'abonné fait de la
                                // visée — ouvrir la carte des coordonnées — ne doit
                                // pas se faire par-dessus un trait qui n'annonce
                                // plus rien. Le `finalize` reste le filet des
                                // sorties que ce chemin-ci ne prend pas.
                                fantome.remove();
                                return { imageId: vise.imageId, fraction: vise.fraction };
                            }),
                        );
                    }),
                    // Le premier `takeUntil` a lâché son guetteur en même temps
                    // que le minuteur s'est achevé, donc il ne couvre que l'avant
                    // de l'armement. Sans celui-ci, une annulation arrivée après
                    // laisserait le geste attendre un relâchement qui poserait un
                    // point que plus personne ne visait.
                    takeUntil(annulations$),
                    // Le fantôme ne survit à rien : `finalize` s'exécute sur
                    // toutes les fins de ce geste, y compris celle que le geste
                    // ne décide pas — l'écran qui se détache défait l'abonnement,
                    // et un trait laissé sur la page reviendrait avec elle.
                    finalize(() => {
                        fantome.remove();
                    }),
                );
            }),
        );

        return merge(compterLesDoigts$, clicsDroits$, appuisLongs$);
    });
}

/**
 * L'endroit visé par un événement, ou rien s'il ne visait pas une page.
 *
 * Par la **cible** et non par la géométrie : c'est ce qui reproduit à
 * l'identique le ciblage de l'écouteur que `ImageFrame` posait sur
 * `.image-area`, barre de page comprise — elle en est le frère, pas l'enfant.
 */
function aimOf(target: EventTarget | null, clientY: number): PageAimIntent | null {
    if (!(target instanceof Element)) {
        return null;
    }
    const area = target.closest('.image-area');
    if (!(area instanceof HTMLDivElement)) {
        return null;
    }
    const frame = area.closest('image-frame');
    if (!(frame instanceof ImageFrameElement)) {
        return null;
    }
    return { imageId: frame.imageId, fraction: fractionInArea(area, clientY) };
}
