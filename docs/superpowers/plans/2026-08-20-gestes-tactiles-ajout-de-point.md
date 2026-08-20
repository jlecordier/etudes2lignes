# Gestes tactiles pour ajouter un point — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un appui long — puis ajustement du doigt — ou un tap à deux doigts pose un point sur le schéma, et les gestes natifs qui occupaient ces doigts (pincement, sélection) sont neutralisés.

**Architecture:** un reconnaisseur de gestes au niveau de `#images-stack`, frère de `dragPointOnStack`, qui possède les trois routes vers « un point ici tout de suite » (clic droit, appui long, tap à deux doigts) et le trait fantôme ; l'écran s'y abonne une fois. Deux fonctions de géométrie sont extraites pour être partagées avec le glisser. Le blocage des gestes natifs est une règle CSS sur `body` plus un `preventDefault` sur le `gesturestart` de WebKit.

**Tech Stack:** TypeScript, RxJS (`race`, `exhaustMap`, `timer`, `finalize`), Pointer Events, Vitest + jsdom + `TestScheduler`, Playwright.

**Spec:** [`docs/superpowers/specs/2026-08-20-gestes-tactiles-ajout-de-point-design.md`](../specs/2026-08-20-gestes-tactiles-ajout-de-point-design.md)

## Global Constraints

- **Probity `enforceTdd()` garde `src/**`** : un écrit de production est refusé tant qu'un test n'a pas été **vu échouer** dans la session. Chaque tâche est donc un cycle rouge → vert complet, et l'agent qui l'exécute doit lancer les tests lui-même. Le CSS et le HTML « tombent sur le chemin IA » de la règle : ils sont validés pareil, il leur faut donc aussi un test rouge d'abord.
- **Refactor sur vert seulement** : la même règle bloque le test suivant si un refactor évident reste à faire. Les extractions de ce plan se font donc juste après un vert, jamais avant.
- **Pas de `!`, pas de `as` de forme** (ADR 0002). DOM : `query(sel, Type, root)`. API navigateur optionnelle : annoter un optionnel local. `closest` : vérifier par `instanceof`.
- **Français complet, apostrophe ASCII `'`** partout — prose, commentaires, titres de tests, CSS, HTML.
- **Tests BDD par état** : `Étant donné / Quand / Alors`. **Aucun `vi.fn`, aucun `toHaveBeenCalled`** — on affirme sur des **valeurs**.
- **Noms** : verbe anglais, complément français si le mot est au lexique. `point` est au lexique.
- `pnpm quality` doit être vert avant de dire qu'une tâche est finie.
- **`LONG_PRESS_DELAY = 500`**, **`SLOP = 10`** — valeurs exactes, justifiées dans la spec.

---

## Structure des fichiers

| Fichier | Responsabilité |
| --- | --- |
| `src/shared/pinchZoom.ts` | **nouveau** — refuser le pincement de page à WebKit |
| `src/trajets/ui/pageFraction.ts` | **nouveau** — `fractionInArea`, `placeAt` : la géométrie d'**une** zone de page, sans rien connaître de la pile |
| `src/trajets/ui/pageUnderFinger.ts` | **nouveau** — `areaUnderFinger` : quelle page une hauteur d'écran désigne dans la pile |
| `src/trajets/ui/addPointOnStack.ts` | **nouveau** — le reconnaisseur : trois routes, un fantôme, un point par geste |
| `src/trajets/ui/dragPointOnStack.ts` | consomme les deux modules de géométrie au lieu de les détenir |
| `src/trajets/ui/ImageFrame.ts` | perd l'écouteur `contextmenu` et sa `fractionFromPosition` |
| `src/trajets/ui/intents.ts` | perd `right-click-page` |
| `src/trajets/ui/TrajetEditorScreen.ts` | s'abonne à `addsOnStack` |
| `src/style.css` | blocage sur `body`, exception `input`, sélecteur commun du pointillé |
| `index.html` | viewport non zoomable |
| `src/main.ts` | un appel à `blockPinchZoom` |

**Pourquoi deux modules de géométrie et non un.** `areaUnderFinger` a besoin d'`ImageFrameElement` ; `ImageFrame` a besoin de `fractionInArea`. Les mettre dans le même fichier créerait un cycle d'import `ImageFrame ↔ géométrie`. `pageFraction.ts` ne dépend que du domaine, donc personne n'a de cycle.

---

## Task 0 : trancher la question des dépendances inutilisées

**Files:**
- Modify: `.fallowrc.jsonc`
- Modify: `package.json` (selon la décision)

**Interfaces:**
- Consumes: rien
- Produces: un dépôt où `pnpm exec fallow audit` est vert, donc où le hook de pre-commit ne défait rien à chaque commit des tâches suivantes.

**Pourquoi cette tâche existe.** Mesuré avant d'écrire ce plan : `fallow` déclare `probity.config.ts` **fichier inutilisé** (il n'est atteignable depuis aucun `entry`), et `fallow fix` — que `.husky/pre-commit` lance en `--yes` à chaque commit — **retirerait `ts-morph` de `devDependencies`**. `jscpd` et `knip` échappent au même sort par l'angle mort déjà documenté pour `@typescript/native` : fallow ne relie pas un binaire à son paquet. Sans cette tâche, chaque commit des tâches suivantes modifierait `package.json` dans le dos de l'auteur.

- [ ] **Step 1 : constater le problème**

Run: `pnpm fallow`
Expected: la section `Unused files (1)` liste `probity.config.ts`.

- [ ] **Step 2 : rendre `probity.config.ts` atteignable**

`probity.config.ts` **est** un point d'entrée : Probity le charge, exactement comme Vite charge `src/main.ts` et Node les `scripts/*.mjs`. On le déclare donc comme tel, plutôt que d'ignorer le symptôme.

```jsonc
{
    "$schema": "./node_modules/fallow/schema.json",
    // Points d'entrée réels de l'application (le reste des entrées est fourni
    // automatiquement par les plugins fallow : Vite, PWA, Playwright…).
    // `probity.config.ts` en est un aussi : Probity le charge au démarrage de
    // l'agent, et sans cette ligne fallow le croit mort — puis retire les
    // paquets qu'il seul importe.
    "entry": ["src/main.ts", "scripts/*.mjs", "probity.config.ts"],
    // @typescript/native fournit le binaire `tsc` (TS 7 natif) des scripts
    // typecheck/build. fallow ne relie pas les binaires à leur paquet et le croit
    // inutilisé : on le garde explicitement pour que `fallow fix` n'y touche pas.
    "ignoreDependencies": ["@typescript/native"],
}
```

- [ ] **Step 3 : décider du sort de `ts-morph`, `jscpd`, `knip`**

Ces trois paquets ne sont importés par **aucun** fichier du dépôt et n'apparaissent dans **aucun** script de `package.json` — vérifié. Deux issues, au choix de l'auteur :

**(a) les retirer** — `pnpm remove ts-morph jscpd knip`, puis vérifier que Probity fonctionne toujours (ses seules dépendances pair sont des paquets de langue ast-grep optionnels).

**(b) les garder** — alors ajouter `"ts-morph"` à `ignoreDependencies` ci-dessus, sans quoi `fallow fix --yes` le supprimera au premier commit.

- [ ] **Step 4 : vérifier**

Run: `pnpm exec fallow audit`
Expected: verdict vert, aucun fichier inutilisé, aucune dépendance à retirer.

- [ ] **Step 5 : commit**

```bash
git add .fallowrc.jsonc package.json pnpm-lock.yaml
git commit -m "Fait connaître à fallow le point d'entrée qui lui manquait

probity.config.ts n'était atteignable depuis aucune entrée déclarée, donc
fallow le croyait mort et proposait de retirer les paquets qu'il est seul à
importer — ce que le hook de pre-commit aurait fait en --yes, sans le dire."
```

---

## Task 1 : refuser le pincement de page à WebKit

**Files:**
- Create: `src/shared/pinchZoom.ts`
- Test: `src/shared/pinchZoom.test.ts`
- Modify: `src/main.ts` (dernières lignes)

**Interfaces:**
- Consumes: rien
- Produces: `blockPinchZoom(target: EventTarget): void`

**Écart assumé avec la spec.** La spec annonçait un `declare global { interface WindowEventMap { gesturestart: Event } }`. On ne le fait pas : `addEventListener` a une surcharge `(type: string, listener)` qui donne déjà un `Event` typé — donc l'augmentation n'apporterait rien qu'on n'ait pas, et un paramètre `EventTarget` rend la fonction testable sans toucher au `window` global. Aucun cast n'est introduit ni évité par ce choix.

- [ ] **Step 1 : écrire le test qui échoue**

Create `src/shared/pinchZoom.test.ts` :

```ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { blockPinchZoom } from './pinchZoom';

/**
 * `gesturestart` est un événement de WebKit, absent de toute norme et de jsdom :
 * un `Event` nu suffit, puisque tout ce qu'on lui demande est de pouvoir être
 * annulé.
 */
function gesturestart(): Event {
    return new Event('gesturestart', { cancelable: true });
}

describe('Refuser le pincement de page', () => {
    describe('Étant donné une cible surveillée', () => {
        it('alors un gesturestart y est annulé', () => {
            const cible = new EventTarget();
            blockPinchZoom(cible);

            const evenement = gesturestart();
            cible.dispatchEvent(evenement);

            expect(evenement.defaultPrevented).toBe(true);
        });
    });

    describe("Étant donné une cible qu'on n'a pas surveillée", () => {
        it("alors son gesturestart n'est pas annulé : la surveillance ne fuit pas d'une cible à l'autre", () => {
            const surveillee = new EventTarget();
            const autre = new EventTarget();
            blockPinchZoom(surveillee);

            const evenement = gesturestart();
            autre.dispatchEvent(evenement);

            expect(evenement.defaultPrevented).toBe(false);
        });
    });
});
```

- [ ] **Step 2 : lancer le test pour le voir échouer**

Run: `pnpm test src/shared/pinchZoom.test.ts`
Expected: FAIL — `Failed to resolve import "./pinchZoom"`.

- [ ] **Step 3 : écrire l'implémentation minimale**

Create `src/shared/pinchZoom.ts` :

```ts
/**
 * Refuse à WebKit le pincement de page.
 *
 * `user-scalable=no` dans le viewport est ignoré par Safari iOS depuis iOS 10,
 * et `touch-action` sur `body` ne couvre pas tout : le seul levier qui reste est
 * `gesturestart`, un événement **non standard** que WebKit émet seul au monde
 * quand deux doigts commencent un pincement ou une rotation. L'annuler annule le
 * geste entier — inutile de guetter `gesturechange` en plus.
 *
 * Un `addEventListener` nu, et non un flux : il n'y a ici ni cadence, ni
 * fraîcheur, ni concurrence — les trois sujets de l'ADR 0009 — et l'écouteur vit
 * aussi longtemps que la page. Rien à défaire, donc rien à rendre.
 *
 * Le type de l'événement n'est pas déclaré dans `WindowEventMap` : la surcharge
 * `(type: string, listener)` d'`addEventListener` rend déjà un `Event`, qui porte
 * `preventDefault`. Une augmentation n'apporterait aucune garantie de plus.
 */
export function blockPinchZoom(target: EventTarget): void {
    target.addEventListener('gesturestart', (event) => {
        event.preventDefault();
    });
}
```

