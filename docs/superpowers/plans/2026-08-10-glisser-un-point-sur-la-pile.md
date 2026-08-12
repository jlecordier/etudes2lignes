# Glisser un point sur la pile — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Maintenir la pastille d'un point et glisser déplace ce point sur le schéma, en direct, y compris d'une page à l'autre.

**Architecture:** Un module dédié expose les glissers achevés en **flux RxJS** ; l'écran s'y abonne comme aux intentions et enregistre au relâchement. Le repère est déplacé pour de vrai pendant le geste — reposé dans la page survolée —, ce qui impose de capturer le pointeur sur la pile plutôt que sur le repère. Rien ne change au domaine : `movePointOnImage(pointId, imageId, fraction)` existe et prend déjà l'identifiant de l'image.

**Tech Stack:** TypeScript · vanilla DOM (custom elements natifs) · RxJS · Vitest (jsdom) · Playwright.

**Conception :** [`docs/superpowers/specs/2026-08-10-glisser-un-point-sur-la-pile-design.md`](../specs/2026-08-10-glisser-un-point-sur-la-pile-design.md)

## Global Constraints

- **Langue** : français pour le métier, anglais pour la plomberie, mot à mot ([ADR 0007](../../adr/0007-langue-du-code-metier-francais-technique-anglais.md)). Prose, commentaires, JSDoc, titres de tests BDD, étapes e2e et messages de commit : **français**.
- **Pas de `!` ni de `as` de forme** ([ADR 0002](../../adr/0002-lint-type-aware-strict.md)). Recherche DOM → `query` / `queryAll` de `src/shared/dom.ts`, qui vérifient par `instanceof`. Rétrécir un type se fait par `instanceof` ou par comparaison à `null`, **jamais** par un prédicat `x is T` ni un générique à sens unique.
- **Ne jamais désactiver une règle de lint** pour esquiver un signalement.
- **Tests BDD, par état** : `Étant donné / Quand / Alors`. **Pas de `vi.fn`, pas de `toHaveBeenCalled`** — des faux écrits à la main et des assertions sur les **valeurs produites**.
- **Le temps est un flux** ([ADR 0009](../../adr/0009-flux-du-temps-en-rxjs.md)) : cadence et concurrence se disent par des opérateurs nommés. Tout `subscribe` d'écran passe par `takeUntil(parti$)`.
- **Règle de dépendance** : `domain` ne dépend de rien ; `adapters`/`ui` des ports + domaine ; seul `src/main.ts` instancie les adapters concrets.
- **Seuil de glisser : 3 px**, écrit une seule fois, en constante nommée. C'est le `clickTolerance` de Leaflet, pour que les deux pastilles tranchent pareil.
- **Nom du module, verbatim** : `src/trajets/ui/dragPointOnStack.ts`, exportant `dragsOnStack(stack: HTMLElement): Observable<DroppedPoint>`.
- **Chaque tâche finit par un commit**, message en français, disant _pourquoi_. Le hook de pré-commit lance `fallow fix --yes`, `lint-staged`, `typecheck` puis `test`.
- **`pnpm quality`** doit être vert avant de déclarer une tâche finie.

---

## Structure des fichiers

| Fichier                                   | Responsabilité après ce plan                                              |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| `src/trajets/ui/ImageFrame.ts`            | dit enfin l'identifiant de l'image qu'il encadre                          |
| `src/trajets/ui/dragPointOnStack.ts`      | **créé** — le geste, du `pointerdown` à la dépose, et le clic qu'il avale |
| `src/trajets/ui/TrajetEditorScreen.ts`    | s'abonne au flux, enregistre au relâchement                               |
| `src/style.css`                           | `touch-action` et le curseur du maintien                                  |
| `e2e/points.spec.ts`, `docs/EXIGENCES.md` | les témoins de bout en bout, et la ligne d'exigence                       |

**Quatre tâches**, chacune relisable seule :

1. `<image-frame>` expose son `imageId` — sans quoi rien ne peut nommer la page visée.
2. Le flux de glissers, testé seul, sans écran ni agrégat.
3. L'écran s'y abonne, et la feuille de style rend le geste possible au doigt.
4. Les témoins de bout en bout et l'exigence.

---

### Task 1 : `<image-frame>` dit son identifiant

**Files:**

- Modify: `src/trajets/ui/ImageFrame.ts`
- Test: `src/trajets/ui/TrajetEditorScreen.test.ts`

**Interfaces:**

