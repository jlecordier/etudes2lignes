import {
    EMPTY,
    Observable,
    concatMap,
    defer,
    exhaustMap,
    filter,
    finalize,
    ignoreElements,
    map,
    merge,
    of,
    race,
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
import { areaUnderFinger, type AimedArea } from './pageUnderFinger';

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
export function addsOnStack(stack: HTMLElement): Observable<PageAimIntent> {
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

        const appuisLongs$ = eventsOf(stack, 'pointerdown').pipe(
            // `exhaustMap` et non `switchMap` : un geste en cours n'en démarre pas
            // un autre, comme pour le glisser.
            exhaustMap((event) => {
                const debut = gestureStart(event, doigts);
                return debut === null ? EMPTY : longPress(stack, debut);
            }),
        );

        /**
         * Retenir le défilement, mais seulement une fois le geste armé.
         *
         * Sans ça, le premier mouvement d'après-armement ferait défiler la page :
         * `touch-action: pan-x pan-y` autorise le pan, donc le navigateur prendrait
         * la main et émettrait `pointercancel` — le geste mourrait exactement quand
         * on commence à ajuster.
         *
         * Deux contraintes mesurées dictent cette forme, et non une autre. **Sur la
         * pile et non sur le document** : Chrome force `passive: true` pour
         * `touchstart` et `touchmove` sur `window`, `document`, `documentElement` et
         * `body`, où un `preventDefault` serait ignoré — et `documentElement` est
         * justement ce que `longPress` écoute pour les pointeurs, donc l'omettre de
         * cette liste retirerait à cet argument son cas le plus proche.
         * **Posé d'avance et non à l'armement** :
         * `cancelable` bascule à `false` dès qu'un défilement est en cours, et le
         * navigateur décide au `touchstart` s'il peut défiler, sans consulter le fil
         * principal.
         *
         * L'armement se lit sur la pile elle-même : le fantôme monté **est**
         * l'armement — rien d'autre ne le fait paraître, `placeAt` l'y met à 500 ms
         * et le geste l'enlève sur toutes ses fins. Un booléen partagé redirait la
         * même chose une seconde fois, et pourrait se désaccorder de ce qu'on voit ;
         * ceci ne peut pas.
         *
         * Le prix est connu et accepté : la pile devient une région tactile non
         * passive, donc un défilement amorcé sur le schéma attend ce gestionnaire.
         * Il interroge une classe sur un petit sous-arbre et rend la main — c'est ce
         * que paye déjà toute application de carte ou de dessin, Leaflet compris sur
         * son propre conteneur. La performance du défilement n'est pas un point de
         * contrôle de ce travail.
         */
        const retenirLeDefilement$ = eventsOf(stack, 'touchmove', { passive: false }).pipe(
            tap((event) => {
                if (stack.querySelector('.point-ghost') !== null) {
                    event.preventDefault();
                }
            }),
            ignoreElements(),
        );

        return merge(compterLesDoigts$, retenirLeDefilement$, clicsDroits$, appuisLongs$);
    });
}

/** Le pointeur qui a ouvert un geste, et l'endroit où il s'est posé. */
interface GestureStart {
    readonly pointerId: number;
    readonly x: number;
    readonly y: number;
}

/**
 * Le pointeur qui ouvre un appui long, ou rien.
 *
 * Trois conditions, et chacune écarte une confusion précise.
 *
 * La **souris** n'entre pas : son raccourci vers le même point est le clic droit,
 * et un curseur oublié sur l'image poserait sinon un point tout seul.
 *
 * La **cible** doit être l'image nue. Le shadow DOM retargeant l'événement, un
 * doigt posé sur l'`<img>` a pour cible l'hôte `<schema-page>` : ce seul
 * `instanceof` écarte d'un coup la pastille d'un point — qui est la poignée du
 * glisser, pas une cible d'appui —, ses boutons flottants et la barre de la page,
 * sans énumérer d'exclusions qu'un futur bouton viendrait démentir.
 *
 * Et aucun **autre** pointeur ne doit tenir la pile : un second doigt arrivé
 * pendant qu'un premier glisse une pastille armerait un appui long à côté du
 * glisser. `compterLesDoigts$` est fusionné en premier, donc l'ensemble contient
 * déjà celui-ci quand c'est un doigt — d'où « plus d'un » et non « au moins un ».
 * Refuser « sauf s'il y en a exactement un » dirait presque la même chose, mais
 * rendrait le garde de la souris inutile : une souris n'entre jamais dans cet
 * ensemble, donc elle échouerait ici au lieu d'être écartée plus haut, et ce
 * garde-là n'aurait plus de témoin. Mesuré : ce mutant-là survivait.
 */