- [ ] **Step 4 : lancer le test pour le voir passer**

Run: `pnpm test src/shared/pinchZoom.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5 : brancher sur la fenêtre**

Modify `src/main.ts` — ajouter l'import et l'appel :

```ts
import { blockPinchZoom } from './shared/pinchZoom';
```

et, à la toute fin du fichier, après `enableOfflineMode();` :

```ts
// De la coquille, pas d'un écran : le pincement doit être refusé quel que soit
// l'écran monté, et personne n'a à s'en souvenir en partant.
blockPinchZoom(window);
```

- [ ] **Step 6 : vérifier et committer**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: tout vert.

```bash
git add src/shared/pinchZoom.ts src/shared/pinchZoom.test.ts src/main.ts
git commit -m "Refuse à WebKit le pincement qu'un viewport ne sait plus interdire

user-scalable=no est ignoré par Safari iOS depuis iOS 10 : le seul levier qui
reste est gesturestart, que WebKit émet seul au monde. Le test est le témoin du
câblage, pas du navigateur — aucun test d'ici ne peut prouver que Safari iOS
renonce, seul un appareil le dira."
```

---

## Task 2 : extraire la géométrie que deux gestes vont partager

**Files:**
- Create: `src/trajets/ui/pageFraction.ts`
- Create: `src/trajets/ui/pageUnderFinger.ts`
- Test: `src/trajets/ui/pageUnderFinger.test.ts`
- Modify: `src/trajets/ui/ImageFrame.ts` (retirer `fractionFromPosition`, importer `fractionInArea`)
- Modify: `src/trajets/ui/dragPointOnStack.ts` (`targetUnderFinger` et `placeMarker` deviennent des appels)

**Interfaces:**
- Consumes: `FractionVerticale.fromHeight`, `ImageFrameElement.imageId`
- Produces:
  - `fractionInArea(area: HTMLElement, clientY: number): FractionVerticale`
  - `placeAt(element: HTMLElement, area: HTMLElement, fraction: FractionVerticale): void`
  - `interface AimedArea { readonly area: HTMLDivElement; readonly imageId: ImageId; readonly fraction: FractionVerticale }`
  - `areaUnderFinger(stack: HTMLElement, clientY: number): AimedArea | null`

- [ ] **Step 1 : écrire le test qui échoue**

Create `src/trajets/ui/pageUnderFinger.test.ts` :

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { FractionVerticale } from '../domain/FractionVerticale';
import { newImageId, type ImageId } from '../domain/ids';
import { ImageFrameElement } from './ImageFrame';
import { placeAt } from './pageFraction';
import { areaUnderFinger } from './pageUnderFinger';

/**
 * jsdom ne calcule aucune mise en page : les cadres sont posés à la main, sans
 * quoi `FractionVerticale.fromHeight` lèverait sur une hauteur nulle.
 */
function frame(imageId: ImageId, top: number, hauteur: number): ImageFrameElement {
    const element = new ImageFrameElement();
    element.imageId = imageId;
    const area = document.createElement('div');
    area.className = 'image-area';
    area.getBoundingClientRect = () => new DOMRect(0, top, 800, hauteur);
    element.append(area);
    return element;
}

interface Pile {
    stack: HTMLElement;
    hautId: ImageId;
    basId: ImageId;
}

/** La page du haut occupe [0, 1000], celle du bas [1100, 2100] : 100 px d'interstice. */
function pile(): Pile {
    const stack = document.createElement('div');
    const hautId = newImageId();
    const basId = newImageId();
    stack.append(frame(hautId, 0, 1000), frame(basId, 1100, 1000));
    document.body.replaceChildren(stack);
    return { stack, hautId, basId };
}

beforeEach(() => {
    document.body.replaceChildren();
});

describe('La page sous le doigt', () => {
    describe("Étant donné une hauteur à l'intérieur de la page du haut", () => {
        it('alors cette page est désignée, à sa fraction', () => {
            const { stack, hautId } = pile();

            const vise = areaUnderFinger(stack, 250);

            expect(vise?.imageId).toBe(hautId);
            expect(vise?.fraction.value).toBeCloseTo(0.25, 6);
        });
    });

    describe('Étant donné une hauteur sur la page du bas', () => {
        it("alors c'est l'identifiant de cette page-là", () => {
            const { stack, basId } = pile();

            const vise = areaUnderFinger(stack, 1600);

            expect(vise?.imageId).toBe(basId);
            expect(vise?.fraction.value).toBeCloseTo(0.5, 6);
        });
    });

    describe("Étant donné une hauteur dans l'interstice entre deux pages", () => {
        it("alors aucune page n'est désignée", () => {
            const { stack } = pile();

            expect(areaUnderFinger(stack, 1050)).toBeNull();
        });
    });

    describe('Étant donné une page de hauteur nulle', () => {
        it("alors elle est sautée plutôt que de diviser par zéro", () => {
            const stack = document.createElement('div');
            stack.append(frame(newImageId(), 0, 0));
            document.body.replaceChildren(stack);

            expect(areaUnderFinger(stack, 0)).toBeNull();
        });
    });
});

describe('Poser un élément à une hauteur relative', () => {
    describe("Étant donné un élément qui n'est pas dans la zone visée", () => {
        it('alors il y est déplacé, et porte sa hauteur en pourcentage', () => {
            const { stack } = pile();
            const vise = areaUnderFinger(stack, 250);
            const element = document.createElement('div');
            document.body.append(element);

            placeAt(element, vise?.area ?? stack, FractionVerticale.create(0.25));

            expect(element.parentElement).toBe(vise?.area);
            expect(element.style.top).toBe('25%');
        });
    });
});
```

- [ ] **Step 2 : lancer le test pour le voir échouer**

Run: `pnpm test src/trajets/ui/pageUnderFinger.test.ts`
Expected: FAIL — `Failed to resolve import "./pageFraction"`.

- [ ] **Step 3 : écrire les deux modules**

Create `src/trajets/ui/pageFraction.ts` :

```ts
import { FractionVerticale } from '../domain/FractionVerticale';

/**
 * La fraction qu'une hauteur d'écran désigne dans la zone d'une page.
 *
 * C'est la zone qui mesure sa propre boîte : ni l'écran ni un geste n'ont à le
 * faire à sa place, ils ne connaissent que la fraction.
 */
export function fractionInArea(area: HTMLElement, clientY: number): FractionVerticale {
    const frame = area.getBoundingClientRect();
    return FractionVerticale.fromHeight(clientY - frame.top, frame.height);
}

/**
 * Pose un élément à une hauteur relative dans une zone, en l'y déplaçant s'il
 * était ailleurs.
 *
 * Partagé par le repère qu'un glisser déplace et par le fantôme qu'un appui long
 * traîne : les deux traversent les pages, et deux copies de cette règle
 * finiraient par ne plus dire la même chose.
 */
export function placeAt(
    element: HTMLElement,
    area: HTMLElement,
    fraction: FractionVerticale,
): void {
    if (element.parentElement !== area) {
        area.append(element);
    }
    element.style.top = `${String(fraction.value * 100)}%`;
}
```

Create `src/trajets/ui/pageUnderFinger.ts` :

```ts
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
```

- [ ] **Step 4 : lancer le test pour le voir passer**

Run: `pnpm test src/trajets/ui/pageUnderFinger.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5 : refactorer les deux consommateurs, sur vert**

Modify `src/trajets/ui/ImageFrame.ts` — supprimer la fonction `fractionFromPosition` et son JSDoc en bas du fichier, ajouter l'import, et remplacer les deux appels :

```ts
import { fractionInArea } from './pageFraction';
```

```ts
    area.addEventListener('click', (event) => {
        emitIntent(element, 'click-page', {
            imageId: framed.imageId,
            fraction: fractionInArea(area, event.clientY),
        });
    });
```

(le second appel, dans l'écouteur `contextmenu`, disparaît entièrement à la tâche 3 — le laisser tel quel ici en remplaçant seulement le nom de la fonction.)

Modify `src/trajets/ui/dragPointOnStack.ts` — `targetUnderFinger` délègue, et `placeMarker` disparaît :

```ts
import { areaUnderFinger } from './pageUnderFinger';
import { placeAt } from './pageFraction';
```

```ts
/**
 * La page visée sous le doigt, traduite en dépose pour ce point-ci. La
 * recherche elle-même est partagée avec l'appui long, qui traîne un fantôme
 * exactement de la même façon.
 */
function targetUnderFinger(
    stack: HTMLElement,
    marker: PointMarkerElement,
    clientY: number,
): Target | null {
    const vise = areaUnderFinger(stack, clientY);
    if (vise === null) {
        return null;
    }
    return {
        area: vise.area,
        drop: { pointId: marker.pointId, imageId: vise.imageId, fraction: vise.fraction },
    };
}
```

et, dans le `tap`/`map` qui appelait `placeMarker(start.marker, target)` :

```ts
                    placeAt(start.marker, target.area, target.drop.fraction);
```

Supprimer la fonction `placeMarker`, ainsi que les imports devenus inutiles (`query`, `queryAll`, `FractionVerticale`, `ImageFrameElement`) — les garder ferait échouer `pnpm lint`.

- [ ] **Step 6 : vérifier que rien n'a bougé pour le glisser**

Run: `pnpm test src/trajets/ui/dragPointOnStack.test.ts`
Expected: PASS, tous les tests existants, sans en modifier aucun. C'est le témoin de l'extraction : si un seul tombe, le comportement a changé.

- [ ] **Step 7 : vérifier et committer**

Run: `pnpm quality`
Expected: tout vert.

```bash
git add src/trajets/ui/pageFraction.ts src/trajets/ui/pageUnderFinger.ts src/trajets/ui/pageUnderFinger.test.ts src/trajets/ui/ImageFrame.ts src/trajets/ui/dragPointOnStack.ts
git commit -m "Sort de chez le glisser la géométrie qu'un second geste va partager

L'appui long va traîner un fantôme à travers les pages exactement comme le
glisser y traîne un repère. Écrire deux fois « quelle page contient cette
hauteur » les aurait laissés diverger, comme la pastille avait divergé entre le
schéma et la carte avant qu'une seule règle ne la dise.