- Consumes: `requireConfiguration<T>(value: T | null, element: HTMLElement): T` de `src/shared/dom.ts` — lève un message parlant si la fabrique n'a pas configuré l'élément. `ImageId` de `src/trajets/domain/ids.ts`, un `string` **marqué** (`string & { readonly __brand: 'ImageId' }`).
- Produces: `ImageFrameElement.imageId: ImageId` (accesseur en lecture **et** en écriture). La Task 2 s'en sert pour nommer la page sous le doigt.

**Pourquoi :** `ImageFrameElement` est aujourd'hui une classe vide ; sa fabrique referme `framed.imageId` sans l'exposer. Le `<schema-page>` qu'elle contient porte le même identifiant sous `pageId`, mais typé `string` — s'en servir demanderait un `as`, banni. On suit donc le patron déjà en place sur `<point-marker>` (`pointId`) et `<schema-page>` (`pageId`).

- [ ] **Step 1 : Écrire le test qui échoue**

Dans `src/trajets/ui/TrajetEditorScreen.test.ts`, ajouter au `describe('Étant donné un trajet, quand j’attache l’écran', …)` :

```ts
it('alors chaque cadre dit l’identifiant de son image, celui-là même que porte sa page', async () => {
    const element = await attacherLEcran();

    // Trois cadres, trois identifiants distincts : l'assertion ne peut
    // pas passer par un accesseur qui rendrait toujours la même chose.
    const cadres = queryAll('image-frame', ImageFrameElement, element);
    const pages = queryAll('schema-page', SchemaPageElement, element);
    expect(cadres.map((cadre) => cadre.imageId)).toEqual(pages.map((page) => page.pageId));
    expect(new Set(cadres.map((cadre) => cadre.imageId)).size).toBe(3);
});
```

Ajouter les deux imports manquants en tête du fichier :

```ts
import { SchemaPageElement } from '../../shared/SchemaPage';
import { ImageFrameElement } from './ImageFrame';
```

- [ ] **Step 2 : Lancer le test pour le voir échouer**

Run: `pnpm test -- src/trajets/ui/TrajetEditorScreen.test.ts`
Expected: FAIL — `Property 'imageId' does not exist on type 'ImageFrameElement'` au typecheck, et à l'exécution des `undefined` au lieu des identifiants.

- [ ] **Step 3 : Exposer l'identifiant**

Dans `src/trajets/ui/ImageFrame.ts`, remplacer la classe vide :

```ts
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
```

Dans `createImageFrame`, juste après `element.append(content());` :

```ts
element.imageId = framed.imageId;
```

Compléter l'import de `dom.ts`, qui n'amenait que `query` :

```ts
import { query, requireConfiguration } from '../../shared/dom';
```

- [ ] **Step 4 : Lancer les tests pour les voir passer**

Run: `pnpm quality`
Expected: PASS — typecheck, lint, tous les tests, audit fallow vert.

- [ ] **Step 5 : Commit**