function gestureStart(event: PointerEvent, doigts: ReadonlySet<number>): GestureStart | null {
    if (event.pointerType === 'mouse') {
        return null;
    }
    if (!(event.target instanceof SchemaPageElement)) {
        return null;
    }
    if (doigts.size > 1) {
        return null;
    }
    return { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
}

/**
 * Un appui long : du doigt qui se pose au point qu'il vise en se relevant.
 *
 * Le point ne naît **qu'au relâchement**, pas à l'armement : ouvrir la carte des
 * coordonnées à 500 ms sous un doigt encore posé lui ferait choisir une
 * coordonnée au hasard au relâchement. Entre les deux, le fantôme dit où le point
 * tombera.
 */
function longPress(stack: HTMLElement, debut: GestureStart): Observable<PageAimIntent> {
    // Le corps ne s'exécute qu'à l'abonnement, pas à l'appel : `exhaustMap` n'a
    // aujourd'hui qu'un seul geste actif à la fois, donc ça ne change rien
    // d'observable — mais ça rend la création du fantôme ci-dessous inoffensive le
    // jour où un `share()` s'ajoute devant. Même raison que dans `dragPointOnStack`.
    return defer(() => {
        // Écoutés sur `documentElement` et non sur la pile : un doigt qui sort de
        // la pile avant de se lever ne dispatcherait son `pointerup` sur aucun
        // ancêtre d'elle, et ce flux ne se terminant jamais, l'`exhaustMap` qui
        // l'attend resterait souscrit pour de bon.
        const fin = stack.ownerDocument.documentElement;
        const fantome = ghostElement(stack.ownerDocument);

        // Un second pointeur a ses propres `pointermove`, `pointerup` et
        // `pointercancel`, et rien en aval ne les distingue de ceux du doigt qui
        // tient le geste. Il n'a pas à en être un participant : un pouce posé sur
        // la bordure, une paume, le stylet d'un appareil hybride ne passent aucun
        // garde d'entrée et ne sont comptés par personne. Sans ce prédicat, leur
        // relâchement pose le point d'un doigt encore posé — la carte s'ouvre sous
        // lui —, et leur moindre glissement ou reprise empêche l'appui de s'armer :
        // à une main, la fonctionnalité ne marcherait pour ainsi dire pas. Même
        // prédicat et même raison que le `fromSameFinger` de `dragPointOnStack`.
        const duMemeDoigt = (autre: PointerEvent): boolean => autre.pointerId === debut.pointerId;

        // Les doigts de ce geste, et la dernière hauteur connue de chacun. Les
        // clés disent l'appartenance — c'est le relâchement de **l'un des deux**
        // qui pose le point, sans quoi un geste armé à deux doigts attendrait
        // celui que l'utilisateur garde posé — et les valeurs disent la visée,
        // qui est leur milieu. Un seul état pour deux questions qui n'en font
        // qu'une : où sont les doigts de ce geste.
        const doigtsDuGeste = new Map<number, number>([[debut.pointerId, debut.y]]);
        const duGeste = (autre: PointerEvent): boolean => doigtsDuGeste.has(autre.pointerId);

        const mouvements$ = eventsOf(fin, 'pointermove').pipe(filter(duGeste));
        // Un doigt ne rejoint le geste qu'en l'armant, et ce guetteur-ci tombe avec
        // le minuteur qu'il surveille : avant l'armement, `mouvements$` ne porte
        // donc que le doigt d'origine, et le comparer à `debut` reste exact.
        const derives$ = mouvements$.pipe(filter((move) => aDerive(debut, move)));
        const releves$ = eventsOf(fin, 'pointerup').pipe(filter(duGeste));
        const annulations$ = eventsOf(fin, 'pointercancel').pipe(filter(duMemeDoigt));

        // Un doigt qui rejoint le geste : c'est le tap à deux doigts, et il
        // n'attend pas les 500 ms — deux doigts sont déjà un geste délibéré. Ce
        // qu'ils visent est leur milieu.
        const renforts$ = eventsOf(stack, 'pointerdown').pipe(
            // Un doigt, pas un curseur : la souris a le clic droit pour aller au
            // même point, et un curseur oublié sur l'image ne fait pas de l'appui
            // long qui tient un geste à deux doigts.
            filter((event) => event.pointerType !== 'mouse'),
            // L'image nue, comme pour le doigt qui ouvre un geste : ce seul
            // `instanceof` écarte la pastille d'un point — la poignée du glisser —,
            // ses boutons flottants et la barre de la page. La géométrie ne
            // suffirait pas : une pastille est **dans** la page.
            filter((event) => event.target instanceof SchemaPageElement),
            // Sur la **même** page que le doigt qui tient, et non de part et
            // d'autre : deux doigts sur deux pages ont bien un milieu, mais ce
            // n'est pas ce qu'ils désignent — celui de 200 et 1600 tombe sur la
            // page du haut, qu'un seul des deux touche. Le doigt refusé n'entre pas
            // dans le geste, et ne le tue pas davantage : l'appui long de celui qui
            // tient continue.
            filter(
                (event) =>
                    areaUnderFinger(stack, event.clientY)?.area ===
                    areaUnderFinger(stack, debut.y)?.area,
            ),
            tap((event) => {
                doigtsDuGeste.set(event.pointerId, event.clientY);
            }),
            map((event) => (debut.y + event.clientY) / 2),
        );

        // Deux branches concourent pour armer le geste, et `race` les arbitre : la
        // première qui émet désabonne l'autre, donc un geste ne s'arme qu'une fois.
        // Chacune rend la **hauteur** visée, seul endroit où les deux diffèrent.
        return race(
            // Sans ordonnanceur : le `TestScheduler` de RxJS détourne
            // `AsyncScheduler.delegate` pour rendre ce temps-ci virtuel dans les
            // tests, donc la production n'a pas d'horloge à recevoir (ADR 0009 —
            // l'horloge injectée disparaît).
            timer(LONG_PRESS_DELAY).pipe(
                // Avant l'armement, tout sort du geste : un relâchement dit que
                // c'était un tap — et ce tap doit atteindre l'écran, qui en fait un
                // placement —, une dérive qu'un doigt qui part ne tenait pas un appui,
                // une reprise que le navigateur a pris le pointeur.
                takeUntil(merge(releves$, annulations$, derives$)),
                map(() => debut.y),
            ),
            renforts$,
        ).pipe(
            // La course s'achève à son premier verdict. Le minuteur se terminait
            // de lui-même, mais le second doigt est un flux d'événements qui ne
            // s'achève jamais : sans ce `take(1)`, le geste qu'il arme ne
            // finirait pas, et l'`exhaustMap` de la pile — qui attend la fin du
            // geste courant — n'en laisserait plus jamais commencer un autre. Le
            // tap à deux doigts marcherait une fois, puis plus jamais.
            take(1),
            concatMap((hauteur) => {
                const vise = areaUnderFinger(stack, hauteur);
                if (vise === null) {
                    return EMPTY;
                }
                placeAt(fantome, vise.area, vise.fraction);
                vibrer();
                return suivreLesDoigts(
                    { stack, fantome, doigtsDuGeste, mouvements$, releves$, renforts$ },
                    vise,
                );
            }),
            // Le `takeUntil` du haut a lâché son guetteur en même temps que le
            // minuteur s'est achevé, donc il ne couvre que l'avant de l'armement.
            // Sans celui-ci, une annulation arrivée après laisserait le geste
            // attendre un relâchement qui poserait un point que plus personne ne
            // visait.
            takeUntil(annulations$),
            // Le fantôme ne survit à rien : `finalize` s'exécute sur toutes les
            // fins de ce geste, y compris celle que le geste ne décide pas —
            // l'écran qui se détache défait l'abonnement, et un trait laissé sur la
            // page reviendrait avec elle.
            finalize(() => {
                fantome.remove();
            }),
        );
    });
}

/**
 * Ce qu'un geste armé possède en propre : la pile qu'il mesure, le fantôme qu'il
 * traîne, les doigts qui le composent et les flux de pointeurs qui lui
 * appartiennent.
 *
 * Tout arrive tout fait parce que « les doigts de ce geste » se décide une seule
 * fois — chez l'appui long qui l'a ouvert, seul endroit qui sache laquelle des
 * deux branches a gagné la course.
 */
interface GesteEnCours {
    readonly stack: HTMLElement;
    readonly fantome: HTMLDivElement;
    /** Les doigts du geste, et la dernière hauteur connue de chacun. */
    readonly doigtsDuGeste: Map<number, number>;
    readonly mouvements$: Observable<PointerEvent>;
    readonly releves$: Observable<PointerEvent>;
    /** Les doigts qui rejoignent le geste, chacun s'étant déjà inscrit ci-dessus. */
    readonly renforts$: Observable<number>;
}

/**
 * L'ajustement : le fantôme au milieu des doigts, jusqu'au relâchement qui pose le
 * point là où il se trouve.
 *
 * `dernier` retient la dernière page valable. Aucune page sous ce milieu —
 * l'interstice entre deux pages, ou hors de la pile — laisse le fantôme où il
 * était, et c'est cette position-là qui sera enregistrée : un geste abouti ne doit
 * pas se perdre, la règle que le glisser a déjà tranchée. Le doigt qui n'aurait
 * jamais touché de page valable pose donc son point là où il l'avait armé.
 */
function suivreLesDoigts(geste: GesteEnCours, depart: AimedArea): Observable<PageAimIntent> {
    return defer(() => {
        const { stack, fantome, doigtsDuGeste, mouvements$, releves$, renforts$ } = geste;
        let dernier = depart;

        /**
         * Les doigts ont bougé, ou l'un d'eux vient d'arriver : le fantôme rejoint
         * leur milieu — qui, pour un doigt seul, est ce doigt. Un seul chemin de
         * code, et c'est lui qui tient la promesse « le fantôme suit le milieu »
         * quand deux doigts posés sur du verre tremblent : suivre le seul doigt
         * d'origine tirerait la visée hors du milieu au premier frémissement de
         * l'autre.
         *
         * Pages voisines comprises : le fantôme change de zone en cours de geste,
         * exactement comme `placeAt` déplace le vrai repère d'un glisser.
         */
        const deplacer = (): void => {
            const hauteurs = [...doigtsDuGeste.values()];
            const survole = areaUnderFinger(
                stack,
                (Math.min(...hauteurs) + Math.max(...hauteurs)) / 2,
            );
            if (survole !== null) {
                dernier = survole;
                placeAt(fantome, survole.area, survole.fraction);
            }
        };

        // Armé, la dérive ne sort plus du geste : elle **est** le geste, et le
        // fantôme suit les doigts.
        const suivi$ = mouvements$.pipe(
            tap((move) => {
                doigtsDuGeste.set(move.pointerId, move.clientY);
                deplacer();
            }),
            ignoreElements(),
        );

        // La course est finie quand on arrive ici, donc sa branche des renforts est
        // désabonnée : un doigt qui rejoint le geste **après** l'armement ne serait
        // plus entendu par personne. C'est le même flux à un autre poste —
        // concurrent avant l'armement, source d'ajustement après.
        const auMilieu$ = renforts$.pipe(
            tap(() => {
                deplacer();
            }),
            ignoreElements(),
        );

        const pose$ = releves$.pipe(
            map(() => {
                // Retiré **avant** d'émettre, et non laissé au `finalize` de l'appui
                // long : ce que l'abonné fait de la visée — ouvrir la carte des
                // coordonnées — ne doit pas se faire par-dessus un trait qui
                // n'annonce plus rien. Le `finalize` reste le filet des sorties que
                // ce chemin-ci ne prend pas.
                fantome.remove();
                // Le point se pose là où le **fantôme** est, et non là où le doigt se
                // lève : les deux ne coïncident pas dans l'interstice, et c'est ce
                // qu'on voit qui fait foi. Même règle, et même façon de la tenir, que
                // le glisser.
                return { imageId: dernier.imageId, fraction: dernier.fraction };
            }),
        );

        // Le suivi ne s'achève jamais de lui-même, d'où ce `take(1)` : sans lui, la
        // fusion resterait ouverte après le relâchement et l'`exhaustMap` de la
        // pile, qui attend la fin du geste courant, n'en laisserait plus jamais
        // commencer un autre. C'est aussi le seul `take` utile ici — le poser en
        // plus sur `pose$` serait un opérateur mort, qu'aucune mutation ne
        // signalerait.
        return merge(suivi$, auMilieu$, pose$).pipe(take(1));
    });
}

/**
 * Le tic qui dit « vous pouvez bouger maintenant », et non « ça a marché ».
 *
 * `navigator.vibrate` est typé comme toujours présent alors qu'il est absent de
 * Safari iOS : on l'annote optionnel pour l'exprimer honnêtement plutôt que de le
 * caster — mot pour mot le procédé que `main.ts` applique à `navigator.storage`.
 * Sur iPhone c'est donc le fantôme seul qui le dit, d'où l'intérêt de l'avoir gardé
 * franc.
 *
 * Pas de port : aucune règle métier n'en dépend, il n'a pas de seconde
 * implémentation, et personne d'autre que ce geste ne l'appelle.
 */
function vibrer(): void {
    const navigateur: { vibrate?: (motif: VibratePattern) => boolean } = navigator;
    // 10 ms : un tic, pas une alerte — l'ordre de grandeur du retour haptique d'un
    // appui long, pas celui d'une notification.
    navigateur.vibrate?.(10);
}

/** A-t-il assez bougé pour qu'on renonce ? Les deux axes comptent. */
function aDerive(debut: GestureStart, move: PointerEvent): boolean {
    return Math.abs(move.clientY - debut.y) > SLOP || Math.abs(move.clientX - debut.x) > SLOP;
}

/**
 * Le trait qu'on verra avant que le point n'existe. Pas de pastille, pas de
 * boutons : c'est ce qui le distingue d'un vrai repère, et c'est assez franc pour
 * n'avoir pas besoin d'être atténué — il sert à lire une hauteur.
 */
function ghostElement(document: Document): HTMLDivElement {
    const element = document.createElement('div');
    element.className = 'point-ghost';
    return element;
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