Deux modules et non un : la recherche dans la pile connaît les cadres, qui
importeraient la géométrie en retour — un cycle. La géométrie d'une zone seule
ne dépend de rien."
```

---

## Task 3 : le module, la route du clic droit, et son déménagement

**Files:**
- Create: `src/trajets/ui/addPointOnStack.ts`
- Test: `src/trajets/ui/addPointOnStack.test.ts`
- Modify: `src/trajets/ui/ImageFrame.ts` (retirer l'écouteur `contextmenu`)
- Modify: `src/trajets/ui/intents.ts` (retirer `right-click-page`)
- Modify: `src/trajets/ui/TrajetEditorScreen.ts` (s'abonner au flux ; renommer `onImageRightClick`)

**Interfaces:**
- Consumes: `areaUnderFinger`, `fractionInArea`, `PageAimIntent`, `ImageFrameElement.imageId`, `eventsOf`
- Produces: `addsOnStack(stack: HTMLElement): Observable<PageAimIntent>`

**Ce que cette tâche ne change pas.** Le comportement observable est **identique** à la fin : `e2e/points.spec.ts` (GR-4, le clic droit) doit passer sans qu'une ligne y bouge. Seul le propriétaire change. L'arbitrage tactile est déjà posé ici parce que c'est lui qui justifie le déménagement.

- [ ] **Step 1 : écrire le test qui échoue**

Create `src/trajets/ui/addPointOnStack.test.ts` :

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { newImageId, type ImageId } from '../domain/ids';
import { addsOnStack } from './addPointOnStack';
import { ImageFrameElement } from './ImageFrame';
import type { PageAimIntent } from './intents';

/**
 * jsdom ne connaît pas `PointerEvent` : on le reconstruit au strict nécessaire,
 * un `MouseEvent` qui porte en plus l'identifiant et le type du pointeur. Le
 * type compte ici plus qu'ailleurs — c'est lui qui sépare la route du doigt de
 * celle de la souris.
 */
class FauxPointerEvent extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;

    constructor(
        type: string,
        clientY: number,
        { pointerId = 1, pointerType = 'touch', button = 0 } = {},
    ) {
        super(type, { clientY, bubbles: true, button, cancelable: true });
        this.pointerId = pointerId;
        this.pointerType = pointerType;
    }
}

interface Scene {
    stack: HTMLElement;
    /** L'hôte `<schema-page>` de la page du haut : « l'image nue ». */
    page: HTMLElement;
    /** La barre de la page du haut : hors de toute `.image-area`. */
    barre: HTMLElement;
    hautId: ImageId;
    visees: PageAimIntent[];
}

/** Un cadre mesuré, avec sa barre au-dessus et sa page dedans. */
function frame(imageId: ImageId, top: number, hauteur: number): ImageFrameElement {
    const element = new ImageFrameElement();
    element.imageId = imageId;
    const barre = document.createElement('div');
    barre.className = 'image-bar';
    const area = document.createElement('div');
    area.className = 'image-area';
    area.getBoundingClientRect = () => new DOMRect(0, top, 800, hauteur);
    const page = document.createElement('schema-page');
    area.append(page);
    element.append(barre, area);
    return element;
}

function scene(): Scene {
    const stack = document.createElement('div');
    const hautId = newImageId();
    const haut = frame(hautId, 0, 1000);
    stack.append(haut);
    document.body.replaceChildren(stack);

    const visees: PageAimIntent[] = [];
    addsOnStack(stack).subscribe((visee) => visees.push(visee));

    return {
        stack,
        page: query('schema-page', HTMLElement, haut),
        barre: query('.image-bar', HTMLDivElement, haut),
        hautId,
        visees,
    };
}

function clicDroit(cible: HTMLElement, clientY: number): MouseEvent {
    const evenement = new MouseEvent('contextmenu', {
        clientY,
        bubbles: true,
        cancelable: true,
    });
    cible.dispatchEvent(evenement);
    return evenement;
}

beforeEach(() => {
    document.body.replaceChildren();
});

describe("Poser un point d'un seul geste", () => {
    describe("Étant donné un clic droit sur l'image", () => {
        it('alors un point est visé à cette hauteur, sur cette page', () => {
            const scene1 = scene();

            clicDroit(scene1.page, 250);

            expect(scene1.visees).toHaveLength(1);
            expect(scene1.visees[0]?.imageId).toBe(scene1.hautId);
            expect(scene1.visees[0]?.fraction.value).toBeCloseTo(0.25, 6);
        });

        it('alors le menu natif est empêché', () => {
            const scene1 = scene();

            expect(clicDroit(scene1.page, 250).defaultPrevented).toBe(true);
        });
    });

    describe("Étant donné un clic droit sur la barre d'une page", () => {
        it("alors rien n'est visé, et le menu natif reste : on n'est pas sur l'image", () => {
            const scene1 = scene();

            const evenement = clicDroit(scene1.barre, 250);

            expect(scene1.visees).toEqual([]);
            expect(evenement.defaultPrevented).toBe(false);
        });
    });

    describe("Étant donné un doigt encore posé sur la pile quand le contextmenu arrive", () => {
        it("alors le menu est empêché mais rien n'est visé : c'est l'appui long d'Android, et c'est notre geste qui le traite", () => {
            const scene1 = scene();
            scene1.page.dispatchEvent(new FauxPointerEvent('pointerdown', 250));

            const evenement = clicDroit(scene1.page, 250);

            expect(evenement.defaultPrevented).toBe(true);
            expect(scene1.visees).toEqual([]);
        });

        it('alors le doigt relevé rend au clic droit son effet', () => {
            const scene1 = scene();
            scene1.page.dispatchEvent(new FauxPointerEvent('pointerdown', 250));
            document.documentElement.dispatchEvent(new FauxPointerEvent('pointerup', 250));

            clicDroit(scene1.page, 250);

            expect(scene1.visees).toHaveLength(1);
        });
    });

    describe("Étant donné une souris posée sur la pile", () => {
        it("alors elle ne compte pas comme un doigt : le clic droit garde son effet", () => {
            const scene1 = scene();
            scene1.page.dispatchEvent(
                new FauxPointerEvent('pointerdown', 250, { pointerType: 'mouse' }),
            );

            clicDroit(scene1.page, 250);

            expect(scene1.visees).toHaveLength(1);
        });
    });
});
```

Ajouter l'import de `query` en tête du fichier :

```ts
import { query } from '../../shared/dom';
```

- [ ] **Step 2 : lancer le test pour le voir échouer**

Run: `pnpm test src/trajets/ui/addPointOnStack.test.ts`
Expected: FAIL — `Failed to resolve import "./addPointOnStack"`.

- [ ] **Step 3 : écrire l'implémentation minimale**

Create `src/trajets/ui/addPointOnStack.ts` :

```ts
import { EMPTY, Observable, concatMap, defer, ignoreElements, merge, of, tap } from 'rxjs';
import { eventsOf } from '../../shared/events';
import { ImageFrameElement } from './ImageFrame';
import type { PageAimIntent } from './intents';
import { fractionInArea } from './pageFraction';

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

        return merge(compterLesDoigts$, clicsDroits$);
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
```

- [ ] **Step 4 : lancer le test pour le voir passer**

Run: `pnpm test src/trajets/ui/addPointOnStack.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5 : déménager, sur vert**

Modify `src/trajets/ui/ImageFrame.ts` — supprimer entièrement l'écouteur `contextmenu` et son commentaire :

```ts
    // Le menu contextuel natif du navigateur est remplacé par l'ajout direct du point.
    area.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        emitIntent(element, 'right-click-page', {
            imageId: framed.imageId,
            fraction: fractionInArea(area, event.clientY),
        });
    });
```

Modify `src/trajets/ui/intents.ts` — supprimer la ligne :

```ts
        'right-click-page': CustomEvent<PageAimIntent>;
```

Modify `src/trajets/ui/TrajetEditorScreen.ts` :

```ts
import { addsOnStack } from './addPointOnStack';
```

Remplacer l'abonnement à l'intention par l'abonnement au flux, à l'endroit où il était :

```ts
    // Les trois gestes qui posent un point d'un seul coup — clic droit, appui
    // long, tap à deux doigts. Un reconnaisseur, un seul abonnement : ce ne sont
    // pas des intentions de feuille, c'est un geste sur la pile.
    addsOnStack(pagesContainer)
        .pipe(takeUntil(parti$))
        .subscribe((aim) => {
            run(onDirectAdd(aim), "l'ajout du point");
        });
```

Renommer la fonction et son commentaire :

```ts
    /**
     * Un geste qui vise un endroit et veut un point tout de suite : le point est
     * posé là, sans passer par « Ajouter un point », et la coordonnée s'enchaîne
     * aussitôt. Un placement en cours est abandonné — c'est ce que le clic droit
     * faisait déjà avant d'avoir deux frères tactiles.
     */
    async function onDirectAdd({ imageId, fraction }: PageAimIntent): Promise<void> {
        changeMode(null);
        await addPointAtFraction(imageId, fraction);
    }
```

- [ ] **Step 6 : vérifier que le clic droit se comporte à l'identique**

Run: `pnpm quality`
Expected: tout vert.

Run: `pnpm test:e2e e2e/points.spec.ts`
Expected: PASS sur les cinq projets, **sans qu'une ligne du fichier e2e ait bougé** — c'est le témoin du déménagement. Le scénario « quand je fais un clic droit dessus, alors un point est ajouté directement » couvre GR-4.

- [ ] **Step 7 : commit**

```bash
git add src/trajets/ui/addPointOnStack.ts src/trajets/ui/addPointOnStack.test.ts src/trajets/ui/ImageFrame.ts src/trajets/ui/intents.ts src/trajets/ui/TrajetEditorScreen.ts
git commit -m "Donne un propriétaire unique aux gestes qui posent un point d'un coup

Le clic droit vivait dans le cadre d'une page. Deux gestes tactiles vont le
rejoindre, et sur Android l'un d'eux émet en plus un contextmenu natif pendant
que le doigt est encore posé : sans arbitrage, un seul appui long poserait deux
points. Un arbitrage veut un seul propriétaire, donc le clic droit déménage.

Le comportement ne bouge pas : e2e/points.spec.ts passe sans qu'une ligne y
change, et c'est ce qui le prouve."
```

---

## Task 4 : l'appui long arme un fantôme

**Files:**
- Modify: `src/trajets/ui/addPointOnStack.ts`
- Modify: `src/trajets/ui/addPointOnStack.test.ts`
- Modify: `src/style.css` (le sélecteur commun du pointillé)

**Interfaces:**
- Consumes: `addsOnStack` de la tâche 3, `areaUnderFinger`, `placeAt`
- Produces: rien de nouveau à l'extérieur — le même flux, avec deux entrées de plus

- [ ] **Step 1 : écrire les tests qui échouent**

Add to `src/trajets/ui/addPointOnStack.test.ts`. Le temps est virtuel : `vi.useFakeTimers()` ne convient pas, RxJS a son propre horloge. On injecte donc le `TestScheduler`… **non** : `timer` sans scheduler explicite utilise `asyncScheduler`. Pour rester lisible, l'appui long prend son délai d'un paramètre optionnel de scheduler, exactement comme le fait déjà la maison pour le temps virtuel.

Ajouter en tête du fichier :

```ts
import { TestScheduler } from 'rxjs/testing';
```

et remplacer la fabrique `scene()` par une version qui accepte un scheduler :

```ts
function scene(scheduler?: TestScheduler): Scene {
    const stack = document.createElement('div');
    const hautId = newImageId();
    const haut = frame(hautId, 0, 1000);
    stack.append(haut);
    document.body.replaceChildren(stack);

    const visees: PageAimIntent[] = [];
    addsOnStack(stack, scheduler).subscribe((visee) => visees.push(visee));

    return {
        stack,
        page: query('schema-page', HTMLElement, haut),
        barre: query('.image-bar', HTMLDivElement, haut),
        hautId,
        visees,
    };
}