```bash
git add src/trajets/ui/ImageFrame.ts src/trajets/ui/TrajetEditorScreen.test.ts
git commit -F - <<'EOF'
Fait dire à un cadre quelle image il encadre

Il le savait sans le dire : sa fabrique refermait l'identifiant sans
l'exposer. Le glisser d'un point a besoin de nommer la page sous le doigt,
et la page qu'il contient ne peut pas répondre à sa place — son `pageId`
est une chaîne nue là où `ImageId` est marqué, et le lire de là demanderait
un `as`.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2 : Le flux de glissers

**Files:**

- Create: `src/trajets/ui/dragPointOnStack.ts`
- Test: `src/trajets/ui/dragPointOnStack.test.ts`

**Interfaces:**

- Consumes: `ImageFrameElement.imageId` (Task 1). `PointMarkerElement.pointId: PointId` et `createPointMarker(marker: DisplayedMarker): PointMarkerElement` de `./PointMarker` — `DisplayedMarker` vaut `{ pointId, number, fraction: number, coordonnee: Coordonnee }`. `eventsOf(target, type)` de `../../shared/events`. `query` / `queryAll` de `../../shared/dom`. `FractionVerticale.fromHeight(distance, hauteur)`, qui **borne déjà à [0, 1]** et **lève si la hauteur est nulle**.
- Produces: `DroppedPoint { pointId: PointId; imageId: ImageId; fraction: FractionVerticale }` et `dragsOnStack(stack: HTMLElement): Observable<DroppedPoint>`. La Task 3 s'y abonne.

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `src/trajets/ui/dragPointOnStack.test.ts` :

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { query } from '../../shared/dom';
import { Coordonnee } from '../domain/Coordonnee';
import { newImageId, newPointId, type ImageId, type PointId } from '../domain/ids';
import { dragsOnStack, type DroppedPoint } from './dragPointOnStack';
import { ImageFrameElement } from './ImageFrame';
import { createPointMarker, PointMarkerElement } from './PointMarker';

/**
 * jsdom ne connaît ni la capture de pointeur, ni `PointerEvent`. La première est
 * neutralisée, le second reconstruit au strict nécessaire : un `MouseEvent` qui
 * porte en plus l'identifiant du pointeur.
 */
class FauxPointerEvent extends MouseEvent {
    readonly pointerId: number;

    constructor(type: string, clientY: number, pointerId = 1) {
        super(type, { clientY, bubbles: true });
        this.pointerId = pointerId;
    }
}

/** Une pile de deux pages mesurées, et le repère posé sur celle du haut. */
interface Scene {
    pile: HTMLElement;
    pastille: HTMLElement;
    pointId: PointId;
    hautId: ImageId;
    basId: ImageId;
    deposes: DroppedPoint[];
}

/**
 * jsdom ne calcule aucune mise en page : les cadres sont posés à la main, sans
 * quoi `FractionVerticale.fromHeight` lèverait sur une hauteur nulle.
 *
 * La page du haut occupe [0, 1000], celle du bas [1100, 2100] — l'interstice de
 * 100 px entre les deux est délibéré : c'est lui qui met à l'épreuve « relâcher
 * hors de toute page garde la dernière position ».
 */
function cadre(imageId: ImageId, top: number, hauteur: number): ImageFrameElement {
    const element = new ImageFrameElement();
    element.imageId = imageId;
    const zone = document.createElement('div');
    zone.className = 'image-area';
    zone.getBoundingClientRect = () => new DOMRect(0, top, 800, hauteur);
    element.append(zone);
    return element;
}

function scene(): Scene {
    const pile = document.createElement('div');
    const hautId = newImageId();
    const basId = newImageId();
    const haut = cadre(hautId, 0, 1000);
    const bas = cadre(basId, 1100, 1000);
    pile.append(haut, bas);
    document.body.replaceChildren(pile);

    const pointId = newPointId();
    const repere = createPointMarker({
        pointId,
        number: 1,
        fraction: 0.5,
        coordonnee: Coordonnee.create(44.826, -0.556),
    });
    haut.append(repere);

    const deposes: DroppedPoint[] = [];
    dragsOnStack(pile).subscribe((depose) => deposes.push(depose));

    return {
        pile,
        pastille: query('.point-number', HTMLButtonElement, repere),
        pointId,
        hautId,
        basId,
        deposes,
    };
}

/** Rejoue un geste complet : appui sur la pastille, mouvements, relâchement. */
function glisser(scene: Scene, depart: number, ...etapes: number[]): void {
    scene.pastille.dispatchEvent(new FauxPointerEvent('pointerdown', depart));
    for (const y of etapes) {
        scene.pile.dispatchEvent(new FauxPointerEvent('pointermove', y));
    }
    scene.pile.dispatchEvent(new FauxPointerEvent('pointerup', etapes.at(-1) ?? depart));
}

beforeEach(() => {
    Element.prototype.setPointerCapture = function setPointerCapture() {
        // jsdom ne l'implémente pas ; le geste n'en dépend pas pour être testé.
    };
    document.body.replaceChildren();
});

describe('Glisser un point sur la pile', () => {
    describe('Étant donné un maintien qui ne dépasse pas le seuil', () => {
        it('alors rien n’est déposé : c’était un clic', () => {
            const scene1 = scene();

            glisser(scene1, 500, 502);

            expect(scene1.deposes).toEqual([]);
        });
    });

    describe('Étant donné un glisser franc à l’intérieur de la page', () => {
        it('alors le point est déposé à la fraction d’arrivée, sur la même image', () => {
            const scene1 = scene();

            glisser(scene1, 500, 520, 250);

            expect(scene1.deposes).toHaveLength(1);
            const depose = scene1.deposes[0];
            expect(depose?.pointId).toBe(scene1.pointId);
            expect(depose?.imageId).toBe(scene1.hautId);
            expect(depose?.fraction.value).toBeCloseTo(0.25, 6);
        });

        it('alors le repère a suivi le doigt, à sa nouvelle hauteur', () => {
            const scene1 = scene();

            glisser(scene1, 500, 520, 250);

            const repere = query('point-marker', PointMarkerElement, scene1.pile);
            expect(repere.style.top).toBe('25%');
        });
    });

    describe('Étant donné un glisser qui passe sur la page voisine', () => {
        it('alors c’est l’identifiant de cette page-là qui est déposé', () => {
            const scene1 = scene();

            glisser(scene1, 500, 900, 1600);

            expect(scene1.deposes[0]?.imageId).toBe(scene1.basId);
            expect(scene1.deposes[0]?.fraction.value).toBeCloseTo(0.5, 6);
        });
    });

    describe('Étant donné un doigt relâché dans l’interstice entre deux pages', () => {
        it('alors la dernière position survolée est conservée', () => {
            const scene1 = scene();

            // 1600 est sur la page du bas ; 1050 ne l'est sur aucune.
            glisser(scene1, 500, 1600, 1050);

            expect(scene1.deposes[0]?.imageId).toBe(scene1.basId);
            expect(scene1.deposes[0]?.fraction.value).toBeCloseTo(0.5, 6);
        });
    });

    describe('Étant donné un second doigt posé pendant un glisser', () => {
        it('alors il ne démarre pas un second geste', () => {
            const scene1 = scene();

            scene1.pastille.dispatchEvent(new FauxPointerEvent('pointerdown', 500));
            scene1.pile.dispatchEvent(new FauxPointerEvent('pointermove', 300));
            scene1.pastille.dispatchEvent(new FauxPointerEvent('pointerdown', 800, 2));
            scene1.pile.dispatchEvent(new FauxPointerEvent('pointerup', 300));

            expect(scene1.deposes).toHaveLength(1);
        });
    });

    describe('Étant donné un appui ailleurs que sur la pastille', () => {
        it('alors aucun glisser ne démarre', () => {
            const scene1 = scene();

            scene1.pile.dispatchEvent(new FauxPointerEvent('pointerdown', 500));
            scene1.pile.dispatchEvent(new FauxPointerEvent('pointermove', 250));
            scene1.pile.dispatchEvent(new FauxPointerEvent('pointerup', 250));

            expect(scene1.deposes).toEqual([]);
        });
    });

    describe('Étant donné un glisser achevé, quand le navigateur dispatche le clic qui suit', () => {
        it('alors ce clic n’atteint pas la pastille', () => {
            const scene1 = scene();
            const clics: string[] = [];
            scene1.pastille.addEventListener('click', () => clics.push('pastille'));

            glisser(scene1, 500, 520, 250);
            scene1.pastille.dispatchEvent(new MouseEvent('click', { bubbles: true }));

            expect(clics).toEqual([]);
        });

        it('alors le clic d’après, lui, passe : le piège n’est armé qu’une fois', () => {
            const scene1 = scene();
            const clics: string[] = [];
            scene1.pastille.addEventListener('click', () => clics.push('pastille'));

            glisser(scene1, 500, 520, 250);
            scene1.pastille.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            scene1.pastille.dispatchEvent(new MouseEvent('click', { bubbles: true }));

            expect(clics).toEqual(['pastille']);
        });
    });
});
```