/**
 * Le temps de l'appui long, en virtuel. `TestScheduler.run` ne sert pas ici à
 * comparer des diagrammes : le geste se joue en événements DOM, pas en
 * notifications, et ce qu'on veut d'un scheduler virtuel c'est **avancer**
 * l'horloge à la main entre deux gestes du doigt.
 */
function horloge(): TestScheduler {
    return new TestScheduler(() => {
        // Aucune égalité de diagramme à vérifier : les assertions portent sur
        // les visées produites, comme partout ailleurs dans ce dépôt.
    });
}
```

Puis les scénarios :

```ts
describe("Étant donné un doigt immobile sur l'image", () => {
    it('alors rien ne se vise avant les 500 ms', () => {
        const scheduler = horloge();
        const scene1 = scene(scheduler);
        scene1.page.dispatchEvent(new FauxPointerEvent('pointerdown', 250));

        scheduler.flush();
        document.documentElement.dispatchEvent(new FauxPointerEvent('pointerup', 250));

        expect(scene1.visees).toEqual([]);
    });
});
```

**Attention** : `scheduler.flush()` déroule tout le temps d'un coup, donc l'ordre des étapes compte. Les quatre scénarios de cette tâche s'écrivent ainsi — un relâchement **avant** le `flush` signifie « relâché avant l'heure », un `flush` **avant** le relâchement signifie « maintenu jusqu'à l'armement » :

```ts
describe("Étant donné un appui long maintenu puis relâché sans bouger", () => {
    it('alors un point est visé à la hauteur du doigt', () => {
        const scheduler = horloge();
        const scene1 = scene(scheduler);

        scene1.page.dispatchEvent(new FauxPointerEvent('pointerdown', 250));
        scheduler.flush();
        document.documentElement.dispatchEvent(new FauxPointerEvent('pointerup', 250));

        expect(scene1.visees).toHaveLength(1);
        expect(scene1.visees[0]?.imageId).toBe(scene1.hautId);
        expect(scene1.visees[0]?.fraction.value).toBeCloseTo(0.25, 6);
    });

    it("alors un fantôme est apparu à l'armement, puis retiré au relâchement", () => {
        const scheduler = horloge();
        const scene1 = scene(scheduler);

        scene1.page.dispatchEvent(new FauxPointerEvent('pointerdown', 250));
        scheduler.flush();

        const fantome = scene1.stack.querySelector('.point-ghost');
        expect(fantome).not.toBeNull();
        expect(fantome instanceof HTMLElement ? fantome.style.top : null).toBe('25%');

        document.documentElement.dispatchEvent(new FauxPointerEvent('pointerup', 250));

        expect(scene1.stack.querySelector('.point-ghost')).toBeNull();
    });
});

describe("Étant donné un doigt relevé avant les 500 ms", () => {
    it("alors rien n'est visé : c'était un tap, et il doit atteindre l'écran", () => {
        const scheduler = horloge();
        const scene1 = scene(scheduler);

        scene1.page.dispatchEvent(new FauxPointerEvent('pointerdown', 250));
        document.documentElement.dispatchEvent(new FauxPointerEvent('pointerup', 250));
        scheduler.flush();

        expect(scene1.visees).toEqual([]);
    });
});

describe("Étant donné un doigt qui dérive au-delà du seuil avant les 500 ms", () => {
    it("alors rien n'est visé : un doigt qui part ne tient pas un appui", () => {
        const scheduler = horloge();
        const scene1 = scene(scheduler);

        scene1.page.dispatchEvent(new FauxPointerEvent('pointerdown', 250));
        // 11 px : un de plus que `SLOP`.
        document.documentElement.dispatchEvent(new FauxPointerEvent('pointermove', 261));
        scheduler.flush();
        document.documentElement.dispatchEvent(new FauxPointerEvent('pointerup', 261));

        expect(scene1.visees).toEqual([]);
    });

    it('alors une dérive au ras du seuil ne tue rien', () => {
        const scheduler = horloge();
        const scene1 = scene(scheduler);

        scene1.page.dispatchEvent(new FauxPointerEvent('pointerdown', 250));
        // 10 px pile : la limite, donc encore un appui.
        document.documentElement.dispatchEvent(new FauxPointerEvent('pointermove', 260));
        scheduler.flush();
        document.documentElement.dispatchEvent(new FauxPointerEvent('pointerup', 260));

        expect(scene1.visees).toHaveLength(1);
    });
});

describe('Étant donné un pointercancel avant les 500 ms', () => {
    it("alors rien n'est visé, et aucun fantôme ne survit", () => {
        const scheduler = horloge();
        const scene1 = scene(scheduler);

        scene1.page.dispatchEvent(new FauxPointerEvent('pointerdown', 250));
        document.documentElement.dispatchEvent(new FauxPointerEvent('pointercancel', 250));
        scheduler.flush();

        expect(scene1.visees).toEqual([]);
        expect(scene1.stack.querySelector('.point-ghost')).toBeNull();
    });
});

describe("Étant donné un doigt immobile sur la pastille d'un point", () => {
    it("alors rien n'est visé : la pastille est la poignée du glisser", () => {
        const scheduler = horloge();
        const scene1 = scene(scheduler);
        const pastille = document.createElement('button');
        pastille.className = 'point-number';
        query('.image-area', HTMLDivElement, scene1.stack).append(pastille);

        pastille.dispatchEvent(new FauxPointerEvent('pointerdown', 250));
        scheduler.flush();
        document.documentElement.dispatchEvent(new FauxPointerEvent('pointerup', 250));

        expect(scene1.visees).toEqual([]);
    });
});

describe('Étant donné une souris maintenue immobile sur l\'image', () => {
    it("alors rien n'est visé : la route de la souris est le clic droit", () => {
        const scheduler = horloge();
        const scene1 = scene(scheduler);

        scene1.page.dispatchEvent(
            new FauxPointerEvent('pointerdown', 250, { pointerType: 'mouse' }),
        );
        scheduler.flush();
        document.documentElement.dispatchEvent(
            new FauxPointerEvent('pointerup', 250, { pointerType: 'mouse' }),
        );

        expect(scene1.visees).toEqual([]);
    });
});
```

- [ ] **Step 2 : lancer les tests pour les voir échouer**

Run: `pnpm test src/trajets/ui/addPointOnStack.test.ts`
Expected: FAIL — `addsOnStack` n'accepte pas de second argument, et aucun `.point-ghost` n'est créé.

- [ ] **Step 3 : écrire l'implémentation minimale**

Modify `src/trajets/ui/addPointOnStack.ts` — nouveaux imports, deux constantes, la branche de l'appui long. Le fantôme est un `<div class="point-ghost">`.

```ts
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
    switchMap,
    take,
    takeUntil,
    tap,
    timer,
} from 'rxjs';
import { SchemaPageElement } from '../../shared/SchemaPage';
import { areaUnderFinger } from './pageUnderFinger';
import { fractionInArea, placeAt } from './pageFraction';
```

```ts
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
 * Trois fois plus large que le `DRAG_THRESHOLD` du glisser, et pour deux raisons
 * qui vont dans le même sens : ce seuil-là ne compare qu'un écart **vertical**
 * — son commentaire dit que l'asymétrie est délibérée —, alors qu'ici un doigt
 * qui part de côté ne tient pas davantage un appui qu'un doigt qui descend ; et
 * un doigt posé sur du verre tremble plus qu'une souris tenue. 10 px est l'ordre
 * de grandeur du « touch slop » d'Android (8 dp).
 */