- [ ] **Step 2 : Lancer les tests pour les voir échouer**

Run: `pnpm test -- src/trajets/ui/dragPointOnStack.test.ts`
Expected: FAIL — le module n'existe pas (`Failed to resolve import`).

- [ ] **Step 3 : Écrire le module**

> **⚠️ Bloc de code dépassé — ne pas le recopier.** Il montre le module tel
> qu'écrit à cette étape, avant que quatre revues ne le corrigent. Voir
> [« Ce que l'exécution a corrigé »](#ce-que-lexécution-a-corrigé) à la fin de
> ce fichier pour ce qui a réellement été livré.

Créer `src/trajets/ui/dragPointOnStack.ts` :

```ts
import {
    EMPTY,
    Observable,
    concatMap,
    exhaustMap,
    map,
    merge,
    of,
    skipWhile,
    takeLast,
    takeUntil,
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
    readonly depose: DroppedPoint;
}

/**
 * Les glissers de pastille achevés sur la pile, en flux.
 *
 * Pendant le geste, le repère est déplacé pour de vrai — page comprise : ce
 * qu'on voit avant de lâcher est ce qui sera enregistré. Le flux n'émet qu'au
 * relâchement, et seulement si le seuil a été franchi : en deçà, c'était un
 * clic, et il doit atteindre la pastille.
 */
export function dragsOnStack(stack: HTMLElement): Observable<DroppedPoint> {
    return eventsOf(stack, 'pointerdown').pipe(
        // `exhaustMap` et non `switchMap` : un second doigt posé pendant un
        // glisser est ignoré, il n'en démarre pas un autre.
        exhaustMap((event) => {
            const depart = departDeGlisser(event);
            return depart === null ? EMPTY : glisser(stack, depart);
        }),
    );
}

function glisser(stack: HTMLElement, depart: Depart): Observable<DroppedPoint> {
    // La capture se pose sur la pile, pas sur le repère : celui-ci change de
    // parent dès qu'il passe sur une autre page, et un élément retiré du
    // document perd sa capture.
    stack.setPointerCapture(depart.pointerId);
    let derniere: DroppedPoint | null = null;

    return eventsOf(stack, 'pointermove').pipe(
        takeUntil(merge(eventsOf(stack, 'pointerup'), eventsOf(stack, 'pointercancel'))),
        skipWhile((move) => Math.abs(move.clientY - depart.y) < SEUIL_DE_GLISSER),
        map((move) => {
            const cible = cibleSousLeDoigt(stack, depart.repere, move.clientY);
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
            if (depose === null) {
                return EMPTY;
            }
            avalerLeProchainClic(stack);
            return of(depose);
        }),
    );
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
    stack: HTMLElement,
    repere: PointMarkerElement,
    clientY: number,
): Cible | null {
    for (const cadre of queryAll('image-frame', ImageFrameElement, stack)) {
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
function avalerLeProchainClic(stack: HTMLElement): void {
    const avaler = (event: Event): void => {
        event.stopPropagation();
    };
    stack.addEventListener('click', avaler, { capture: true, once: true });
    // Désarmé au tour suivant. Le navigateur dispatche le clic dans la foulée du
    // `pointerup` ; sans ce retrait, un glisser au doigt — qui n'en produit
    // aucun — laisserait le piège armé pour un clic sans rapport.
    setTimeout(() => {
        stack.removeEventListener('click', avaler, { capture: true });
    }, 0);
}
```

- [ ] **Step 4 : Lancer les tests pour les voir passer**

Run: `pnpm test -- src/trajets/ui/dragPointOnStack.test.ts`
Expected: PASS — les huit tests.

> **⚠️ Note dépassée.** Cette note décrivait une fragilité du `setTimeout(0)`
> du bloc ci-dessus — remplacé depuis par un désarmement au `pointerdown`
> suivant, qui ne dépend d'aucun minuteur. Voir
> [« Ce que l'exécution a corrigé »](#ce-que-lexécution-a-corrigé).
>
> Si le test du « clic d'après » échoue, c'est que le `setTimeout` n'a pas eu lieu : Vitest exécute les tests en microtâches, et le retrait est une macrotâche. Insérer alors `await new Promise((resolve) => setTimeout(resolve, 0));` entre le premier clic et le second, et rendre le test `async`.

- [ ] **Step 5 : Vérifier l'ensemble et committer**

Run: `pnpm quality`
Expected: PASS.

```bash
git add src/trajets/ui/dragPointOnStack.ts src/trajets/ui/dragPointOnStack.test.ts
git commit -F - <<'EOF'
Fait du glisser d'une pastille un flux

Le geste traverse les pages, donc il n'appartient pas au repère : une
feuille ne connaît pas la pile. Il vit dans son propre module, testable sans
écran ni agrégat, et se dit en opérateurs nommés — `exhaustMap` parce qu'un
second doigt ne doit pas démarrer un second geste, `takeLast` parce qu'un
maintien sous le seuil ne doit rien émettre du tout.

La capture du pointeur se pose sur la pile et non sur le repère : celui-ci
change de parent en cours de route, et un élément retiré du document perd sa
capture.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3 : L'écran s'abonne, et le geste passe au doigt

**Files:**

- Modify: `src/trajets/ui/TrajetEditorScreen.ts`
- Modify: `src/style.css`
- Test: `src/trajets/ui/TrajetEditorScreen.test.ts`

**Interfaces:**

- Consumes: `dragsOnStack(stack)` et `DroppedPoint` (Task 2). Dans l'écran : `pagesContainer` (le `#images-stack`), `parti$`, `run`, et `applyToTrajetAndSave(modification)` — **le seul chemin d'écriture**, qui met en file, enregistre, resynchronise sur échec puis réaffiche.
- Produces: rien que d'autres tâches consomment.

- [ ] **Step 1 : Écrire les tests qui échouent**

Dans `src/trajets/ui/TrajetEditorScreen.test.ts`, ajouter le helper à côté de `cliquerLaPastille` :

```ts
/**
 * Rejoue un glisser de pastille dans l'écran monté. jsdom ne mesure rien : le
 * cadre de la page est posé à la main, sinon la fraction ne peut pas se calculer.
 */
function glisserLaPastille(element: HTMLElement, numero: number, de: number, vers: number): void {
    for (const zone of queryAll('.image-area', HTMLDivElement, element)) {
        zone.getBoundingClientRect = () => new DOMRect(0, 0, 800, 1000);
    }
    const pastille = queryAll('point-marker .point-number', HTMLButtonElement, element).find(
        (candidate) => candidate.textContent === String(numero),
    );
    if (pastille === undefined) {
        throw new Error(`Aucune pastille ${String(numero)} dans l’écran.`);
    }
    pastille.dispatchEvent(new FauxPointerEvent('pointerdown', de));
    query('#images-stack', HTMLDivElement, element).dispatchEvent(
        new FauxPointerEvent('pointermove', vers),
    );
    query('#images-stack', HTMLDivElement, element).dispatchEvent(
        new FauxPointerEvent('pointerup', vers),
    );
}
```

et la classe d'appoint, en tête du fichier, sous les imports :

```ts
/** jsdom ne connaît pas `PointerEvent` : un `MouseEvent` qui porte son identifiant suffit. */
class FauxPointerEvent extends MouseEvent {
    readonly pointerId = 1;

    constructor(type: string, clientY: number) {
        super(type, { clientY, bubbles: true });
    }
}
```

Oui, cette classe existe aussi dans `dragPointOnStack.test.ts`, et c'est
délibéré : six lignes d'échafaudage propre à chaque fichier de test, contre un
module partagé qui ferait dépendre un test d'un autre. Si une troisième copie
apparaissait un jour, ce serait le moment de l'extraire.

Puis les deux tests, après le `describe` du petit écran :

```ts
describe('Étant donné un point posé à mi-hauteur de sa page', () => {
    it('quand je glisse sa pastille au quart, alors c’est là qu’il est enregistré', async () => {
        const element = await attacherLEcran();

        glisserLaPastille(element, 1, 500, 250);
        await laisserLesPromessesSAchever();

        // Le rendu suit l'enregistrement : la hauteur relue est celle que
        // l'agrégat a retenue, pas celle que le geste avait peinte.
        expect(marqueurs(element).map((marqueur) => marqueur.style.top)).toEqual(['25%']);
        expect(echecs).toEqual([]);
    });

    it('quand je glisse, alors la carte n’est pas convoquée par le clic qui suit', async () => {
        const element = await attacherLEcran();

        glisserLaPastille(element, 1, 500, 250);
        query('point-marker .point-number', HTMLButtonElement, element).dispatchEvent(
            new MouseEvent('click', { bubbles: true }),
        );
        await laisserLesPromessesSAchever();

        expect(carteDesPoints.centrages()).toEqual([]);
    });
});
```

Et, en tête de `beforeEach`, neutraliser la capture que jsdom ne connaît pas :

```ts
Element.prototype.setPointerCapture = function setPointerCapture() {
    // jsdom ne l'implémente pas ; le geste n'en dépend pas pour être testé.
};
```

- [ ] **Step 2 : Lancer les tests pour les voir échouer**

Run: `pnpm test -- src/trajets/ui/TrajetEditorScreen.test.ts`
Expected: FAIL — la hauteur relue vaut toujours `50%` : personne n'écoute encore le flux.

- [ ] **Step 3 : Abonner l'écran**

Dans `src/trajets/ui/TrajetEditorScreen.ts`, ajouter l'abonnement après celui de `move-point-on-carte` :

```ts
// Le glisser d'une pastille : il a déjà déplacé le repère à l'écran, il ne
// reste qu'à enregistrer là où il l'a laissé. L'écriture n'a lieu qu'ici,
// au relâchement — pendant le geste, un rendu arracherait le nœud déplacé.
dragsOnStack(pagesContainer)
    .pipe(takeUntil(parti$))
    .subscribe(({ pointId, imageId, fraction }) => {
        run(
            applyToTrajetAndSave((currentTrajet) => {
                currentTrajet.movePointOnImage(pointId, imageId, fraction);
            }),
            'le déplacement du point',
        );
    });
```

et l'import :

```ts
import { dragsOnStack } from './dragPointOnStack';
```

- [ ] **Step 4 : Rendre le geste possible au doigt**

Dans `src/style.css`, compléter la règle `point-marker .point-number` (celle qui porte déjà `position: absolute` et `pointer-events: auto`) :

```css
point-marker .point-number {
    position: absolute;
    left: 0.25rem;
    top: calc((var(--point-line-thickness) + var(--point-badge-size)) / -2);
    /* Le repère est transparent aux clics ; la pastille, elle, en attend un. */
    pointer-events: auto;
    /* Sans quoi le doigt posé dessus fait défiler la page au lieu de glisser le
       point. On y perd d'amorcer un défilement depuis ces 26 px. */
    touch-action: none;
}

/* Le curseur reste `pointer` au survol — la pastille annonce d'abord ce qu'un
   clic en fait — et ne confirme le glisser qu'au moment où il commence. Écart
   assumé avec le marqueur de la carte, qui montre `grab` dès le survol. */
point-marker .point-number:active {
    cursor: grabbing;
}
```

- [ ] **Step 5 : Lancer les tests pour les voir passer**

Run: `pnpm quality`
Expected: PASS.

- [ ] **Step 6 : Commit**

```bash
git add src/trajets/ui/TrajetEditorScreen.ts src/trajets/ui/TrajetEditorScreen.test.ts src/style.css
git commit -F - <<'EOF'
Enregistre le point là où le glisser l'a laissé

Le geste peignait déjà le repère à sa nouvelle place ; il ne restait qu'à
faire suivre l'agrégat, par le chemin d'écriture unique — et seulement au
relâchement, un rendu en cours de geste arrachant le nœud déplacé.

Au doigt, il fallait encore réclamer le geste au navigateur : sans
`touch-action: none`, un doigt posé sur la pastille fait défiler la page.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4 : Les témoins de bout en bout, et l'exigence

**Files:**

- Modify: `e2e/points.spec.ts`
- Modify: `docs/EXIGENCES.md`

**Interfaces:**

- Consumes: `ouvrirUnTrajetAvecUnePage`, `ajouterUnPoint(page, fraction, carteShiftX)`, `hauteurDuRepere(page, index?)` (la hauteur du repère en pourcentage de sa page, `-1` si les cadres manquent), `requireDefined`, tous exportés par `e2e/helpers.ts`.
- Produces: rien.

- [ ] **Step 1 : Écrire les scénarios**

Dans `e2e/points.spec.ts`, ajouter à la fin du `describe` de fichier :

```ts
test('Étant donné un point sur le schéma, quand je glisse sa pastille, alors il change de hauteur', async ({
    page,
}) => {
    await ouvrirUnTrajetAvecUnePage(page);
    await ajouterUnPoint(page, 0.3, 0);
    const avant = await hauteurDuRepere(page);

    const pastille = requireDefined(
        await page.locator('point-marker .point-number').boundingBox(),
        'pastille du point 1',
    );
    const zone = requireDefined(
        await page.locator('.image-area').boundingBox(),
        'cadre de la page',
    );
    await page.mouse.move(pastille.x + pastille.width / 2, pastille.y + pastille.height / 2);
    await page.mouse.down();
    // Vers le bas d'un quart de page, en plusieurs pas : un saut unique
    // n'émet qu'un `pointermove`, et le geste doit tenir sur un vrai
    // mouvement.
    await page.mouse.move(pastille.x + pastille.width / 2, zone.y + zone.height * 0.6, {
        steps: 10,
    });
    await page.mouse.up();

    // Assertion qui réessaie : l'enregistrement et le re-rendu sont asynchrones.
    await expect.poll(() => hauteurDuRepere(page)).toBeGreaterThan(avant + 10);
});

test('Étant donné un glisser achevé, alors le clic qui le suit n’emmène pas à la carte', async ({
    page,
}) => {
    test.skip(
        requireDefined(page.viewportSize(), 'viewport').width >= 900,
        'Au-dessus de 900 px la carte est déjà à côté de la pile : son ouverture ne prouverait rien.',
    );
    await ouvrirUnTrajetAvecUnePage(page);
    await ajouterUnPoint(page, 0.3, 0);

    const pastille = requireDefined(
        await page.locator('point-marker .point-number').boundingBox(),
        'pastille du point 1',
    );
    await page.mouse.move(pastille.x + pastille.width / 2, pastille.y + pastille.height / 2);
    await page.mouse.down();
    await page.mouse.move(pastille.x + pastille.width / 2, pastille.y + 80, { steps: 10 });
    await page.mouse.up();

    // Si le clic passait, la carte viendrait par-dessus le schéma.
    await expect(page.locator('trajet-editor-screen')).not.toHaveClass(/carte-ouverte/);
});
```

- [ ] **Step 2 : Lancer les scénarios**

Run: `pnpm test:e2e points.spec.ts`
Expected: PASS sur les cinq navigateurs. Le second est marqué `skipped` sur `chromium`, `webkit` et `firefox`, qui tournent à 1280 px.

**Si le premier scénario échoue sur `android` uniquement**, ne pas élargir la tolérance : la [conception du 6 août](../specs/2026-08-06-supprime-la-liste-des-points-design.md) a mesuré qu'un marqueur déplaçable n'y recevait aucun événement au doigt. Le constater, le dire dans le rapport, et attendre l'arbitrage — un `test.skip` documenté est alors la sortie, jamais une assertion affaiblie.

**Une limite à dire, pas à contourner** : ces deux scénarios pilotent la **souris**, y compris sur les projets mobiles. `touch-action: none` ne les concerne donc pas, et **aucun témoin automatique ne le protège** — le retirer ne ferait rougir personne. C'est une vérification à faire sur un vrai appareil, et elle figure au bas de ce plan pour cette raison.

- [ ] **Step 3 : Mettre l'exigence d'accord**

Dans `docs/EXIGENCES.md`, ajouter après GR-15 :

```
| GR-16 | Glisser la pastille d'un point le déplace sur le schéma, page voisine comprise, sans que le clic qui suit emmène à la carte | `U dragPointOnStack.test.ts`, `U TrajetEditorScreen.test.ts`, `E e2e/points.spec.ts` |
```

- [ ] **Step 4 : Vérifier l'ensemble et committer**

Run: `pnpm quality && pnpm test:e2e`
Expected: PASS partout.

```bash
git add e2e/points.spec.ts docs/EXIGENCES.md
git commit -F - <<'EOF'
Prouve le glisser d'un point sur cinq navigateurs

Deux témoins : la hauteur change quand on tire la pastille, et le clic que
le navigateur dispatche derrière le relâchement n'emmène pas à la carte —
c'est la moitié du geste que rien d'autre ne protège.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Une fois les quatre tâches faites

`main` n'avance qu'en avant : rebaser si la branche a pris du retard, puis `git merge --ff-only`.

Deux vérifications qu'aucun test ne porte, et qui demandent un vrai appareil :

- **Le glisser au doigt**, que Playwright ne sait piloter qu'à la souris : `touch-action: none` n'est éprouvé par aucun témoin automatique.
- **Le franchissement de page**, qui suppose deux pages visibles à la fois — rare sur téléphone, et c'est précisément là que l'auto-défilement manquera.

---

## Ce que l'exécution a corrigé

Ce plan documente ce qui a été **écrit** à chaque étape — Step 3 de la Task 2
compris, marqué ci-dessus comme dépassé. Quatre revues successives y ont
trouvé des défauts que ce plan ne prescrivait pas de corriger, et une
découverte qu'il ne mentionnait pas du tout. Les cinq deltas, entre ce bloc et
ce qui a réellement été livré :

1. **La capture du pointeur se posait à l'appui, pas au franchissement du
   seuil.** `pile.setPointerCapture(depart.pointerId);` s'exécutait dès le
   `pointerdown` — avant même de savoir si le maintien deviendrait un glisser.
   Un simple clic prenait donc la capture lui aussi, et retargetait les
   événements souris de compatibilité qu'un clic en dérive. La version livrée
   ne pose la capture qu'au premier `pointermove` qui franchit les 3 px.
2. **Aucun filtre sur `pointerId`.** `pointermove`/`pointerup`/`pointercancel`
   s'écoutaient sans distinguer quel doigt les avait produits : un second
   doigt qui bouge ou se lève pendant le geste pouvait donc piloter — ou
   terminer — le geste du premier. La version livrée filtre chaque flux par
   `duMemeDoigt`.
3. **`pointercancel` fusionné dans le même `takeUntil` que `pointerup`, sans
   garde ni restauration.** Ce bloc traite une reprise du pointeur par le
   système comme un relâchement ordinaire : le repère restait à la dernière
   position survolée, et rien n'empêchait cette position d'être enregistrée.
   La version livrée distingue les deux : `pointercancel` restaure le repère
   à sa position d'origine, lève un drapeau `annule`, et le flux n'émet rien
   quand il est posé.
4. **Le clic suivant était désarmé par un `setTimeout(0)`.** La note du
   Step 4 en documentait déjà la fragilité sous Vitest ; en dehors des tests,
   ce minuteur pouvait retirer le piège avant qu'un clic tactile de
   compatibilité, dispatché dans une tâche postérieure, ne l'atteigne — le
   piège aurait alors laissé passer un clic qui visait encore la pastille
   déplacée. La version livrée désarme au `pointerdown` de l'interaction
   suivante, qui précède toujours son propre clic (et, depuis, au `keydown`
   d'une activation clavier — voir la revue finale).
5. **`draggable="false"` sur l'image, non anticipé par ce plan.** Une image
   est glissable nativement par défaut : saisir la pastille d'un point posée
   dessus et bouger la souris démarrait le glisser natif de l'image, que le
   navigateur annonce par un `pointercancel` — le geste s'arrêtait net, quel
   que soit l'élément qui avait reçu le `pointerdown`. La découverte et son
   correctif vivent dans `src/shared/SchemaPage.html`, hors de ce plan : la
   revue finale l'a jugée la trouvaille la plus importante de la branche.

Le module a aussi été renommé après coup (`glisserUnPointSurLaPile` →
`dragPointOnStack`) pour respecter l'entrée close du glossaire sur « pile » —
un défaut de nommage, pas un bug, donc distinct des cinq deltas ci-dessus.