const SLOP = 10;
```

La signature gagne son scheduler :

```ts
export function addsOnStack(
    stack: HTMLElement,
    scheduler: SchedulerLike = asyncScheduler,
): Observable<PageAimIntent> {
```

et, dans le `defer`, la branche tactile :

```ts
        /** Le fantôme du geste en cours, s'il est armé. */
        let fantome: HTMLDivElement | null = null;

        const montrerFantome = (vise: AimedArea): void => {
            fantome ??= ghostElement(stack.ownerDocument);
            placeAt(fantome, vise.area, vise.fraction);
        };

        const retirerFantome = (): void => {
            fantome?.remove();
            fantome = null;
        };

        const appuisLongs$ = eventsOf(stack, 'pointerdown').pipe(
            // `exhaustMap` et non `switchMap` : un geste en cours n'en démarre
            // pas un autre, comme pour le glisser.
            exhaustMap((event) => {
                const debut = gestureStart(event, doigts);
                return debut === null ? EMPTY : longPress(stack, debut, scheduler, {
                    montrerFantome,
                    retirerFantome,
                });
            }),
        );

        return merge(compterLesDoigts$, clicsDroits$, appuisLongs$);
```

Le geste lui-même, en dehors de `addsOnStack` :

```ts
/** Le doigt qui a ouvert un geste, et la hauteur où il s'est posé. */
interface GestureStart {
    readonly pointerId: number;
    readonly y: number;
}

/** Ce que le geste fait voir pendant qu'il se joue. */
interface Ghost {
    montrerFantome: (vise: AimedArea) => void;
    retirerFantome: () => void;
}

/**
 * Le doigt qui ouvre un geste, ou rien.
 *
 * Trois conditions, et chacune écarte une confusion précise. La souris a le clic
 * droit, donc elle n'entre pas. La cible doit être **l'image nue** : le shadow
 * DOM retargeant l'événement, un doigt posé sur l'`<img>` a pour cible l'hôte
 * `<schema-page>`, donc ce seul `instanceof` écarte la pastille, les boutons
 * flottants et la barre de la page sans énumérer d'exclusions. Et le doigt doit
 * être le **premier** : sans ça, un second doigt posé pendant qu'un premier
 * glisse une pastille armerait un appui long à côté du glisser.
 */
function gestureStart(event: PointerEvent, doigts: ReadonlySet<number>): GestureStart | null {
    if (event.pointerType === 'mouse') {
        return null;
    }
    if (!(event.target instanceof SchemaPageElement)) {
        return null;
    }
    // L'ensemble contient déjà ce doigt-ci : c'est le seul qui soit permis.
    if (doigts.size > 1) {
        return null;
    }
    return { pointerId: event.pointerId, y: event.clientY };
}

function longPress(
    stack: HTMLElement,
    debut: GestureStart,
    scheduler: SchedulerLike,
    ghost: Ghost,
): Observable<PageAimIntent> {
    return defer(() => {
        // Écoutés sur `documentElement` et non sur la pile : sans capture, rien
        // ne garantit qu'un doigt levé ailleurs dans le document retarge la
        // pile — et un flux qui ne se terminerait jamais laisserait
        // l'`exhaustMap` souscrit pour de bon. Même raison, mot pour mot, que
        // dans `dragPointOnStack`.
        const fin = stack.ownerDocument.documentElement;
        const duMemeDoigt = (event: PointerEvent): boolean => event.pointerId === debut.pointerId;

        const derives$ = eventsOf(fin, 'pointermove').pipe(
            filter(duMemeDoigt),
            filter((move) => aDerive(debut, move)),
        );
        const releves$ = eventsOf(fin, 'pointerup').pipe(filter(duMemeDoigt));
        const annulations$ = eventsOf(fin, 'pointercancel').pipe(filter(duMemeDoigt));
        const sorties$ = merge(derives$, releves$, annulations$);

        return timer(LONG_PRESS_DELAY, scheduler).pipe(
            // Avant l'armement, tout sort du geste : une dérive dit que ce
            // n'était pas un appui, un relâchement dit que c'était un tap — et
            // ce tap doit atteindre l'écran, qui en fait un placement.
            takeUntil(sorties$),
            map(() => areaUnderFinger(stack, debut.y)),
            filter((vise): vise is AimedArea => vise !== null),
            tap((vise) => {
                ghost.montrerFantome(vise);
                vibrer();
            }),
            // Armé : le point ne naît qu'au relâchement, donc la carte ne
            // s'ouvre jamais sous un doigt encore posé.
            switchMap((vise) =>
                releves$.pipe(
                    take(1),
                    map(() => ({ imageId: vise.imageId, fraction: vise.fraction })),
                ),
            ),
            takeUntil(annulations$),
            finalize(() => {
                ghost.retirerFantome();
            }),
        );
    });
}

/** A-t-il assez bougé pour qu'on renonce ? Les deux axes comptent. */
function aDerive(debut: GestureStart, move: PointerEvent): boolean {
    return Math.abs(move.clientY - debut.y) > SLOP;
}

/**
 * Le trait qu'on verra avant que le point n'existe. Pas de pastille, pas de
 * boutons : c'est ce qui le distingue d'un vrai repère, et c'est assez franc
 * pour n'avoir pas besoin d'être atténué — il sert à lire une hauteur.
 */
function ghostElement(document: Document): HTMLDivElement {
    const element = document.createElement('div');
    element.className = 'point-ghost';
    return element;
}

/**
 * La vibration de l'armement. Elle ne dit pas « ça a marché » mais « vous pouvez
 * bouger maintenant ».
 *
 * `navigator.vibrate` est typé comme toujours présent alors qu'il est absent de
 * Safari iOS : on l'annote optionnel plutôt que de le caster, exactement comme
 * `main.ts` le fait pour `navigator.storage`.
 */
function vibrer(): void {
    const navigateur: { vibrate?: (pattern: number) => boolean } = navigator;
    navigateur.vibrate?.(10);
}
```

**Note pour l'implémenteur** : `aDerive` ne compare pour l'instant que l'axe vertical, parce que `FauxPointerEvent` ne porte qu'un `clientY` — l'axe horizontal viendra avec le test qui l'exige, pas avant. Le JSDoc de `SLOP` dit déjà l'intention ; ne pas écrire le code des deux axes tant qu'aucun test ne le réclame.

- [ ] **Step 4 : lancer les tests pour les voir passer**

Run: `pnpm test src/trajets/ui/addPointOnStack.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5 : donner au fantôme le trait du repère, sur vert**

Modify `src/style.css` — le bloc `point-marker` (celui qui porte le `border-top` en pointillé rouge) gagne un second sélecteur, et son commentaire dit pourquoi :

```css
/* Le trait qui traverse la page à la hauteur du point. En pointillé : plein, il
   effaçait sur toute la largeur la ligne de cotes qu'il est là pour désigner.

   Le fantôme d'un appui long porte **la même** déclaration, et non une cousine :
   il sert à lire où le point va tomber, donc il doit se lire comme le trait qui
   le remplacera. Deux règles jumelles auraient fini par diverger — c'est
   l'argument qui a déjà réuni la pastille du schéma et celle de la carte. Ce qui
   distingue le fantôme reste franc : ni pastille, ni boutons. */
point-marker,
.point-ghost {
    display: block;
    position: absolute;
    left: 0;
    right: 0;
    border-top: var(--point-line-thickness) dashed #dc2626;
    pointer-events: none;
}
```

- [ ] **Step 6 : vérifier et committer**

Run: `pnpm quality`
Expected: tout vert.

```bash
git add src/trajets/ui/addPointOnStack.ts src/trajets/ui/addPointOnStack.test.ts src/style.css
git commit -m "Rend au doigt le geste que le clic droit avait pour lui seul

Safari iOS n'émet plus contextmenu sur appui long depuis iOS 13 : le doigt
n'avait aucun équivalent du raccourci de la souris, et devait passer par
« Ajouter un point » puis viser. Le geste est donc reconnu ici.

Le point naît au relâchement et non à l'armement : à 500 ms, la carte des
coordonnées s'ouvrirait sous un doigt encore posé, et le relâchement y
choisirait une coordonnée au hasard. Le fantôme dit entre-temps où le point
tombera, et porte la déclaration du vrai repère plutôt qu'une jumelle."
```

---

## Task 5 : le doigt ajuste après l'armement

**Files:**
- Modify: `src/trajets/ui/addPointOnStack.ts`
- Modify: `src/trajets/ui/addPointOnStack.test.ts`

**Interfaces:**
- Consumes: `longPress` de la tâche 4
- Produces: rien de nouveau à l'extérieur

**Ce que cette tâche renverse.** Jusqu'ici la dérive tuait le geste. Après l'armement, elle **est** le geste : le fantôme suit le doigt, pages voisines comprises, et le point se pose là où on lâche. Un appui long armé devient exactement le glisser d'un point qui n'existe pas encore.

- [ ] **Step 1 : écrire les tests qui échouent**

Add to `src/trajets/ui/addPointOnStack.test.ts`. La scène a besoin d'une seconde page : remplacer `scene()` pour empiler deux cadres, comme le fait `dragPointOnStack.test.ts` — page du haut sur `[0, 1000]`, page du bas sur `[1100, 2100]`, 100 px d'interstice délibéré.

```ts
interface Scene {
    stack: HTMLElement;
    page: HTMLElement;
    barre: HTMLElement;
    hautId: ImageId;
    basId: ImageId;
    visees: PageAimIntent[];
}
```

```ts
function scene(scheduler?: TestScheduler): Scene {
    const stack = document.createElement('div');
    const hautId = newImageId();
    const basId = newImageId();
    const haut = frame(hautId, 0, 1000);
    const bas = frame(basId, 1100, 1000);
    stack.append(haut, bas);
    document.body.replaceChildren(stack);

    const visees: PageAimIntent[] = [];
    addsOnStack(stack, scheduler).subscribe((visee) => visees.push(visee));

    return {
        stack,
        page: query('schema-page', HTMLElement, haut),
        barre: query('.image-bar', HTMLDivElement, haut),
        hautId,
        basId,
        visees,
    };
}
```

Puis les scénarios :

```ts
describe('Étant donné un appui long armé, puis un doigt qui se déplace', () => {
    it('alors le point se pose à la nouvelle hauteur, pas à celle du départ', () => {
        const scheduler = horloge();
        const scene1 = scene(scheduler);
        const fin = document.documentElement;

        scene1.page.dispatchEvent(new FauxPointerEvent('pointerdown', 250));
        scheduler.flush();
        fin.dispatchEvent(new FauxPointerEvent('pointermove', 600));
        fin.dispatchEvent(new FauxPointerEvent('pointerup', 600));

        expect(scene1.visees).toHaveLength(1);
        expect(scene1.visees[0]?.fraction.value).toBeCloseTo(0.6, 6);
    });

    it('alors le fantôme a suivi le doigt', () => {
        const scheduler = horloge();
        const scene1 = scene(scheduler);
        const fin = document.documentElement;

        scene1.page.dispatchEvent(new FauxPointerEvent('pointerdown', 250));
        scheduler.flush();
        fin.dispatchEvent(new FauxPointerEvent('pointermove', 600));

        const fantome = scene1.stack.querySelector('.point-ghost');
        expect(fantome instanceof HTMLElement ? fantome.style.top : null).toBe('60%');
    });

    it("alors passer sur la page voisine change l'image visée", () => {
        const scheduler = horloge();
        const scene1 = scene(scheduler);
        const fin = document.documentElement;

        scene1.page.dispatchEvent(new FauxPointerEvent('pointerdown', 250));
        scheduler.flush();
        fin.dispatchEvent(new FauxPointerEvent('pointermove', 1600));
        fin.dispatchEvent(new FauxPointerEvent('pointerup', 1600));

        expect(scene1.visees[0]?.imageId).toBe(scene1.basId);
        expect(scene1.visees[0]?.fraction.value).toBeCloseTo(0.5, 6);
    });

    it("alors le fantôme a changé de page, il n'en reste pas deux", () => {
        const scheduler = horloge();
        const scene1 = scene(scheduler);
        const fin = document.documentElement;

        scene1.page.dispatchEvent(new FauxPointerEvent('pointerdown', 250));
        scheduler.flush();
        fin.dispatchEvent(new FauxPointerEvent('pointermove', 1600));

        expect(scene1.stack.querySelectorAll('.point-ghost')).toHaveLength(1);
    });

    it("alors relâcher dans l'interstice garde la dernière position valable", () => {
        const scheduler = horloge();
        const scene1 = scene(scheduler);
        const fin = document.documentElement;

        scene1.page.dispatchEvent(new FauxPointerEvent('pointerdown', 250));
        scheduler.flush();
        fin.dispatchEvent(new FauxPointerEvent('pointermove', 1600));
        // 1050 n'est sur aucune page : un geste abouti ne doit pas se perdre.
        fin.dispatchEvent(new FauxPointerEvent('pointermove', 1050));
        fin.dispatchEvent(new FauxPointerEvent('pointerup', 1050));

        expect(scene1.visees[0]?.imageId).toBe(scene1.basId);
        expect(scene1.visees[0]?.fraction.value).toBeCloseTo(0.5, 6);
    });

    it("alors un pointercancel n'en pose aucun, et ne laisse pas de fantôme", () => {
        const scheduler = horloge();
        const scene1 = scene(scheduler);
        const fin = document.documentElement;

        scene1.page.dispatchEvent(new FauxPointerEvent('pointerdown', 250));
        scheduler.flush();
        fin.dispatchEvent(new FauxPointerEvent('pointermove', 600));
        fin.dispatchEvent(new FauxPointerEvent('pointercancel', 600));

        expect(scene1.visees).toEqual([]);
        expect(scene1.stack.querySelector('.point-ghost')).toBeNull();
    });
});

describe('Étant donné le défilement de la page pendant un geste', () => {
    it("alors un touchmove d'avant l'armement n'est pas retenu : le doigt doit pouvoir défiler", () => {
        const scheduler = horloge();
        const scene1 = scene(scheduler);

        scene1.page.dispatchEvent(new FauxPointerEvent('pointerdown', 250));
        const glissement = new Event('touchmove', { bubbles: true, cancelable: true });
        scene1.page.dispatchEvent(glissement);

        expect(glissement.defaultPrevented).toBe(false);
        // Ne pas retenir le défilement mais laisser l'appui s'armer serait
        // incohérent : le geste doit être mort à ce stade.
        scheduler.flush();
        document.documentElement.dispatchEvent(new FauxPointerEvent('pointerup', 250));
        expect(scene1.visees).toEqual([]);
    });

    it("alors un touchmove d'après l'armement est retenu : sinon le navigateur emporterait le doigt", () => {
        const scheduler = horloge();
        const scene1 = scene(scheduler);

        scene1.page.dispatchEvent(new FauxPointerEvent('pointerdown', 250));
        scheduler.flush();
        const glissement = new Event('touchmove', { bubbles: true, cancelable: true });
        scene1.page.dispatchEvent(glissement);

        expect(glissement.defaultPrevented).toBe(true);
    });
});
```

**Note** : le premier des deux derniers scénarios exige que le `touchmove` d'avant l'armement **tue** le geste comme le fait un `pointermove` dérivant — un `touchmove` est un doigt qui bouge. C'est pourquoi son assertion va jusqu'à `visees`.

- [ ] **Step 2 : lancer les tests pour les voir échouer**

Run: `pnpm test src/trajets/ui/addPointOnStack.test.ts`
Expected: FAIL — le fantôme reste à `25%`, la visée garde la hauteur du départ, et aucun `touchmove` n'est retenu.

- [ ] **Step 3 : écrire l'implémentation minimale**

Modify `src/trajets/ui/addPointOnStack.ts`.

Dans `addsOnStack`, l'état de l'armement et l'écouteur non passif :

```ts
        // Armé ? C'est ce que l'écouteur non passif ci-dessous lit pour décider
        // s'il doit retenir le défilement.
        let arme = false;

        /**
         * Retenir le défilement, mais seulement une fois le geste armé.
         *
         * Sans ça, le premier mouvement d'après-armement ferait défiler la page :
         * `touch-action: pan-x pan-y` autorise le pan, donc le navigateur
         * prendrait la main et émettrait `pointercancel` — le geste mourrait
         * exactement quand on commence à ajuster.
         *
         * Deux contraintes mesurées dictent cette forme. **Sur la pile et non
         * sur le document** : Chrome force `passive: true` pour `touchstart` et
         * `touchmove` sur `window`, `document` et `body`, où un `preventDefault`
         * serait ignoré. **Posé d'avance et non à l'armement** : `cancelable`
         * bascule à `false` dès qu'un défilement est en cours, et le navigateur
         * décide au `touchstart` s'il peut défiler sans consulter le fil
         * principal.
         *
         * Le prix est connu et accepté : la pile devient une région tactile non
         * passive, donc un défilement amorcé sur le schéma attend ce
         * gestionnaire. Il lit un booléen et rend la main — c'est le minimum
         * possible, et c'est ce que paye déjà toute application de carte ou de
         * dessin, Leaflet compris sur son propre conteneur.
         */
        const retenirLeDefilement$ = eventsOf(stack, 'touchmove', { passive: false }).pipe(
            tap((event) => {
                if (arme) {
                    event.preventDefault();
                }
            }),
            ignoreElements(),
        );
```

`arme` est posé et rendu par le geste, donc `Ghost` s'élargit — renommer l'interface pour ce qu'elle est devenue :

```ts
/** Ce que le geste fait voir et retient pendant qu'il se joue. */
interface GestureView {
    armer: (vise: AimedArea) => void;
    suivre: (vise: AimedArea) => void;
    desarmer: () => void;
}
```

```ts
        const vue: GestureView = {
            armer: (vise) => {
                arme = true;
                fantome = ghostElement(stack.ownerDocument);
                placeAt(fantome, vise.area, vise.fraction);
                vibrer();
            },
            suivre: (vise) => {
                if (fantome !== null) {
                    placeAt(fantome, vise.area, vise.fraction);
                }
            },
            desarmer: () => {
                arme = false;
                fantome?.remove();
                fantome = null;
            },
        };
```

et `retenirLeDefilement$` rejoint le `merge` final :

```ts
        return merge(compterLesDoigts$, retenirLeDefilement$, clicsDroits$, appuisLongs$);
```

Dans `longPress`, l'après-armement devient un suivi. Le `takeUntil(sorties$)` ne garde que ce qui précède l'armement, et un nouveau flux prend la suite :

```ts
        return timer(LONG_PRESS_DELAY, scheduler).pipe(
            // Avant l'armement, tout sort du geste : une dérive dit que ce
            // n'était pas un appui, un relâchement dit que c'était un tap — et
            // ce tap doit atteindre l'écran, qui en fait un placement.
            takeUntil(merge(sorties$, glissements$)),
            map(() => areaUnderFinger(stack, debut.y)),
            filter((vise): vise is AimedArea => vise !== null),
            tap((vise) => {
                vue.armer(vise);
            }),
            // Armé : le doigt ajuste, et le point ne naît qu'au relâchement —
            // donc la carte ne s'ouvre jamais sous un doigt encore posé.
            switchMap((vise) => suivreLeDoigt(stack, debut, vise, vue)),
            takeUntil(annulations$),
            finalize(() => {
                vue.desarmer();
            }),
        );
```

où `glissements$` est le `touchmove` vu depuis le geste — un doigt qui glisse n'est pas un doigt qui tient :

```ts
        const glissements$ = eventsOf(fin, 'touchmove');
```

et le suivi :

```ts
/**
 * Le fantôme sous le doigt, jusqu'au relâchement.
 *
 * `dernier` retient la dernière page valable : aucune page sous le doigt — un
 * interstice, ou hors de la pile — laisse le fantôme où il était, et c'est cette
 * position-là qui sera enregistrée. Un geste abouti ne doit pas se perdre, c'est
 * la règle que le glisser a déjà tranchée.
 */
function suivreLeDoigt(
    stack: HTMLElement,
    debut: GestureStart,
    depart: AimedArea,
    vue: GestureView,
): Observable<PageAimIntent> {
    return defer(() => {
        const fin = stack.ownerDocument.documentElement;
        const duMemeDoigt = (event: PointerEvent): boolean => event.pointerId === debut.pointerId;
        let dernier = depart;

        const suivi$ = eventsOf(fin, 'pointermove').pipe(
            filter(duMemeDoigt),
            tap((move) => {
                const vise = areaUnderFinger(stack, move.clientY);
                if (vise !== null) {
                    dernier = vise;
                    vue.suivre(vise);
                }
            }),
            ignoreElements(),
        );

        const pose$ = eventsOf(fin, 'pointerup').pipe(
            filter(duMemeDoigt),
            take(1),
            map(() => ({ imageId: dernier.imageId, fraction: dernier.fraction })),
        );

        return merge(suivi$, pose$);
    });
}
```

- [ ] **Step 4 : lancer les tests pour les voir passer**

Run: `pnpm test src/trajets/ui/addPointOnStack.test.ts`
Expected: PASS, 22 tests.

- [ ] **Step 5 : vérifier et committer**

Run: `pnpm quality`
Expected: tout vert.

```bash
git add src/trajets/ui/addPointOnStack.ts src/trajets/ui/addPointOnStack.test.ts
git commit -m "Laisse le doigt ajuster la hauteur avant de lâcher

Viser juste du premier coup demandait de reposer le doigt et de recommencer.
Une fois armé, l'appui long est donc exactement le glisser d'un point qui
n'existe pas encore : le fantôme suit, pages voisines comprises, et le point se
pose là où on lâche.

Il fallait pour cela reprendre le doigt au navigateur, qui l'emportait dès le
premier mouvement. L'écouteur touchmove est sur la pile parce que Chrome force
passive sur le document, et posé d'avance parce que cancelable tombe dès qu'un
défilement a commencé. La pile devient une région non passive : c'est le prix,
il est assumé."
```

---

## Task 6 : le tap à deux doigts

**Files:**
- Modify: `src/trajets/ui/addPointOnStack.ts`
- Modify: `src/trajets/ui/addPointOnStack.test.ts`

**Interfaces:**
- Consumes: `longPress`, `suivreLeDoigt`, `gestureStart`
- Produces: rien de nouveau à l'extérieur

- [ ] **Step 1 : écrire les tests qui échouent**

Add to `src/trajets/ui/addPointOnStack.test.ts` :

```ts
describe('Étant donné deux doigts posés sur la même page', () => {
    it("alors relever l'un des deux pose un point à mi-hauteur", () => {
        const scheduler = horloge();
        const scene1 = scene(scheduler);

        scene1.page.dispatchEvent(new FauxPointerEvent('pointerdown', 200));
        scene1.page.dispatchEvent(new FauxPointerEvent('pointerdown', 400, { pointerId: 2 }));
        document.documentElement.dispatchEvent(new FauxPointerEvent('pointerup', 200));

        expect(scene1.visees).toHaveLength(1);
        // Le milieu de 200 et 400, sur une page de 1000 px de haut.
        expect(scene1.visees[0]?.fraction.value).toBeCloseTo(0.3, 6);
    });

    it("alors le point est posé sans attendre les 500 ms : les deux doigts sont déjà délibérés", () => {
        const scheduler = horloge();
        const scene1 = scene(scheduler);

        scene1.page.dispatchEvent(new FauxPointerEvent('pointerdown', 200));
        scene1.page.dispatchEvent(new FauxPointerEvent('pointerdown', 400, { pointerId: 2 }));
        document.documentElement.dispatchEvent(new FauxPointerEvent('pointerup', 200));
        // L'horloge n'a jamais avancé.

        expect(scene1.visees).toHaveLength(1);
    });
});

describe('Étant donné un appui long déjà armé quand un second doigt se pose', () => {
    it("alors un seul point est posé, à mi-hauteur : un geste ne pose jamais deux points", () => {
        const scheduler = horloge();
        const scene1 = scene(scheduler);

        scene1.page.dispatchEvent(new FauxPointerEvent('pointerdown', 200));
        scheduler.flush();
        scene1.page.dispatchEvent(new FauxPointerEvent('pointerdown', 400, { pointerId: 2 }));
        document.documentElement.dispatchEvent(new FauxPointerEvent('pointerup', 200));

        expect(scene1.visees).toHaveLength(1);
        expect(scene1.visees[0]?.fraction.value).toBeCloseTo(0.3, 6);
    });
});

describe('Étant donné deux doigts posés sur deux pages différentes', () => {
    it("alors rien n'est posé : le milieu ne désigne pas une page", () => {
        const scheduler = horloge();
        const scene1 = scene(scheduler);
        const pageDuBas = query('schema-page', HTMLElement, requireElementAt(
            queryAll('image-frame', ImageFrameElement, scene1.stack),
            1,
        ));

        scene1.page.dispatchEvent(new FauxPointerEvent('pointerdown', 200));
        pageDuBas.dispatchEvent(new FauxPointerEvent('pointerdown', 1600, { pointerId: 2 }));
        document.documentElement.dispatchEvent(new FauxPointerEvent('pointerup', 200));

        expect(scene1.visees).toEqual([]);
    });
});

describe("Étant donné un doigt déjà posé sur une pastille", () => {
    it("alors un second doigt sur l'image n'ouvre aucun geste : le premier pilote un glisser", () => {
        const scheduler = horloge();
        const scene1 = scene(scheduler);
        const pastille = document.createElement('button');
        pastille.className = 'point-number';
        query('.image-area', HTMLDivElement, scene1.stack).append(pastille);

        pastille.dispatchEvent(new FauxPointerEvent('pointerdown', 200));
        scene1.page.dispatchEvent(new FauxPointerEvent('pointerdown', 400, { pointerId: 2 }));
        scheduler.flush();
        document.documentElement.dispatchEvent(new FauxPointerEvent('pointerup', 400));

        expect(scene1.visees).toEqual([]);
    });
});
```

Ajouter aux imports du fichier de test :

```ts
import { requireElementAt } from '../../shared/array';
import { queryAll } from '../../shared/dom';
```

- [ ] **Step 2 : lancer les tests pour les voir échouer**

Run: `pnpm test src/trajets/ui/addPointOnStack.test.ts`
Expected: FAIL — aucun point n'est posé par deux doigts, et l'appui long armé en pose un à sa propre hauteur au lieu du milieu.

- [ ] **Step 3 : écrire l'implémentation minimale**

Modify `src/trajets/ui/addPointOnStack.ts`. Deux branches concourent, `race` les arbitre : celle qui émet la première désabonne l'autre, et c'est ce qui rend « un geste, un point » vrai sans y penser.

Dans `longPress`, ajouter la branche du second doigt et remplacer le `timer` nu par la course :

```ts
        // Un second doigt posé sur la **même** page pendant que le premier tient.
        // C'est le tap à deux doigts, et il n'attend pas les 500 ms : deux doigts
        // sont déjà un geste délibéré.
        const deuxDoigts$ = eventsOf(stack, 'pointerdown').pipe(
            filter((event) => event.pointerType !== 'mouse'),
            filter((event) => event.pointerId !== debut.pointerId),
            filter((event) => event.target instanceof SchemaPageElement),
            map((event) => areaUnderFinger(stack, (debut.y + event.clientY) / 2)),
            filter((vise): vise is AimedArea => vise !== null),
        );

        const appuiLong$ = timer(LONG_PRESS_DELAY, scheduler).pipe(
            takeUntil(merge(sorties$, glissements$)),
            map(() => areaUnderFinger(stack, debut.y)),
            filter((vise): vise is AimedArea => vise !== null),
        );

        return race(appuiLong$, deuxDoigts$).pipe(
            tap((vise) => {
                vue.armer(vise);
            }),
            switchMap((vise) => suivreLeDoigt(stack, debut, vise, vue)),
            takeUntil(annulations$),
            finalize(() => {
                vue.desarmer();
            }),
        );
```

**Deux points à ne pas manquer.**

`race` désabonne le perdant à la **première émission** du gagnant, mais un appui long déjà armé a **déjà** émis : la course est finie, et le second doigt ne serait plus entendu. Le test « appui long déjà armé quand un second doigt se pose » exige pourtant le milieu. La branche des deux doigts doit donc rester écoutée **après** l'armement, dans `suivreLeDoigt`, qui gagne un paramètre :

```ts
function suivreLeDoigt(
    stack: HTMLElement,
    debut: GestureStart,
    depart: AimedArea,
    vue: GestureView,
    secondDoigt$: Observable<AimedArea>,
): Observable<PageAimIntent> {
```

et, dans son corps, une branche de plus qui déplace le fantôme au milieu :

```ts
        const auMilieu$ = secondDoigt$.pipe(
            tap((vise) => {
                dernier = vise;
                vue.suivre(vise);
            }),
            ignoreElements(),
        );

        return merge(suivi$, auMilieu$, pose$);
```

Le relâchement, lui, doit accepter **l'un des deux** doigts. `pose$` ne filtre donc plus sur le seul doigt de départ :

```ts
        const doigtsDuGeste = new Set<number>([debut.pointerId]);

        const auMilieu$ = secondDoigt$.pipe(
            tap((vise) => {
                dernier = vise;
                vue.suivre(vise);
            }),
            ignoreElements(),
        );

        const pose$ = eventsOf(fin, 'pointerup').pipe(
            filter((event) => doigtsDuGeste.has(event.pointerId)),
            take(1),
            map(() => ({ imageId: dernier.imageId, fraction: dernier.fraction })),
        );
```

`secondDoigt$` doit donc porter aussi l'identifiant du doigt, pour l'ajouter à l'ensemble. Élargir son type :

```ts
/** Un second doigt, et l'endroit que le couple désigne. */
interface SecondFinger {
    readonly pointerId: number;
    readonly vise: AimedArea;
}
```

- [ ] **Step 4 : lancer les tests pour les voir passer**

Run: `pnpm test src/trajets/ui/addPointOnStack.test.ts`
Expected: PASS, 27 tests.

- [ ] **Step 5 : vérifier et committer**

Run: `pnpm quality`
Expected: tout vert.

```bash
git add src/trajets/ui/addPointOnStack.ts src/trajets/ui/addPointOnStack.test.ts
git commit -m "Ajoute le tap à deux doigts, sans qu'un geste puisse poser deux points

Deux doigts sont déjà délibérés : ils n'ont pas à attendre les 500 ms de
l'appui long. Aucun standard du web ne décrit ce geste — le seul événement
multi-doigts tout fait est le GestureEvent de WebKit, qui décrit un pincement
et non un tap — donc il se reconnaît ici.

C'est race qui garde l'invariant : la branche qui émet la première désabonne
l'autre, donc un second doigt pendant l'attente annule le minuteur au lieu de
lui répondre. Après l'armement la course est finie, et le second doigt est
alors écouté par le suivi, qui déplace le fantôme au milieu."
```

---

## Task 7 : neutraliser le zoom et la sélection

**Files:**
- Modify: `index.html`
- Modify: `src/style.css`
- Test: `e2e/gestes.spec.ts` (**nouveau**)

**Interfaces:**
- Consumes: rien
- Produces: rien de code — un comportement de navigateur

**Pourquoi l'e2e est ici le test rouge.** jsdom n'applique pas de feuille de style : aucun test unitaire ne peut lire un `touch-action` calculé. Et c'est l'e2e qui apporte la seule preuve possible de l'héritage à travers la frontière du shadow DOM.

- [ ] **Step 1 : écrire le test qui échoue**

Create `e2e/gestes.spec.ts` :

```ts
import { expect, test } from '@playwright/test';
import { ouvrirUnTrajetAvecUnePage } from './helpers';

test.describe('Gestes natifs neutralisés', () => {
    test("Étant donné l'application ouverte, alors le corps n'accorde au doigt que le défilement", async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);

        const touchAction = await page.evaluate(
            () => getComputedStyle(document.body).touchAction,
        );

        // `pan-x pan-y` et non `none` : la pile se lit au doigt. Ce qui part,
        // c'est le pincement et le double-tap-zoom.
        expect(touchAction).toBe('pan-x pan-y');
    });

    test("Étant donné une page de schéma affichée, alors son image ne se sélectionne pas — l'héritage traverse le shadow DOM", async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);

        // La seule preuve possible que la règle posée sur `body` atteint une
        // image vivant dans un shadow root : la lire là où elle est.
        const userSelect = await page.locator('schema-page').evaluate((host) => {
            const racine = host.shadowRoot;
            if (racine === null) {
                return 'pas de shadow root';
            }
            const image = racine.querySelector('img');
            return image === null ? 'pas d\'image' : getComputedStyle(image).userSelect;
        });

        expect(userSelect).toBe('none');
    });

    test('Étant donné le champ de latitude, alors il reste sélectionnable : corriger un chiffre le demande', async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);

        const userSelect = await page
            .locator('#latitude-input')
            .evaluate((champ) => getComputedStyle(champ).userSelect);

        expect(userSelect).toBe('text');
    });

    test("Étant donné le viewport, alors il interdit la mise à l'échelle par l'utilisateur", async ({
        page,
    }) => {
        await ouvrirUnTrajetAvecUnePage(page);

        const contenu = await page
            .locator('meta[name="viewport"]')
            .getAttribute('content');

        expect(contenu).toContain('user-scalable=no');
        expect(contenu).toContain('maximum-scale=1');
    });
});
```

- [ ] **Step 2 : lancer le test pour le voir échouer**

Run: `pnpm test:e2e e2e/gestes.spec.ts --project=chromium`
Expected: FAIL — `touchAction` vaut `auto`, `userSelect` vaut `auto`, et le viewport ne contient pas `user-scalable=no`.

- [ ] **Step 3 : écrire l'implémentation minimale**

Modify `index.html` :

```html
        <!-- Non zoomable : les gestes que le pincement et le double-tap
             occupaient servent à poser un point sur le schéma. Honoré par
             Android ; Safari iOS l'ignore depuis iOS 10, et c'est
             `src/shared/pinchZoom.ts` qui s'en charge là-bas. -->
        <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0, maximum-scale=1, user-scalable=no"
        />
```

Modify `src/style.css` — compléter la règle `body` qui existe déjà en tête de fichier :

```css
/* Les gestes natifs qui occupaient le doigt sont rendus à l'application : le
   pincement et le double-tap-zoom servaient à agrandir, ils servent maintenant à
   poser un point (`src/trajets/ui/addPointOnStack.ts`).

   Une seule règle suffit, parce que les propriétés en jeu ne se comportent pas
   pareil et qu'il faut les deux comportements. `user-select` et
   `-webkit-touch-callout` **s'héritent**, donc elles franchissent la frontière du
   shadow DOM et atteignent l'`<img>` de `<schema-page>` sans qu'on écrive une
   ligne dans son balisage. `touch-action` ne s'hérite pas — mais le navigateur
   intersecte les valeurs de l'élément **et de ses ancêtres** jusqu'au conteneur
   défilant, donc `body` gouverne quand même.

   La carte n'a pas à être exemptée : leaflet.css pose ses propres `touch-action`
   et `user-select` sur ses conteneurs, et arrive après dans le bundle. */
body {
    margin: 0;
    font-family: system-ui, sans-serif;
    color: #1f2937;
    background: #f9fafb;
    /* Surtout pas `none` : la pile se lit au doigt, et `none` tuerait ce
       geste-là. Ce qui part, c'est le pincement et le double-tap-zoom. */
    touch-action: pan-x pan-y;
    -webkit-user-select: none;
    user-select: none;
    /* Safari iOS et iPadOS seulement ; no-op sur tous les autres moteurs. */
    -webkit-touch-callout: none;
}

/* La seule exception, et elle suffit : le renommage d'un trajet passe par un
   `prompt()` natif, donc hors de portée du CSS. Les seuls vrais champs sont la
   latitude et la longitude, et corriger un chiffre fautif demande de pouvoir le
   sélectionner. */
input {
    -webkit-user-select: text;
    user-select: text;
}
```

- [ ] **Step 4 : lancer le test pour le voir passer**

Run: `pnpm test:e2e e2e/gestes.spec.ts`
Expected: PASS sur les cinq projets.

- [ ] **Step 5 : vérifier que rien d'autre n'a cassé**

Run: `pnpm test:e2e`
Expected: PASS. Regarder en particulier `e2e/carte-editeur.spec.ts` : si un glisser de marqueur Leaflet échoue, c'est que la carte n'a pas gardé ses propres règles, et la prémisse « leaflet.css arrive après » est fausse.

- [ ] **Step 6 : commit**

```bash
git add index.html src/style.css e2e/gestes.spec.ts
git commit -m "Rend à l'application les gestes que le navigateur s'octroyait

Le pincement et l'appui long servaient à zoomer et à sélectionner ; ils servent
maintenant à poser un point. Une seule règle sur body suffit, et c'est mesuré
plutôt que déduit : le test lit le user-select calculé sur l'image **dans le
shadow root**, seule preuve possible que l'héritage y entre.

Le prix est celui annoncé : plus de pincement pour agrandir une cote fine, et
les textes ne se sélectionnent plus. Les champs de saisie sont exceptés, sans
quoi corriger une latitude demanderait de tout effacer."
```

---

## Task 8 : prouver la chaîne complète, et l'invariant sur Android

**Files:**
- Modify: `e2e/points.spec.ts`
- Modify: `e2e/helpers.ts`

**Interfaces:**
- Consumes: tout ce qui précède
- Produces: `appuiLongSurLImage(page, fractionOfHeight, visualIndex?)` dans les aides e2e

- [ ] **Step 1 : écrire l'aide et le test qui échoue**

Add to `e2e/helpers.ts` :

```ts
/**
 * Un appui long sur l'image de l'éditeur : pose un point à cette fraction.
 *
 * Les événements sont **synthétisés**, et il n'y a pas d'alternative : Playwright
 * n'a aucune API pour maintenir un doigt — `touchscreen.tap` est instantané et
 * mono-doigt. `isTrusted` est donc faux, ce qui n'a pas d'incidence ici (aucun
 * code de l'application ne le lit), mais interdit de croire ce scénario
 * équivalent à un vrai doigt. La vérification réelle est un appareil.
 */
export async function appuiLongSurLImage(
    page: Page,
    fractionOfHeight: number,
    visualIndex = 0,
): Promise<void> {
    const { x, y } = await positionOnImage(page, fractionOfHeight, visualIndex);
    const cible = page.locator('schema-page').nth(visualIndex);
    await cible.dispatchEvent('pointerdown', {
        pointerId: 1,
        pointerType: 'touch',
        clientX: x,
        clientY: y,
        button: 0,
        isPrimary: true,
    });
    // Plus que les 500 ms de LONG_PRESS_DELAY, pour laisser l'armement arriver.
    await page.waitForTimeout(700);
    await cible.dispatchEvent('pointerup', {
        pointerId: 1,
        pointerType: 'touch',
        clientX: x,
        clientY: y,
    });
}
```

Add to `e2e/points.spec.ts` :

```ts
test("Étant donné une image, quand j'y fais un appui long, alors un point est posé à cette hauteur puis la coordonnée se choisit sur la carte", async ({
    page,
}) => {
    await ouvrirUnTrajetAvecUnePage(page);

    await appuiLongSurLImage(page, 0.6);
    await choisirUneCoordonneePourUnPoint(page);

    await expect(page.locator('point-marker')).toHaveCount(1);
    await expect.poll(() => hauteurDuRepere(page)).toBeGreaterThanOrEqual(58);
    expect(await hauteurDuRepere(page)).toBeLessThanOrEqual(62);
});

test("Étant donné un appui long, alors il ne pose qu'un seul point — le contextmenu natif d'Android compris", async ({
    page,
}) => {
    await ouvrirUnTrajetAvecUnePage(page);

    await appuiLongSurLImage(page, 0.6);
    await choisirUneCoordonneePourUnPoint(page);

    // Sur le projet `android`, le navigateur émet en plus son propre
    // `contextmenu` pendant que le doigt est posé. Si l'arbitrage du module
    // échouait, il y aurait deux repères — ou un second choix de coordonnée en
    // attente, qui ferait échouer l'assertion de compte.
    await expect(page.locator('point-marker')).toHaveCount(1);
    await expect(page.locator('#screen-carte')).toBeHidden();
});
```

Ajouter `appuiLongSurLImage` à l'import en tête de `e2e/points.spec.ts`.

- [ ] **Step 2 : lancer les tests pour les voir échouer, puis passer**

Run: `pnpm test:e2e e2e/points.spec.ts --project=chromium`
Expected: d'abord FAIL (l'aide n'existe pas), puis PASS après l'étape 1 — le code de production est déjà écrit par les tâches 4 à 6. C'est le seul endroit du plan où le rouge précède l'implémentation d'un cran : ces tests-là ne servent pas à faire naître du code mais à prouver une couture.

- [ ] **Step 3 : mesurer la prémisse du contextmenu sur Android**

Run: `pnpm test:e2e e2e/points.spec.ts --project=android`
Expected: PASS.

**Si le compte est de 2**, la prémisse « le `contextmenu` d'Android arrive pendant que le doigt est posé » est fausse. Le remède est alors le jumeau de `swallowNextClick` (`src/trajets/ui/dragPointOnStack.ts`) : à l'émission d'une visée, armer sur la pile un écouteur `contextmenu` en **capture** et `once`, qui appelle `preventDefault` et `stopPropagation`, désarmé par le `pointerdown` **et** le `keydown` suivants — pas par un minuteur, pour la raison que ce commentaire-là explique déjà. Écrire d'abord le test unitaire qui échoue (« un `contextmenu` reçu après le relâchement ne pose pas de second point »), puis le remède.

- [ ] **Step 4 : commit**

```bash
git add e2e/helpers.ts e2e/points.spec.ts
git commit -m "Prouve la couture de l'appui long, du doigt jusqu'à IndexedDB

Les tests unitaires prouvent les morceaux du geste ; celui-ci prouve qu'ils
tiennent ensemble jusqu'au repère affiché. Et sur le projet android il met à
l'épreuve la seule prémisse que ce module tient pour acquise : que le
contextmenu natif arrive pendant que le doigt est encore posé, ce qui est ce
qui rend l'arbitrage exact sans minuteur.

Les événements sont synthétisés faute de mieux — Playwright n'a aucune API
pour maintenir un doigt. Ce que ce test ne prouve donc pas est écrit dans la
spec, et il ne remplace pas un appareil."
```

---

## Task 9 : inscrire les exigences

**Files:**
- Modify: `docs/EXIGENCES.md`

**Interfaces:**
- Consumes: tout ce qui précède
- Produces: la traçabilité exigence ↔ test

- [ ] **Step 1 : ajouter les quatre lignes**

À la suite de `GR-21`, dans la section **Géoréférencement**, en respectant l'alignement du tableau existant :

```markdown
| GR-22 | Zoom et sélection natifs neutralisés dans toute l'application ; les champs de saisie restent sélectionnables ; la carte garde son pincement | `E e2e/gestes.spec.ts`, `U pinchZoom.test.ts` |
| GR-23 | Un appui long sur l'image arme un repère fantôme, que le doigt déplace jusqu'au relâchement, où le point se crée | `U addPointOnStack.test.ts`, `E e2e/points.spec.ts` |
| GR-24 | Un tap à deux doigts sur une même page crée un point à mi-hauteur entre les deux doigts | `U addPointOnStack.test.ts` |
| GR-25 | Un seul geste ne crée jamais plus d'un point, `contextmenu` natif d'Android compris | `U addPointOnStack.test.ts`, `E e2e/points.spec.ts` |
```

- [ ] **Step 2 : mettre à jour la ligne du clic droit**

`GR-4` ne change pas d'énoncé — le comportement est identique — mais gagne son témoin unitaire :

```markdown
| GR-4  | Clic droit sur l'image place un point directement puis choisit la coordonnée | `U addPointOnStack.test.ts`, `E e2e/points.spec.ts` |
```

- [ ] **Step 3 : commit**

```bash
git add docs/EXIGENCES.md
git commit -m "Inscrit les gestes tactiles dans la table des exigences

GR-24 n'a qu'un témoin unitaire, et c'est dit là plutôt que découvert plus
tard : Playwright n'a aucune API multi-touch, donc aucun e2e ne peut jouer un
tap à deux doigts."
```

---

## Task 10 : vérification finale

**Files:** aucun

- [ ] **Step 1 : les portes du dépôt**

Run: `pnpm quality`
Expected: typecheck, lint, tests unitaires et audit fallow — tout vert.

- [ ] **Step 2 : les scénarios de bout en bout, sur les cinq projets**

Run: `pnpm test:e2e`
Expected: PASS.

- [ ] **Step 3 : les tests de mutation sur le module du geste**

Run: `pnpm mutation`
Expected: lire les survivants, pas courir après le score. Deux endroits méritent l'attention : `LONG_PRESS_DELAY` et `SLOP` — un mutant qui survit à un changement de seuil dit qu'aucun test ne se tient à la limite, et les tâches 4 et 6 en posent justement un de chaque côté. **N'ajouter aucune assertion pour faire taire un survivant** (ADR 0006) : certains sont équivalents, d'autres portent sur des gardes que les invariants rendent inatteignables.

- [ ] **Step 4 : ce qu'aucune commande ne dira**

À vérifier sur un appareil, et à rapporter :

1. **Le pincement sur iPhone** — le WebKit de Playwright n'est pas Safari iOS et ne connaît pas `GestureEvent`.
2. **Le tap à deux doigts** — aucun e2e ne peut le jouer pour de vrai.
3. **Le confort du défilement** de la pile sous l'écouteur non passif, avec de vraies pages de schéma. Tranché sans réserve, donc pas bloquant — mais c'est la seule chose que ce travail dégrade, et personne ne la regarde à part un pouce.
4. **Le callout iOS** sur l'image, `-webkit-touch-callout` étant signalé défaillant sur iOS 26.1.

---

## Auto-relecture du plan

**Couverture de la spec.** Blocage CSS et viewport → tâche 7. `pinchZoom` → tâche 1. Géométrie partagée → tâche 2. Reconnaisseur et déménagement du clic droit → tâche 3. Appui long, fantôme, constantes → tâche 4. Ajustement et `touchmove` non passif → tâche 5. Tap à deux doigts et `race` → tâche 6. Arbitrage du `contextmenu` → tâches 3 (garde) et 8 (mesure). Exigences → tâche 9. Mutation et vérifications d'appareil → tâche 10. Le `swallowNextClick` que la spec refuse d'ajouter d'avance est traité comme un remède conditionnel à la tâche 8, step 3 — conformément à la spec.

**Écart assumé avec la spec, à signaler à la relecture** : le `declare global { WindowEventMap }` de la spec n'est pas repris (tâche 1), la surcharge `(type: string, listener)` d'`addEventListener` donnant déjà le typage nécessaire. Et la spec annonçait un seul module de géométrie ; il en faut deux pour éviter un cycle d'import avec `ImageFrame` (tâche 2).

**Cohérence des types.** `AimedArea` est produite par `areaUnderFinger` (tâche 2) et consommée par `longPress`, `suivreLeDoigt` et `GestureView` (tâches 4 à 6). `PageAimIntent` existe déjà dans `intents.ts` et reste le type de sortie du flux. `placeAt(element, area, fraction)` garde la même signature chez ses trois appelants. `addsOnStack(stack, scheduler?)` gagne son second paramètre à la tâche 4 et ne change plus.

**Dette connue et voulue** : `aDerive` ne compare que l'axe vertical (tâche 4), parce que `FauxPointerEvent` ne porte qu'un `clientY`. L'axe horizontal viendra avec le test qui l'exigera — le JSDoc de `SLOP` dit l'intention sans que le code la devance.
