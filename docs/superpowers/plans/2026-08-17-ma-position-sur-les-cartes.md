# Ma position sur les cartes — plan d'implémentation

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE — utiliser
> `superpowers:subagent-driven-development` (recommandé) ou
> `superpowers:executing-plans` pour dérouler ce plan tâche par tâche. Les étapes
> sont des cases à cocher (`- [ ]`).

**But :** les deux cartes de l'application montrent la position qui pilote
l'appli — le GPS réel, ou la position simulée quand la simulation tourne.

**Architecture :** chaque carte reçoit un `Observable<DisplayedPosition>` et s'y
abonne elle-même ; le désabonnement est structurel (`unmount()` d'un côté, le
`Subject` du choix de l'autre). Le type est écrit par la capacité `carte`, qui
n'apprend jamais `SourceStatus` : les phrases lui arrivent déjà rédigées par
l'écran. Les écrans allument le GPS par `switchMap` sur « une carte est-elle
regardée ? », sans jamais ouvrir de seconde session.

**Pile :** TypeScript · Vite · DOM vanilla (custom elements natifs) · RxJS ·
Leaflet · Vitest · Playwright · pnpm.

**Spec :**
[`docs/superpowers/specs/2026-08-17-ma-position-sur-les-cartes-design.md`](../specs/2026-08-17-ma-position-sur-les-cartes-design.md)

## Contraintes globales

Elles s'appliquent à **toutes** les tâches, sans être répétées dans chacune.

- **Règle de dépendance** — `domain` ne dépend de rien ; `ports` du domaine
  seul ; `adapters`/`ui` des ports + domaine ; **seul `src/main.ts`** instancie
  les adapters concrets. `src/carte/**` n'importe aujourd'hui que
  `trajets/domain/{Coordonnee,ids}`, `shared/dom` et `rxjs` : **ne jamais y faire
  entrer `suivi/`**.
- **Lexique mot à mot (ADR 0007)** — chaque mot d'un identifiant reste français
  s'il figure dans la liste close du
  [Lexique](../../GLOSSAIRE.md#lexique), passe à l'anglais sinon, et **l'ordre
  des mots suit l'anglais**. Restent français : `carte`, `point`, `repère`,
  `coordonnée`, `schéma`, `trajet`, `simulation`, `suivi`. `position` **n'y est
  pas** → technique (orthographe identique). `marqueur` → `marker`. `précision`
  est à double vie : français pour la qualité du fix (`imprecisionMetres`),
  `accuracy` pour la valeur d'API. La prose, les titres de tests BDD et les pas
  de scénario e2e restent français.
- **Aucun `!`, aucun `as` de forme (ADR 0002)** — accès indexé →
  `requireElementAt` ; DOM → `query('#id', HTMLXxxElement)` ; API navigateur
  typée présente mais optionnelle → annoter un local optionnel.
- **Jamais désactiver une règle de lint** pour esquiver un constat.
- **Tests BDD par l'état** — `Étant donné / Quand / Alors`, **aucun `vi.fn`,
  aucun `toHaveBeenCalled`**. Fakes écrits à la main, `TestScheduler` pour le
  temps virtuel, assertions sur les **valeurs produites**.
- **Le temps est un flux (ADR 0009)** — chaque `subscribe` d'écran pend à son
  `takeUntil(parti$)`.
- **Une valeur ne s'écrit qu'à un endroit** — le seuil 900 px n'existe que dans
  `style.css` (`--large-screen`), la géométrie d'un symbole aussi.
- **La règle de niveau** (demandée pour ce lot) — dans une même expression, tous
  les opérandes répondent à des questions du même ordre. Une lecture DOM brute
  (`classList.contains`, `getBoundingClientRect().height === 0`) ne se mélange
  pas à un prédicat nommé : on lui donne un nom, et la plomberie descend d'un
  cran.
- **Chaque tâche finit verte** : `pnpm typecheck && pnpm lint && pnpm test`.
  `pnpm quality` avant de dire que le lot est fini.

---

## Structure des fichiers

**Créés**

| Fichier                                | Responsabilité                                                                                        |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/carte/adapters/positionLayers.ts` | les couches de « ma position » — disque et cercle —, posées par **un seul** code pour les deux cartes |

**Modifiés**

| Fichier                                           | Ce qui y change                                                |
| ------------------------------------------------- | -------------------------------------------------------------- |
| `src/suivi/domain/sourceStatus.ts`                | `imprecise` porte la coordonnée qu'elle a mesurée              |
| `src/suivi/adapters/GeolocationPositionSource.ts` | le fix grossier n'est plus réduit à son `accuracy`             |
| `src/carte/ports/CarteDesPointsPort.ts`           | `DisplayedPosition` ; `showPosition(position$)`                |
| `src/carte/ports/CoordonneeSelectorPort.ts`       | `choose` gagne `position$`                                     |
| `src/carte/adapters/fitting.ts`                   | `fitToPoints` englobe la position                              |
| `src/carte/adapters/LeafletCarteDesPoints.ts`     | marqueur, cercle, abonnement qui meurt avec `unmount`          |
| `src/carte/adapters/LeafletCoordonneeSelector.ts` | idem, abonnement qui pend au choix ; barre et bouton           |
| `src/suivi/ui/SuiviScreen.ts`                     | rediffusion de la position, mode retenu, `EMPTY` en simulation |
| `src/trajets/ui/TrajetEditorScreen.ts` + `.html`  | `positionSource`, visibilité des cartes, barre de position     |
| `src/main.ts`                                     | `realSource` injecté aussi dans l'éditeur                      |
| `index.html`, `src/style.css`                     | la barre du plein écran, le symbole, le cercle                 |

---

## Tâche 1 : L'état `imprecise` garde la coordonnée qu'il a mesurée

**Fichiers :**

- Modifier : `src/suivi/domain/sourceStatus.ts`
- Modifier : `src/suivi/adapters/GeolocationPositionSource.ts`
- Tester : `src/suivi/adapters/GeolocationPositionSource.test.ts`

**Interfaces :**

- Produit : `SourceStatus` dont la variante imprécise devient
  `{ kind: 'imprecise'; imprecisionMetres: number; position: Coordonnee }`.
  Les tâches 5 et 6 la lisent pour fabriquer un `DisplayedPosition`
  `approximative`.

- [ ] **Étape 1 : écrire les tests qui échouent**

Dans `src/suivi/adapters/GeolocationPositionSource.test.ts`, **remplacer** les
deux assertions existantes sur `imprecise` (le fix à 5 km, ligne ~242, et le
chien de garde à 8 km, ligne ~262) :

```ts
expect(positions(events)).toEqual([]);
expect(statuses(events).at(-1)).toEqual({
    kind: 'imprecise',
    imprecisionMetres: 5_000,
    position: Coordonnee.create(46.58, 0.34),
});
```

```ts
expect(statuses(events).at(-1)).toEqual({
    kind: 'imprecise',
    imprecisionMetres: 8_000,
    position: Coordonnee.create(46.01, 0.11),
});
```

Puis **ajouter**, dans le même `describe('Étant donné un fix vraiment trop imprécis (5 km)')` :

```ts
it('alors la coordonnée du fix grossier survit : elle ne cale pas la page, mais elle situe', () => {
    const testBed = unstartedSource();

    const events = raconte(
        [{ at: 1_000, fait: () => testBed.geolocation.emitFix(45.0, 1.5, 4_000) }],
        5_000,
        testBed,
    );

    const dernier = statuses(events).at(-1);
    expect(dernier?.kind).toBe('imprecise');
    expect(dernier).toEqual({
        kind: 'imprecise',
        imprecisionMetres: 4_000,
        position: Coordonnee.create(45.0, 1.5),
    });
});
```

- [ ] **Étape 2 : jouer le test et le voir échouer**

Run : `pnpm test src/suivi/adapters/GeolocationPositionSource.test.ts`
Attendu : ÉCHEC — les objets comparés n'ont pas de champ `position`.

- [ ] **Étape 3 : l'état porte la coordonnée**

`src/suivi/domain/sourceStatus.ts` — ajouter l'import et modifier la variante :

```ts
import type { Coordonnee } from '../../trajets/domain/Coordonnee';

/**
 * L'état d'une source de position, tel qu'une source le **mesure** : des mètres,
 * des millisecondes et une coordonnée, jamais une phrase. C'est
 * `sourceStatusText` (`presentation.ts`) qui rédige le texte destiné à
 * l'utilisateur — une source n'a pas à connaître la langue de l'interface ni ses
 * arrondis.
 *
 * - `attente` : démarrée, aucune position encore obtenue.
 * - `imprecise` : la source répond, mais trop grossièrement pour caler la page
 *   (voir `usableFix` dans `precisionDuFix.ts`). Elle dit quand même **où** :
 *   `usableFix` protège une décision — choisir une page du schéma — et une carte
 *   n'en prend aucune. Un fix à ± 8 km ne peut pas faire défiler le document,
 *   mais il situe très bien sur une carte de France.
 * - `perdue` : plus de position depuis `ageMs`.
 * - `permission-refusee` : l'utilisateur a refusé l'accès à sa position.
 * - `indisponible` : l'appareil n'offre pas de géolocalisation.
 */
export type SourceStatus =
    | { kind: 'attente' }
    | { kind: 'imprecise'; imprecisionMetres: number; position: Coordonnee }
    | { kind: 'perdue'; ageMs: number }
    | { kind: 'permission-refusee' }
    | { kind: 'indisponible' };
```

- [ ] **Étape 4 : la source cesse de jeter la coordonnée**

`src/suivi/adapters/GeolocationPositionSource.ts` — quatre retouches.

Ajouter l'import de type, sous celui de `precisionDuFix` :

```ts
import type { SourceStatus } from '../domain/sourceStatus';
```

Ajouter la fabrique, juste après `function toCoordonnee(fix: GeolocationPosition): Coordonnee`
(module, pas méthode : elle ne touche à aucun état) :

```ts
/**
 * Ce qu'un fix trop grossier apprend quand même : de combien il l'est, **et où**.
 * La coordonnée ne décide rien — `usableFix` a déjà refusé qu'elle cale la
 * page —, mais elle situe, et une carte n'en demande pas plus.
 */
function impreciseStatus(fix: GeolocationPosition): SourceStatus {
    return {
        kind: 'imprecise',
        imprecisionMetres: fix.coords.accuracy,
        position: toCoordonnee(fix),
    };
}
```

Dans `session()`, remplacer le flux `imprecisions$` (qui ne gardait qu'un nombre)
par `coarseFixes$` — le nom dit ce qui y circule, et il fait la paire avec
`preciseFixes$` juste au-dessus :

```ts
// Le fix entier, et non sa seule imprécision : trop grossier pour caler
// la page ne veut pas dire sans valeur. Ce qui décide reste `usableFix`.
const coarseFixes$ = fixes$.pipe(
    concatMap((fix) => (usableFix(fix.coords.accuracy) ? EMPTY : of(fix))),
    share(),
);
```

Puis, dans le `merge` final et l'appel au chien de garde :

```ts
return merge(
    positions$,
    coarseFixes$.pipe(map((fix) => statusEvent(impreciseStatus(fix)))),
    permissionDenied$,
    this.watchdog(preciseFixes$, coarseFixes$, permissionDenied$, restarts$),
).pipe(startWith(statusEvent({ kind: 'attente' })));
```

- [ ] **Étape 5 : le chien de garde répète la coordonnée, pas seulement les mètres**

Toujours dans `GeolocationPositionSource.ts`, la signature du chien de garde et
son flux d'imprécision fraîche :

```ts
    private watchdog(
        preciseFixes$: Observable<GeolocationPosition>,
        coarseFixes$: Observable<GeolocationPosition>,
        permissionDenied$: Observable<SourceEvent>,
        restarts$: Observable<unknown>,
    ): Observable<SourceEvent> {
```

```ts
// Le dernier fix grossier, tant qu'il est frais. Passé le silence toléré
// il ne dit plus rien de l'instant : annoncer « ± 1 km » sur la foi d'un
// fix vieux d'une minute reviendrait à l'inventer — et poser un marqueur
// sur sa coordonnée reviendrait à inventer deux fois.
const freshCoarseFix$: Observable<GeolocationPosition | null> = coarseFixes$.pipe(
    switchMap((fix) => concat(of(fix), timer(SILENCE_BEFORE_ALERT_MS).pipe(map(() => null)))),
    startWith(null),
);
```

et la fin de la méthode :

```ts
return silence$.pipe(
    withLatestFrom(freshCoarseFix$, denied$),
    filter(([, , denied]) => !denied),
    map(([{ everFixed, ageMs }, coarseFix]) => {
        // Le GPS répond, mais trop grossièrement pour caler la page : le
        // dire, plutôt que « signal perdu ».
        if (coarseFix !== null) {
            return statusEvent(impreciseStatus(coarseFix));
        }
        return statusEvent(everFixed ? { kind: 'perdue', ageMs } : { kind: 'attente' });
    }),
);
```

- [ ] **Étape 6 : réparer les autres constructeurs d'états**

Run : `pnpm typecheck`
Attendu : la liste exacte des fichiers qui construisent un `imprecise` sans
coordonnée. Pour chacun, ajouter `position: Coordonnee.create(<lat>, <lon>)` avec
une coordonnée du jeu déjà employé par le fichier (ne pas en inventer une
troisième). Candidat connu : `src/suivi/domain/presentation.test.ts`.

- [ ] **Étape 7 : jouer les tests et les voir passer**

Run : `pnpm typecheck && pnpm lint && pnpm test`
Attendu : PASSE — 0 erreur de type, 0 constat de lint, tous les tests verts.

- [ ] **Étape 8 : commiter**

```bash
git add src/suivi/domain/sourceStatus.ts src/suivi/adapters/GeolocationPositionSource.ts src/suivi/adapters/GeolocationPositionSource.test.ts src/suivi/domain/presentation.test.ts
git commit -m "Garde la coordonnée d'un fix que le suivi refuse

Le plafond de 3 km protège une décision : caler la page sur un fix plus
vague que le seuil « hors trajet » ferait croire qu'on a quitté la ligne.
Une carte ne décide rien, et ± 8 km y situe très bien — la coordonnée
n'était jetée que parce qu'aucune carte n'attendait le reste."
```

---

## Tâche 2 : Le cadrage sait englober une position

**Fichiers :**

- Modifier : `src/carte/adapters/fitting.ts`
- Tester : `src/carte/adapters/fitting.test.ts`
- Modifier : `src/carte/adapters/LeafletCarteDesPoints.ts:115` (site d'appel)
- Modifier : `src/carte/adapters/LeafletCoordonneeSelector.ts:54` (site d'appel)

**Interfaces :**

- Produit : `fitToPoints(carte: L.Map, points: readonly DisplayedPoint[], position: Coordonnee | null): void`.
  Les tâches 3 et 4 lui passent la position que l'adapter détient.

- [ ] **Étape 1 : écrire les tests qui échouent**

Dans `src/carte/adapters/fitting.test.ts`, ajouter `, null` aux six appels
existants de `fitToPoints`, puis ajouter deux cas avant le dernier `describe` :

```ts
describe("Étant donné les points d'un trajet et la position de l'utilisateur", () => {
    it('alors les deux tiennent dans la vue', () => {
        const carte = testCarte();

        fitToPoints(carte, [point(1, PARIS)], BORDEAUX);

        const vue = carte.getBounds();
        expect(vue.contains(L.latLng(PARIS.latitude, PARIS.longitude))).toBe(true);
        expect(vue.contains(L.latLng(BORDEAUX.latitude, BORDEAUX.longitude))).toBe(true);
    });
});

describe('Étant donné aucun point, mais une position connue', () => {
    it('alors la carte se cale dessus plutôt que sur la France entière', () => {
        const carte = testCarte();

        fitToPoints(carte, [], PARIS);

        expect(carte.getCenter().lat).toBeCloseTo(PARIS.latitude, 4);
        expect(carte.getCenter().lng).toBeCloseTo(PARIS.longitude, 4);
        expect(carte.getZoom()).toBe(12);
    });
});
```

- [ ] **Étape 2 : jouer le test et le voir échouer**

Run : `pnpm test src/carte/adapters/fitting.test.ts`
Attendu : ÉCHEC — `Expected 2 arguments, but got 3` au typecheck de Vitest, ou
`vue.contains(BORDEAUX)` faux.

- [ ] **Étape 3 : le cadrage prend un troisième repère**

`src/carte/adapters/fitting.ts` — remplacer `fitToPoints` :

```ts
/**
 * Cadre la carte sur tous les points donnés **et sur la position de
 * l'utilisateur quand on la connaît** — sur la France entière quand il n'y a ni
 * l'un ni l'autre. Un seul cadrage pour toutes les cartes de l'appli : les deux
 * adapters divergeaient, ce qui donnait un cadrage différent selon l'écran.
 *
 * La position est un troisième paramètre, et non un `DisplayedPoint` de plus :
 * elle n'a ni identifiant ni numéro, et lui en fabriquer un serait un mensonge.
 *
 * Le cadrage n'utilise que ce qu'on sait à l'instant où il se calcule : une
 * position qui arrive ensuite ne le refait pas — un saut deux secondes après
 * l'ouverture, pour ce que le bouton « Ma position » donne à la demande.
 */
export function fitToPoints(
    carte: L.Map,
    points: readonly DisplayedPoint[],
    position: Coordonnee | null,
): void {
    const coordonnees = points.map((point) => point.coordonnee);
    if (position !== null) {
        coordonnees.push(position);
    }
    if (coordonnees.length === 0) {
        carte.setView(FRANCE_VIEW.center, FRANCE_VIEW.zoom, { animate: false });
        return;
    }
    const bounds = L.latLngBounds(coordonnees.map((coordonnee) => toLatLng(coordonnee)));
    carte.fitBounds(bounds, {
        padding: FIT_PADDING,
        maxZoom: SINGLE_POINT_ZOOM,
        animate: false,
    });
}
```

- [ ] **Étape 4 : rattacher les deux sites d'appel**

Dans `src/carte/adapters/LeafletCarteDesPoints.ts`, méthode `show`, la dernière
ligne devient `fitToPoints(carte, points, null);`.

Dans `src/carte/adapters/LeafletCoordonneeSelector.ts`, méthode `choose`, la
branche `initialCoordonnee === null` devient `fitToPoints(carte, reperes, null);`.

Les deux `null` sont provisoires : les tâches 3 et 4 y mettent la position que
chaque adapter détiendra.

- [ ] **Étape 5 : jouer les tests et les voir passer**

Run : `pnpm typecheck && pnpm test src/carte/`
Attendu : PASSE.

- [ ] **Étape 6 : commiter**

```bash
git add src/carte/adapters/fitting.ts src/carte/adapters/fitting.test.ts src/carte/adapters/LeafletCarteDesPoints.ts src/carte/adapters/LeafletCoordonneeSelector.ts
git commit -m "Fait entrer la position dans le cadrage commun aux deux cartes

Une seule règle de cadrage, dans le fichier qui existe pour empêcher les
deux cartes de diverger. La position n'est pas un point de plus : elle n'a
ni identifiant ni numéro, et lui en fabriquer un serait un mensonge."
```

---

## Tâche 3 : La carte de l'éditeur montre la position

**Fichiers :**

- Modifier : `src/carte/ports/CarteDesPointsPort.ts`
- Créer : `src/carte/adapters/positionLayers.ts`
- Modifier : `src/carte/adapters/LeafletCarteDesPoints.ts`
- Tester : `src/carte/adapters/LeafletCarteDesPoints.test.ts`
- Modifier : `src/style.css`
- Modifier : `src/trajets/ui/TrajetEditorScreen.test.ts` (le fake implémente le port)
- Modifier : `docs/EXIGENCES.md`

**Interfaces :**

- Consomme : `fitToPoints(carte, points, position)` (tâche 2).
- Produit :
    - `type DisplayedPosition = { kind: 'connue'; coordonnee } | { kind: 'approximative'; coordonnee; imprecisionMetres; message } | { kind: 'inconnue'; message }`
      dans `src/carte/ports/CarteDesPointsPort.ts` ;
    - `CarteDesPoints.showPosition(position$: Observable<DisplayedPosition>): void` ;
    - la classe `PositionLayers` dans `src/carte/adapters/positionLayers.ts`,
      avec `paint(carte: L.Map, position: DisplayedPosition): void`, `clear(): void`
      et `coordonnee(): Coordonnee | null`. **La tâche 4 s'en sert aussi**, et
      c'est tout l'intérêt : les deux cartes posent leurs couches par le même
      code, comme elles cadrent déjà par le même `fitToPoints`.

- [ ] **Étape 1 : écrire les tests qui échouent**

Dans `src/carte/adapters/LeafletCarteDesPoints.test.ts`, ajouter aux imports :

```ts
import { Subject } from 'rxjs';
import type { DisplayedPoint, DisplayedPosition } from '../ports/CarteDesPointsPort';
```

Ajouter deux relecteurs, à côté de `markers` :

```ts
function circles(carte: L.Map): L.Circle[] {
    const trouves: L.Circle[] = [];
    carte.eachLayer((couche) => {
        if (couche instanceof L.Circle) {
            trouves.push(couche);
        }
    });
    return trouves;
}

/**
 * Les marqueurs de « ma position », reconnus à la classe que la feuille de style
 * vise — c'est-à-dire au seul signe qui compte pour l'utilisateur.
 */
function positionMarkers(carte: L.Map): L.Marker[] {
    return markers(carte).filter(
        (marker) => marker.getElement()?.classList.contains('carte-position-marker') === true,
    );
}
```

Puis, avant le dernier `describe` du fichier, les cinq cas :

```ts
describe('Étant donné une position connue poussée dans le flux', () => {
    it('alors un marqueur la montre, sans voler le cadrage', () => {
        const { carteDesPoints, show, carte } = testBed();
        show([point(1, PARIS)]);
        const cadrage = { center: carte().getCenter(), zoom: carte().getZoom() };
        const positions$ = new Subject<DisplayedPosition>();
        carteDesPoints.showPosition(positions$);

        positions$.next({ kind: 'connue', coordonnee: BORDEAUX });

        expect(positionMarkers(carte()).map((marker) => marker.getLatLng().lat)).toEqual([
            BORDEAUX.latitude,
        ]);
        expect(carte().getCenter()).toEqual(cadrage.center);
        expect(carte().getZoom()).toBe(cadrage.zoom);
    });
});

describe('Étant donné une position trop imprécise pour caler la page', () => {
    it("alors elle est montrée quand même, cerclée de l'incertitude mesurée", () => {
        const { carteDesPoints, show, carte } = testBed();
        show([]);
        const positions$ = new Subject<DisplayedPosition>();
        carteDesPoints.showPosition(positions$);

        positions$.next({
            kind: 'approximative',
            coordonnee: BORDEAUX,
            imprecisionMetres: 8_000,
            message: 'Position approximative (± 8 km).',
        });

        expect(positionMarkers(carte())).toHaveLength(1);
        expect(circles(carte()).map((cercle) => cercle.getRadius())).toEqual([8_000]);
    });
});

describe('Étant donné une position devenue inconnue', () => {
    it("alors le marqueur et son cercle s'effacent tous les deux", () => {
        const { carteDesPoints, show, carte } = testBed();
        show([]);
        const positions$ = new Subject<DisplayedPosition>();
        carteDesPoints.showPosition(positions$);
        positions$.next({
            kind: 'approximative',
            coordonnee: BORDEAUX,
            imprecisionMetres: 8_000,
            message: 'Position approximative (± 8 km).',
        });

        positions$.next({ kind: 'inconnue', message: 'Signal GPS perdu.' });

        expect(positionMarkers(carte())).toEqual([]);
        expect(circles(carte())).toEqual([]);
    });
});

describe('Étant donné une position déjà connue, quand les points changent', () => {
    it('alors le cadrage recalculé englobe les deux', () => {
        const { carteDesPoints, carte } = testBed();
        const positions$ = new Subject<DisplayedPosition>();
        carteDesPoints.showPosition(positions$);
        positions$.next({ kind: 'connue', coordonnee: BORDEAUX });

        carteDesPoints.show(
            [point(1, PARIS)],
            () => undefined,
            () => undefined,
        );

        const vue = carte().getBounds();
        expect(vue.contains(L.latLng(PARIS.latitude, PARIS.longitude))).toBe(true);
        expect(vue.contains(L.latLng(BORDEAUX.latitude, BORDEAUX.longitude))).toBe(true);
    });
});

describe("Étant donné une carte qu'on démonte", () => {
    it("alors elle n'écoute plus la position : plus personne n'observe le flux", () => {
        const { carteDesPoints } = testBed();
        const positions$ = new Subject<DisplayedPosition>();
        carteDesPoints.showPosition(positions$);
        expect(positions$.observed).toBe(true);

        carteDesPoints.unmount();

        expect(positions$.observed).toBe(false);
    });
});
```

- [ ] **Étape 2 : jouer le test et le voir échouer**

Run : `pnpm test src/carte/adapters/LeafletCarteDesPoints.test.ts`
Attendu : ÉCHEC — `showPosition` n'existe pas sur `LeafletCarteDesPoints`.

- [ ] **Étape 3 : le port apprend ce qu'est une position affichée**

`src/carte/ports/CarteDesPointsPort.ts` — ajouter en tête l'import
`import type { Observable } from 'rxjs';`, puis, sous `DisplayedPoint` :

```ts
/**
 * Ce qu'une carte montre de « ma position » : la coordonnée quand on l'a, et
 * sinon la phrase qui dit pourquoi on ne l'a pas.
 *
 * Le `message` est **rédigé par l'écran**. Une carte ne connaît ni les états
 * d'une source de position ni la langue dans laquelle on les formule : elle
 * affiche un texte qu'on lui donne, comme n'importe quel bandeau. C'est ce qui
 * permet à cette capacité de continuer à ne rien savoir du suivi.
 *
 * `approximative` porte son incertitude en mètres parce qu'elle se **dessine** :
 * c'est le rayon du cercle. Une position acceptée n'en transporte aucune — la
 * source ne mesure l'imprécision que des fixes qu'elle refuse —, et en inventer
 * une serait mentir.
 */
export type DisplayedPosition =
    | { readonly kind: 'connue'; readonly coordonnee: Coordonnee }
    | {
          readonly kind: 'approximative';
          readonly coordonnee: Coordonnee;
          readonly imprecisionMetres: number;
          readonly message: string;
      }
    | { readonly kind: 'inconnue'; readonly message: string };
```

Et dans l'interface `CarteDesPoints`, entre `show` et `centerOn` :

```ts
    showPosition(position$: Observable<DisplayedPosition>): void;
```

Ajouter enfin au contrat rédigé en JSDoc de l'interface, après le point sur
`resized` :

```
 * - `showPosition` montre la position au fil de l'eau : **s'abonner démarre, se
 *   désabonner arrête**. L'abonnement meurt avec `unmount`, et un nouvel appel
 *   referme le précédent — la carte n'écoute jamais deux flux à la fois. Une
 *   position qui arrive ne recadre rien : c'est le cadrage qui va la chercher,
 *   quand il se calcule. `inconnue` retire le marqueur.
```

- [ ] **Étape 4 : les couches de la position, écrites une fois pour les deux cartes**

Créer `src/carte/adapters/positionLayers.ts`. Les deux fabriques restent
**privées au module** : rien hors d'ici n'a de raison de poser un marqueur de
position à la main, et c'est ce qui garantit que les deux cartes ne pourront pas
diverger — la leçon que `fitting.ts` porte déjà dans son en-tête.

```ts
import * as L from 'leaflet';
import type { Coordonnee } from '../../trajets/domain/Coordonnee';
import type { DisplayedPosition } from '../ports/CarteDesPointsPort';
import { toLatLng } from './conversion';

/**
 * Le disque de « ma position ».
 *
 * Même règle que `numberedIcon`, et pour la même raison : `iconSize: undefined`
 * neutralise le `[12, 12]` que `DivIcon` inscrirait en style inline — lequel
 * gagne contre la feuille —, et c'est `style.css` qui donne la taille comme le
 * centrage (marge négative, et non `iconAnchor`). Une géométrie écrite deux fois
 * finit par donner deux symboles différents.
 */
function positionIcon(): L.DivIcon {
    return L.divIcon({
        className: 'carte-position-marker',
        html: '',
        iconSize: undefined,
    });
}

/**
 * Les couches de « ma position » sur une carte : le disque, et le cercle
 * d'incertitude quand la position en porte une.
 *
 * Posées et retirées ensemble, par **un seul** code pour les deux cartes. C'est
 * exactement ce que `fitting.ts` a fait pour le cadrage, et pour la raison
 * écrite dans son en-tête : les deux adapters avaient divergé, et le cadrage
 * changeait selon l'écran.
 */
export class PositionLayers {
    private marker: L.Marker | null = null;
    private circle: L.Circle | null = null;
    private shown: Coordonnee | null = null;

    /** La coordonnée actuellement montrée, ou `null` — ce que le cadrage doit connaître. */
    coordonnee(): Coordonnee | null {
        return this.shown;
    }

    /**
     * Refait les couches plutôt que de les déplacer : au mieux une position
     * toutes les dix secondes, et un cercle change de rayon aussi souvent que de
     * centre.
     *
     * Aucun recadrage ici, délibérément : une position qui arrive ne vole pas le
     * cadrage. C'est le cadrage qui va la chercher, quand il se calcule.
     */
    paint(carte: L.Map, position: DisplayedPosition): void {
        this.clear();
        if (position.kind === 'inconnue') {
            return;
        }
        this.shown = position.coordonnee;
        // Non interactif, comme les repères et pour la raison que le port écrit
        // déjà : cliquer dessus doit revenir à cliquer la carte à cet endroit,
        // sans quoi il volerait le geste qui désigne une coordonnée.
        this.marker = L.marker(toLatLng(position.coordonnee), {
            icon: positionIcon(),
            interactive: false,
        }).addTo(carte);
        if (position.kind === 'approximative') {
            // Le rayon que la source a mesuré, en mètres — ce que `L.circle`
            // attend. Une position acceptée n'en transporte aucune, et en
            // inventer une serait mentir.
            this.circle = L.circle(toLatLng(position.coordonnee), {
                radius: position.imprecisionMetres,
                className: 'carte-position-circle',
                interactive: false,
            }).addTo(carte);
        }
    }

    /** Rend tout ce que la position tenait. Se rappeler sans dommage. */
    clear(): void {
        this.marker?.remove();
        this.marker = null;
        this.circle?.remove();
        this.circle = null;
        this.shown = null;
    }
}
```

- [ ] **Étape 5 : l'adapter s'abonne**

`src/carte/adapters/LeafletCarteDesPoints.ts` — ajouter aux imports :

```ts
import { Subject, firstValueFrom, type Observable, type Subscription } from 'rxjs';
import type {
    CarteDesPoints,
    DisplayedPoint,
    DisplayedPosition,
} from '../ports/CarteDesPointsPort';
import { PositionLayers } from './positionLayers';
```

Ajouter les deux champs, après `private teardown` :

```ts
    private readonly positionLayers = new PositionLayers();
    private positionSubscription: Subscription | null = null;
```

Ajouter la méthode, après `show` :

```ts
    /**
     * S'abonner démarre, se désabonner arrête : l'abonnement meurt avec
     * `unmount()`, et un nouvel appel referme le précédent — la carte n'écoute
     * jamais deux flux à la fois.
     */
    showPosition(position$: Observable<DisplayedPosition>): void {
        const carte = this.mountedCarte();
        this.positionSubscription?.unsubscribe();
        this.positionSubscription = position$.subscribe((position) => {
            this.positionLayers.paint(carte, position);
        });
    }
```

Dans `show`, le cadrage demande aux couches ce qu'elles montrent :

```ts
fitToPoints(carte, points, this.positionLayers.coordonnee());
```

Et `unmount` rend ce qu'il tient de plus. **L'ordre compte** : les couches se
retirent avant que la carte ne parte, sinon elles resteraient accrochées à une
carte détruite :

```ts
    unmount(): void {
        this.cancelChoice();
        this.positionSubscription?.unsubscribe();
        this.positionSubscription = null;
        this.positionLayers.clear();
        this.teardown?.abort();
        this.teardown = null;
        this.markers.clear();
        this.displayedIds = '';
        this.onMove = null;
        this.onShow = null;
        this.carte?.remove();
        this.carte = null;
    }
```

- [ ] **Étape 6 : la feuille de style donne sa forme au symbole**

`src/style.css` — ajouter la variable dans `:root`, sous `--point-line-thickness` :

```css
/* Le disque de « ma position ». Plus petit que la pastille d'un point : il
       n'a pas de numéro à porter, et il ne doit pas couvrir ce qu'il côtoie. */
--position-badge-size: 1rem;
```

Puis, juste après la règle `.carte-points .carte-marker, #carte-container .carte-marker`
qui porte la marge négative (vers la ligne 599) :

```css
/* « Ma position » : un disque bleu cerclé de blanc — ni la pastille rouge
   numérotée d'un point, ni l'épingle bleue du marqueur de sélection.

   Même précaution de portée que la pastille : scopé sous son conteneur, parce
   que leaflet.css arrive après dans le bundle et que son
   `.leaflet-marker-icon { display: block }` écraserait un sélecteur de même
   poids. Et même partage des rôles : la géométrie est ici, `positionLayers.ts`
   neutralise l'`iconSize` pour ne pas l'écrire une seconde fois. */
.carte-points .carte-position-marker,
#carte-container .carte-position-marker {
    width: var(--position-badge-size);
    height: var(--position-badge-size);
    background: #2563eb;
    border: 3px solid white;
    border-radius: 999px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
    /* Tient le rôle de l'`iconAnchor` que Leaflet ne reçoit pas : le disque est
       centré sur sa coordonnée, et non posé à sa droite. */
    margin: calc(var(--position-badge-size) / -2) 0 0 calc(var(--position-badge-size) / -2);
}

/* Le cercle d'incertitude : une surface, pas un halo décoratif — c'est la zone
   dans laquelle on se trouve réellement, au rayon que la source a mesuré. */
.carte-points .carte-position-circle,
#carte-container .carte-position-circle {
    fill: #2563eb;
    fill-opacity: 0.12;
    stroke: #2563eb;
    stroke-width: 1;
    stroke-opacity: 0.5;
}
```

- [ ] **Étape 7 : le fake de l'écran d'édition implémente le port**

`src/trajets/ui/TrajetEditorScreen.test.ts` — ajouter aux imports :

```ts
import type { Observable, Subscription } from 'rxjs';
import type {
    CarteDesPoints,
    DisplayedPoint,
    DisplayedPosition,
} from '../../carte/ports/CarteDesPointsPort';
```

Dans `FakeCarteDesPoints`, ajouter les champs et méthodes, et compléter
`unmount` :

```ts
    private positionSubscription: Subscription | null = null;
    private position: DisplayedPosition | null = null;

    showPosition(position$: Observable<DisplayedPosition>): void {
        this.positionSubscription?.unsubscribe();
        this.positionSubscription = position$.subscribe((position) => {
            this.position = position;
        });
    }

    /** La dernière position que l'écran lui a donnée à montrer. */
    displayedPosition(): DisplayedPosition | null {
        return this.position;
    }
```

```ts
    unmount(): void {
        this.container = null;
        this.displayed = [];
        this.positionSubscription?.unsubscribe();
        this.positionSubscription = null;
    }
```

- [ ] **Étape 8 : jouer les tests et les voir passer**

Run : `pnpm typecheck && pnpm lint && pnpm test`
Attendu : PASSE.

- [ ] **Étape 9 : inscrire l'exigence**

`docs/EXIGENCES.md`, à la fin du tableau **Géoréférencement** :

```
| GR-18 | Une position trop imprécise pour caler la page s'affiche quand même, cerclée de son incertitude mesurée | `U GeolocationPositionSource.test.ts`, `U LeafletCarteDesPoints.test.ts` |
| GR-20 | Le cadrage englobe la position quand elle est déjà connue, et ne se refait jamais à l'arrivée d'une position | `U fitting.test.ts`, `U LeafletCarteDesPoints.test.ts` |
```

- [ ] **Étape 10 : commiter**

```bash
git add src/carte src/style.css src/trajets/ui/TrajetEditorScreen.test.ts docs/EXIGENCES.md
git commit -m "Donne à la carte de l'éditeur de quoi montrer où l'on est

Le flux plutôt qu'une consigne : l'abonnement meurt avec la carte, il n'y
a pas de marqueur à penser à effacer. Et un type écrit par la capacité
carte, qui reçoit une phrase déjà rédigée : elle continue d'ignorer que le
suivi existe."
```

---

## Tâche 4 : La carte plein écran montre la position

**Fichiers :**

- Modifier : `src/carte/ports/CoordonneeSelectorPort.ts`
- Modifier : `src/carte/adapters/LeafletCoordonneeSelector.ts`
- Tester : `src/carte/adapters/LeafletCoordonneeSelector.test.ts`
- Modifier : `index.html`
- Modifier : `src/style.css`
- Modifier : `src/trajets/ui/TrajetEditorScreen.ts:386`, `src/suivi/ui/SuiviScreen.ts:466` (sites d'appel, `EMPTY` provisoire)

**Interfaces :**

- Consomme : `DisplayedPosition` et la classe `PositionLayers` (tâche 3) ;
  `fitToPoints(carte, points, position)` (tâche 2).
- Produit : `CoordonneeSelector.choose(initialCoordonnee, reperes, position$)`.
  Les tâches 5 et 6 lui passent leur flux.

- [ ] **Étape 1 : écrire les tests qui échouent**

`src/carte/adapters/LeafletCoordonneeSelector.test.ts` — ajouter aux imports :

```ts
import * as L from 'leaflet';
import { EMPTY, Subject } from 'rxjs';
import type { DisplayedPosition } from '../ports/CarteDesPointsPort';
```

Ajouter le harnais d'observation de la carte, avant `mountCarteScreenDom` (c'est
celui de `LeafletCarteDesPoints.test.ts` : l'adapter garde sa carte pour lui, et
Leaflet n'offre que ce point d'accroche) :

```ts
/** Les cartes Leaflet créées depuis le début du fichier. */
const createdCartes: L.Map[] = [];
L.Map.addInitHook(function (this: L.Map) {
    createdCartes.push(this);
});

function carteCourante(): L.Map {
    const last = createdCartes.at(-1);
    if (last === undefined) {
        throw new Error("Aucune carte Leaflet créée : l'adapter n'a pas été sollicité.");
    }
    return last;
}

function positionMarkers(carte: L.Map): L.Marker[] {
    const trouves: L.Marker[] = [];
    carte.eachLayer((couche) => {
        if (
            couche instanceof L.Marker &&
            couche.getElement()?.classList.contains('carte-position-marker') === true
        ) {
            trouves.push(couche);
        }
    });
    return trouves;
}
```

Compléter le fragment DOM de `mountCarteScreenDom` avec les deux nouveaux
éléments (**sans quoi le constructeur de l'adapter lève et tout le fichier
tombe**) :

```ts
        <section id="screen-carte" hidden>
            <div id="carte-container"></div>
            <p id="carte-position-status" hidden></p>
            <input id="latitude-input" type="number" step="any" />
            <input id="longitude-input" type="number" step="any" />
            <button id="manual-place-button" type="button">Placer</button>
            <button id="carte-position-button" type="button" disabled>Ma position</button>
            <button id="cancel-carte-button" type="button">Annuler</button>
            <button id="confirm-carte-button" type="button" disabled>Valider</button>
        </section>`;
```

Ajouter `, EMPTY` aux six appels existants de `selector.choose(...)`, puis les
quatre cas :

```ts
describe("Étant donné une position connue avant l'ouverture", () => {
    it("alors elle est montrée, et le cadrage d'ouverture l'englobe", async () => {
        const selector = new LeafletCoordonneeSelector();
        const positions$ = new BehaviorSubject<DisplayedPosition>({
            kind: 'connue',
            coordonnee: BORDEAUX,
        });

        const choice = selector.choose(null, [], positions$);

        expect(positionMarkers(carteCourante()).map((marker) => marker.getLatLng().lat)).toEqual([
            BORDEAUX.latitude,
        ]);
        expect(carteCourante().getCenter().lat).toBeCloseTo(BORDEAUX.latitude, 4);
        button('#cancel-carte-button').click();
        expect(await choice).toBeNull();
    });
});

describe('Étant donné une position inconnue', () => {
    it('alors aucun marqueur, mais la phrase qui dit pourquoi', async () => {
        const selector = new LeafletCoordonneeSelector();
        const positions$ = new BehaviorSubject<DisplayedPosition>({
            kind: 'inconnue',
            message: 'Accès à la position refusé.',
        });

        const choice = selector.choose(null, [], positions$);

        expect(positionMarkers(carteCourante())).toEqual([]);
        expect(query('#carte-position-status', HTMLParagraphElement).textContent).toBe(
            'Accès à la position refusé.',
        );
        expect(button('#carte-position-button').disabled).toBe(true);
        button('#cancel-carte-button').click();
        expect(await choice).toBeNull();
    });
});

describe('Étant donné une position connue, quand on demande « Ma position »', () => {
    it("alors la carte vient dessus, au zoom d'un point unique", async () => {
        const selector = new LeafletCoordonneeSelector();
        const positions$ = new BehaviorSubject<DisplayedPosition>({
            kind: 'connue',
            coordonnee: PARIS,
        });
        const choice = selector.choose(null, [], positions$);
        carteCourante().setView([0, 0], 3, { animate: false });

        button('#carte-position-button').click();

        expect(carteCourante().getCenter().lat).toBeCloseTo(PARIS.latitude, 4);
        expect(carteCourante().getZoom()).toBe(12);
        button('#cancel-carte-button').click();
        expect(await choice).toBeNull();
    });
});

describe('Étant donné un choix terminé', () => {
    it("alors la carte n'écoute plus la position et ne la montre plus", async () => {
        const selector = new LeafletCoordonneeSelector();
        const positions$ = new Subject<DisplayedPosition>();
        const choice = selector.choose(null, [], positions$);
        positions$.next({ kind: 'connue', coordonnee: PARIS });
        expect(positions$.observed).toBe(true);

        button('#cancel-carte-button').click();
        await choice;

        expect(positions$.observed).toBe(false);
        expect(positionMarkers(carteCourante())).toEqual([]);
    });
});
```

Ajouter en tête de fichier `const BORDEAUX = Coordonnee.create(44.8378, -0.5792);`
et l'import de `BehaviorSubject`.

- [ ] **Étape 2 : jouer le test et le voir échouer**

Run : `pnpm test src/carte/adapters/LeafletCoordonneeSelector.test.ts`
Attendu : ÉCHEC — `Élément introuvable pour le sélecteur « #carte-position-status »`
puis `Expected 2 arguments, but got 3`.

- [ ] **Étape 3 : le port exige le flux**

`src/carte/ports/CoordonneeSelectorPort.ts` — remplacer le fichier entier :

```ts
import type { Observable } from 'rxjs';
import type { Coordonnee } from '../../trajets/domain/Coordonnee';
import type { DisplayedPoint, DisplayedPosition } from './CarteDesPointsPort';

/**
 * Port : laisser l'utilisateur choisir une coordonnée sur une carte de France.
 *
 * Contrat : `choose` ouvre la carte (centrée sur `initialCoordonnee` si fournie,
 * sinon recadrée sur les `reperes` et sur la position connue s'il y en a une,
 * sinon sur la France entière), attend le choix, et rend la coordonnée validée —
 * ou `null` si l'utilisateur annule.
 * Les repères sont les points du trajet, affichés pour se situer : ils ne sont
 * pas interactifs (cliquer dessus revient à cliquer la carte à cet endroit). Ils
 * sont **exigés**, quitte à passer une liste vide : les rendre facultatifs a
 * suffi à faire diverger cette carte de celle de l'éditeur.
 * `position$` l'est pour la même raison, et se passe `EMPTY` quand l'écran n'a
 * rien à montrer. La carte s'y abonne le temps du choix : le geste qui le
 * termine referme l'abonnement, ce qui compte d'autant plus ici que la carte
 * elle-même n'est jamais détruite.
 * Une seule sélection à la fois.
 */
export interface CoordonneeSelector {
    choose(
        initialCoordonnee: Coordonnee | null,
        reperes: readonly DisplayedPoint[],
        position$: Observable<DisplayedPosition>,
    ): Promise<Coordonnee | null>;
}
```

- [ ] **Étape 4 : la barre gagne la phrase et le bouton**

`index.html` — dans `.carte-bar`, la phrase en tête et le bouton entre
« Placer » et « Annuler » :

```html
<div class="carte-bar">
    <p id="carte-position-status" class="carte-position-status" hidden></p>
    <input
        id="latitude-input"
        type="number"
        step="any"
        inputmode="decimal"
        placeholder="Latitude"
        aria-label="Latitude"
    />
    <input
        id="longitude-input"
        type="number"
        step="any"
        inputmode="decimal"
        placeholder="Longitude"
        aria-label="Longitude"
    />
    <button id="manual-place-button" type="button" class="secondary">📌 Placer</button>
    <!-- Le libellé disparaît sous 560 px : c'est `aria-label` qui
                     empêche le bouton de s'annoncer « 🎯 ». -->
    <button
        id="carte-position-button"
        type="button"
        class="secondary"
        aria-label="Ma position"
        disabled
    >
        🎯<span class="button-label">Ma position</span>
    </button>
    <button id="cancel-carte-button" type="button" class="secondary">✖️ Annuler</button>
    <button id="confirm-carte-button" type="button" disabled>✅ Valider</button>
</div>
```

`src/style.css` — après la règle `.carte-bar input` :

```css
/* La phrase qui dit pourquoi la position manque prend sa propre ligne, en tête
   de barre (`flex-wrap` est déjà posé plus haut). Elle a sa raison d'être ici et
   nulle part ailleurs : cette carte recouvre l'écran de suivi, donc sa ligne
   d'état avec — sans cette phrase, l'absence de marqueur ne s'expliquerait pas. */
.carte-position-status {
    flex: 1 0 100%;
    margin: 0;
    font-size: 0.875rem;
    color: #6b7280;
}
```

- [ ] **Étape 5 : l'adapter s'abonne le temps du choix**

`src/carte/adapters/LeafletCoordonneeSelector.ts` — imports :

```ts
import { Subject, firstValueFrom, takeUntil, type Observable } from 'rxjs';
import type { DisplayedPoint, DisplayedPosition } from '../ports/CarteDesPointsPort';
import { PositionLayers } from './positionLayers';
```

Champs, après `confirmButton` :

```ts
    private readonly positionStatus = query('#carte-position-status', HTMLParagraphElement);
    private readonly positionButton = query('#carte-position-button', HTMLButtonElement);
    private readonly positionLayers = new PositionLayers();
```

Constructeur — un écouteur de plus, à la suite des trois autres :

```ts
this.positionButton.addEventListener('click', () => {
    this.goToPosition();
});
```

`choose` en entier :

```ts
    choose(
        initialCoordonnee: Coordonnee | null,
        reperes: readonly DisplayedPoint[],
        position$: Observable<DisplayedPosition>,
    ): Promise<Coordonnee | null> {
        this.screen.hidden = false;
        const carte = this.initializedCarte();
        this.clearSelection();
        this.placeReperes(reperes);
        // **Avant** le cadrage : un flux qui garde sa dernière valeur la rejoue
        // ici même, si bien que le cadrage la trouve déjà connue — c'est tout ce
        // que « seulement si déjà connue » demande, sans un seul test de nullité.
        // L'abonnement pend au choix : le geste qui le termine le referme, il
        // n'y en a pas deux à faire, et rien ne survit à une carte qu'on ne
        // détruit jamais.
        position$.pipe(takeUntil(this.choix)).subscribe((position) => {
            this.paintPosition(carte, position);
        });
        if (initialCoordonnee === null) {
            // Se situer par rapport au trajet : recadrer sur ses points.
            fitToPoints(carte, reperes, this.positionLayers.coordonnee());
        } else {
            this.placeMarker(initialCoordonnee);
            centerOnCoordonnee(carte, initialCoordonnee);
        }
        // La carte vient d'être dévoilée : Leaflet doit remesurer son conteneur.
        setTimeout(() => carte.invalidateSize(), 0);
        return firstValueFrom(this.choix);
    }
```

Les trois méthodes qui vont avec, après `placeReperes` :

```ts
    /**
     * Ce que cette carte ajoute aux couches : la barre. Les marques elles-mêmes
     * sont posées par le même code que sur la carte de l'éditeur — c'est ce qui
     * empêche les deux de diverger, comme `fitToPoints` pour le cadrage.
     */
    private paintPosition(carte: L.Map, position: DisplayedPosition): void {
        this.positionLayers.paint(carte, position);
        this.positionButton.disabled = this.positionLayers.coordonnee() === null;
        this.positionStatus.textContent = position.kind === 'connue' ? '' : position.message;
        this.positionStatus.hidden = position.kind === 'connue' || position.message === '';
    }

    /**
     * Le cadrage ne bouge jamais tout seul ; ici on le lui demande. Même zoom que
     * « aller au point » : on arrive d'ailleurs, il n'y a pas d'échelle réglée à
     * la main à voler.
     */
    private goToPosition(): void {
        const position = this.positionLayers.coordonnee();
        if (position === null) {
            return;
        }
        centerOnCoordonnee(this.initializedCarte(), position);
    }

    /** Ce que la position laisse derrière elle quand le choix se termine. */
    private clearPosition(): void {
        this.positionLayers.clear();
        this.positionButton.disabled = true;
        this.positionStatus.textContent = '';
        this.positionStatus.hidden = true;
    }
```

Et `terminer` rend ce qu'il tient — la carte n'étant jamais détruite, ce ménage
est le seul qui aura lieu :

```ts
    private terminer(result: Coordonnee | null): void {
        this.screen.hidden = true;
        this.clearPosition();
        this.choix.next(result);
    }
```

- [ ] **Étape 6 : rattacher les deux sites d'appel**

`src/trajets/ui/TrajetEditorScreen.ts` — dans `chooseCoordonnee` :
`return coordonneeSelector.choose(initial, reperes, EMPTY);`

`src/suivi/ui/SuiviScreen.ts` — dans `chooseSimulatedPosition` :
`coordonnee = await coordonneeSelector.choose(simulation.lastPosition, trajetReperes(), EMPTY);`

Ajouter `EMPTY` aux imports `rxjs` des deux fichiers. Les deux sont provisoires :
les tâches 5 et 6 y mettent un vrai flux.

- [ ] **Étape 7 : jouer les tests et les voir passer**

Run : `pnpm typecheck && pnpm lint && pnpm test`
Attendu : PASSE.

- [ ] **Étape 8 : inscrire l'exigence**

`docs/EXIGENCES.md`, tableau **Géoréférencement** :

```
| GR-19 | Sans position, aucun marqueur — et la phrase qui dit pourquoi s'affiche à côté de la carte | `U LeafletCoordonneeSelector.test.ts` |
| GR-21 | « Ma position » amène la carte sur elle, au zoom d'un point unique, et reste inerte tant qu'elle est inconnue | `U LeafletCoordonneeSelector.test.ts` |
```

- [ ] **Étape 9 : commiter**

```bash
git add src/carte index.html src/style.css src/trajets/ui/TrajetEditorScreen.ts src/suivi/ui/SuiviScreen.ts docs/EXIGENCES.md
git commit -m "Ouvre la carte plein écran sur ce que le GPS sait déjà

L'abonnement pend au sujet qui résout le choix : le geste qui termine
referme, il n'y en a pas deux à faire — et cette carte-là n'est jamais
détruite, donc ce qu'on y oublie survit à l'application entière."
```

---

## Tâche 5 : L'écran de suivi alimente la carte plein écran

**Fichiers :**

- Modifier : `src/suivi/ui/SuiviScreen.ts`
- Tester : `src/suivi/ui/SuiviScreen.test.ts`
- Modifier : `docs/EXIGENCES.md`

**Interfaces :**

- Consomme : `DisplayedPosition` (tâche 3), `choose(initial, reperes, position$)` (tâche 4),
  `SourceStatus.imprecise.position` (tâche 1).
- Produit : la fonction module `displayedPosition(event: SourceEvent): DisplayedPosition`,
  **recopiée à l'identique** dans `TrajetEditorScreen.ts` à la tâche 6.

- [ ] **Étape 1 : écrire les tests qui échouent**

`src/suivi/ui/SuiviScreen.test.ts` — ajouter aux imports
`import { NEVER, defer, finalize, take, type Observable } from 'rxjs';` (le reste
est déjà là), `import type { DisplayedPoint, DisplayedPosition } from '../../carte/ports/CarteDesPointsPort';`,
puis **remplacer la constante `carteMuette`** par une carte qui retient ce qu'on
lui donne — elle reste muette, mais elle sait désormais répondre :

```ts
/**
 * Carte plein écran qui retient le flux qu'on lui confie et la coordonnée qu'on
 * lui fait rendre : c'est par ce flux que l'écran dit ce qu'il veut montrer.
 */
class FakeCoordonneeSelector implements CoordonneeSelector {
    private readonly recues: DisplayedPosition[] = [];
    private reponse: Coordonnee | null = null;

    /** Ce que l'utilisateur choisira au prochain passage sur la carte. */
    repondra(coordonnee: Coordonnee): void {
        this.reponse = coordonnee;
    }

    choose(
        _initialCoordonnee: Coordonnee | null,
        _reperes: readonly DisplayedPoint[],
        position$: Observable<DisplayedPosition>,
    ): Promise<Coordonnee | null> {
        // Le temps d'un choix, et pas plus : `take(1)` se désabonne de lui-même,
        // comme le vrai adapter le fait par son `takeUntil(this.choix)`.
        position$.pipe(take(1)).subscribe((position) => {
            this.recues.push(position);
        });
        const reponse = this.reponse;
        this.reponse = null;
        return Promise.resolve(reponse);
    }

    /** Ce que la carte a reçu à montrer, dans l'ordre. */
    positionsRecues(): DisplayedPosition[] {
        return this.recues;
    }
}
```

Déclarer `let carte: FakeCoordonneeSelector;` avec les autres `let`, l'instancier
dans le `beforeEach` (`carte = new FakeCoordonneeSelector();`) et écrire
`coordonneeSelector: carte` dans `dependances()`.

Puis les trois cas :

```ts
describe("Étant donné le suivi au GPS, quand j'ouvre la carte pour simuler", () => {
    it('alors elle reçoit ma position réelle', async () => {
        const element = await attacherLEcran();
        realSource.simulate(Coordonnee.create(44.83, -0.57));

        query('#simuler-button', HTMLButtonElement, element).click();
        await Promise.resolve();

        expect(carte.positionsRecues()).toEqual([
            { kind: 'connue', coordonnee: Coordonnee.create(44.83, -0.57) },
        ]);
    });
});

describe('Étant donné le suivi déjà en simulation, quand je rouvre la carte', () => {
    it('alors elle ne reçoit rien : le marqueur de sélection porte déjà cette position', async () => {
        const element = await attacherLEcran();
        // Le premier passage est ce qui fait entrer en simulation.
        carte.repondra(Coordonnee.create(44.9, -0.5));
        query('#simuler-button', HTMLButtonElement, element).click();
        await Promise.resolve();
        await Promise.resolve();

        query('#simuler-button', HTMLButtonElement, element).click();
        await Promise.resolve();

        // Une seule position reçue : celle du premier passage, fait en GPS.
        expect(carte.positionsRecues()).toHaveLength(1);
    });
});

describe("Étant donné une simulation qu'on quitte", () => {
    it('alors la carte remontre le GPS, jamais la position simulée restée en mémoire', async () => {
        const element = await attacherLEcran();
        realSource.simulate(Coordonnee.create(44.83, -0.57));
        carte.repondra(Coordonnee.create(48.85, 2.35));
        query('#simuler-button', HTMLButtonElement, element).click();
        await Promise.resolve();
        await Promise.resolve();
        query('#leave-simulation-button', HTMLButtonElement, element).click();

        query('#simuler-button', HTMLButtonElement, element).click();
        await Promise.resolve();

        expect(carte.positionsRecues().at(-1)).toEqual({
            kind: 'connue',
            coordonnee: Coordonnee.create(44.83, -0.57),
        });
    });
});
```

> Dans ce fichier, `realSource` **est** un `SimulationPositionSource` : l'écran ne
> fait aucune différence entre les deux, et c'est tout l'intérêt du port.
> `attacherLEcran()` et le rythme à deux `await Promise.resolve()` sont ceux du
> fichier, pas une invention.

- [ ] **Étape 2 : jouer le test et le voir échouer**

Run : `pnpm test src/suivi/ui/SuiviScreen.test.ts`
Attendu : ÉCHEC — `positionsRecues()` est vide, l'écran passe encore `EMPTY`.

- [ ] **Étape 3 : l'écran rediffuse ce qu'il reçoit déjà**

`src/suivi/ui/SuiviScreen.ts` — imports :

```ts
import { BehaviorSubject, EMPTY, Subject, merge, switchMap, takeUntil, tap } from 'rxjs';
import type { DisplayedPoint, DisplayedPosition } from '../../carte/ports/CarteDesPointsPort';
import type { SourceEvent } from '../ports/PositionSource';
```

Ajouter la fonction module, en bas du fichier à côté des autres :

```ts
/**
 * La traduction vers le vocabulaire de la carte : où l'on est, ou pourquoi on
 * l'ignore. La phrase est écrite ici, par l'écran, et non par la carte — c'est
 * ce qui permet à la capacité `carte` de ne rien savoir d'une source de
 * position.
 *
 * Elle est **écrite deux fois**, ici et dans l'écran d'édition, pour la raison
 * déjà retenue pour `pointsForCarte` : la partager entre deux capacités ferait
 * dépendre l'une de l'interface de l'autre.
 */
function displayedPosition(event: SourceEvent): DisplayedPosition {
    if (event.kind === 'position') {
        return { kind: 'connue', coordonnee: event.position };
    }
    const message = sourceStatusText(event.status);
    if (event.status.kind === 'imprecise') {
        return {
            kind: 'approximative',
            coordonnee: event.status.position,
            imprecisionMetres: event.status.imprecisionMetres,
            message,
        };
    }
    return { kind: 'inconnue', message };
}
```

Dans `mount`, à côté des autres mémoires (`lastPosition`, `lastSurTrajet`…) :

```ts
/**
 * Ce que l'écran a de plus frais sur « ma position », rediffusé aux cartes.
 * Un `BehaviorSubject` parce qu'une carte qui s'ouvre doit trouver la valeur
 * **tout de suite** : c'est ce qui fait entrer la position dans le cadrage
 * d'ouverture sans que personne n'ait à tester une nullité.
 *
 * Aucune seconde souscription à la source : le flux est froid, et deux
 * abonnés ouvriraient deux sessions GPS qui s'ignorent.
 *
 * Rien à effacer au changement de source, contrairement à `lastPosition` et
 * `lastSurTrajet` : le contrat de `PositionSource` veut qu'une source
 * **commence toujours par un état**, avant la moindre position — la nouvelle
 * annonce donc `attente` et écrase l'ancienne position d'elle-même. Une
 * remise à zéro dans `resetSuivi` serait un mutant équivalent, et
 * `positionSourceContract.ts` est ce qui protège la garantie dont elle
 * dépend.
 */
const maPosition$ = new BehaviorSubject<DisplayedPosition>(POSITION_INCONNUE);
/** D'où vient la position à cet instant. La bascule reste au flux ; seul son dernier état se relit. */
let mode: SuiviMode | null = null;
```

et, en haut du fichier :

```ts
/** Ce qu'une carte doit montrer quand l'écran ne sait encore rien. */
const POSITION_INCONNUE: DisplayedPosition = { kind: 'inconnue', message: '' };
```

Le `tap` retient le mode, et le `subscribe` alimente le sujet :

```ts
mode$
    .pipe(
        tap((nouveau) => {
            mode = nouveau;
            resetSuivi(nouveau);
        }),
        switchMap((courant) => (courant === 'simulation' ? simulation : realSource).events$),
        takeUntil(parti$),
    )
    .subscribe((event) => {
        maPosition$.next(displayedPosition(event));
        if (event.kind === 'position') {
            onPosition(event.position);
        } else {
            onStatus(event.status);
        }
    });
```

`resetSuivi` n'a **rien** à ajouter, et c'est un résultat, pas un oubli : le bug
qu'il corrige — une position simulée périmée relue comme la vraie — ne peut pas
se reproduire ici, la source qui arrive annonçant son état avant toute position.
Le seul changement du corps de `resetSuivi` est le renommage du paramètre en
`nouveau`, le mot `mode` désignant désormais le local qui retient la bascule.

Et le choix d'une position simulée :

```ts
coordonnee = await coordonneeSelector.choose(
    simulation.lastPosition,
    trajetReperes(),
    // En simulation, le marqueur de sélection **est** déjà « ma
    // position » : la carte n'a rien à ajouter. Ne pas déduire ce cas
    // de `lastPosition !== null` — elle survit à la sortie de la
    // simulation, où la position à montrer redevient celle du GPS.
    mode === 'simulation' ? EMPTY : maPosition$,
);
```

- [ ] **Étape 4 : jouer les tests et les voir passer**

Run : `pnpm typecheck && pnpm lint && pnpm test`
Attendu : PASSE.

- [ ] **Étape 5 : inscrire l'exigence**

`docs/EXIGENCES.md`, tableau **Géoréférencement** :

```
| GR-23 | En simulation, la carte plein écran n'ajoute pas un second marqueur là où celui de la sélection porte déjà la position | `U SuiviScreen.test.ts` |
```

- [ ] **Étape 6 : commiter**

```bash
git add src/suivi/ui/SuiviScreen.ts src/suivi/ui/SuiviScreen.test.ts docs/EXIGENCES.md
git commit -m "Fait dire à la carte du suivi ce que l'écran sait déjà

Rediffuser plutôt que se réabonner : le flux est froid, un second abonné
ouvrirait un second watchPosition, un second chien de garde et un second
throttle. Et la mémoire s'efface avec les autres au changement de source,
sans quoi une position simulée périmée se lirait comme la vraie."
```

---

## Tâche 6 : L'écran d'édition allume le GPS quand une carte est regardée

**Fichiers :**

- Modifier : `src/trajets/ui/TrajetEditorScreen.ts`
- Tester : `src/trajets/ui/TrajetEditorScreen.test.ts`
- Modifier : `src/main.ts`
- Modifier : `docs/EXIGENCES.md`

**Interfaces :**

- Consomme : `showPosition(position$)` (tâche 3), `choose(initial, reperes, position$)` (tâche 4).
- Produit : `TrajetEditorDependencies.positionSource: PositionSource`.

- [ ] **Étape 1 : écrire les tests qui échouent**

`src/trajets/ui/TrajetEditorScreen.test.ts` — une source qui **compte ses
sessions dans son état**, jamais un espion :

```ts
/**
 * Source de position observable par son état : combien de sessions elle a
 * ouvertes, et combien sont encore ouvertes. C'est le même procédé que
 * `heldResources()` de la suite de contrat — aucun espion n'est requis pour
 * voir qu'un flux froid a été souscrit.
 */
class FakePositionSource implements PositionSource {
    private ouvertes = 0;
    private total = 0;
    private readonly emissions = new Subject<SourceEvent>();

    readonly events$: Observable<SourceEvent> = defer(() => {
        this.ouvertes++;
        this.total++;
        return this.emissions.pipe(
            startWith(statusEvent({ kind: 'attente' })),
            finalize(() => {
                this.ouvertes--;
            }),
        );
    });

    emettre(event: SourceEvent): void {
        this.emissions.next(event);
    }

    sessionsOuvertes(): number {
        return this.ouvertes;
    }

    sessionsEnTout(): number {
        return this.total;
    }
}
```

Déclarer `let positionSource: FakePositionSource;` avec les autres `let`,
l'instancier dans le `beforeEach` (`positionSource = new FakePositionSource();`)
et l'ajouter à `dependances()`. Puis les quatre cas :

```ts
describe("Étant donné l'éditeur ouvert, carte repliée", () => {
    it('alors le GPS ne tourne pas : personne ne regarde de carte', async () => {
        await attacherLEcran();

        expect(positionSource.sessionsOuvertes()).toBe(0);
        expect(positionSource.sessionsEnTout()).toBe(0);
    });
});

describe('Étant donné la carte dépliée par-dessus le schéma', () => {
    it("alors une session s'ouvre, et se referme quand on la replie", async () => {
        const element = await attacherLEcran();

        query('#carte-button', HTMLButtonElement, element).click();
        expect(positionSource.sessionsOuvertes()).toBe(1);

        query('#carte-button', HTMLButtonElement, element).click();
        expect(positionSource.sessionsOuvertes()).toBe(0);
        // Une seule session en tout : replier n'en laisse pas une derrière,
        // et n'en rouvre pas une de plus au passage.
        expect(positionSource.sessionsEnTout()).toBe(1);
    });
});

describe('Étant donné une position reçue carte dépliée', () => {
    it('alors la carte la reçoit à montrer', async () => {
        const element = await attacherLEcran();
        query('#carte-button', HTMLButtonElement, element).click();

        positionSource.emettre(positionEvent(Coordonnee.create(44.83, -0.57)));

        expect(carteDesPoints.displayedPosition()).toEqual({
            kind: 'connue',
            coordonnee: Coordonnee.create(44.83, -0.57),
        });
    });
});

describe("Étant donné l'éditeur qu'on quitte", () => {
    it("alors plus aucune session de position n'est ouverte", async () => {
        const element = await attacherLEcran();
        query('#carte-button', HTMLButtonElement, element).click();

        element.remove();
        await laisserLesPromessesSAchever();

        expect(positionSource.sessionsOuvertes()).toBe(0);
    });
});
```

Ajouter aux imports du fichier de test :

```ts
import { Subject, defer, finalize, startWith, type Observable } from 'rxjs';
import {
    positionEvent,
    statusEvent,
    type PositionSource,
    type SourceEvent,
} from '../../suivi/ports/PositionSource';
```

> En jsdom `--large-screen` vaut toujours `0` : ces cas décrivent donc tous le
> petit écran, et **la branche grand écran n'a pas de témoin unitaire** — c'est
> l'e2e qui la couvre, exactement comme pour `showPointOnCarte`.

- [ ] **Étape 2 : jouer le test et le voir échouer**

Run : `pnpm test src/trajets/ui/TrajetEditorScreen.test.ts`
Attendu : ÉCHEC — `positionSource` n'est pas une dépendance de l'écran.

- [ ] **Étape 3 : la dépendance et les prédicats de visibilité**

`src/trajets/ui/TrajetEditorScreen.ts` — imports :

```ts
import {
    BehaviorSubject,
    EMPTY,
    distinctUntilChanged,
    map,
    merge,
    shareReplay,
    switchMap,
    take,
    takeUntil,
} from 'rxjs';
import type { DisplayedPosition } from '../../carte/ports/CarteDesPointsPort';
import { windowEventsOf } from '../../shared/events';
import { sourceStatusText } from '../../suivi/domain/presentation';
import type { PositionSource, SourceEvent } from '../../suivi/ports/PositionSource';
```

La dépendance :

```ts
export interface TrajetEditorDependencies {
    repository: TrajetRepository;
    coordonneeSelector: CoordonneeSelector;
    carteDesPoints: CarteDesPoints;
    /** D'où vient « ma position » sur les cartes de cet écran. Toujours le GPS réel : l'éditeur n'a pas de mode simulation. */
    positionSource: PositionSource;
    run: Run;
    trajetId: TrajetId;
    onBack: () => void;
    onSuivi: () => void;
}
```

**Les prédicats de visibilité, tous du même ordre.** C'est le point que ce lot
corrige : `isLargeScreen()` est une question nommée, `classList.contains(…)` de
la plomberie DOM et un drapeau local une donnée brute — les trois ne se mêlent
pas dans un même `||`. À poser juste après les `query` de `mount` :

```ts
/** Un choix est en cours sur la carte plein écran, qui recouvre cet écran. */
let fullscreenChoice = false;

/** La carte de l'éditeur est-elle passée par-dessus le schéma ? La classe est cet état. */
function isCarteOverSchema(): boolean {
    return root.classList.contains('carte-ouverte');
}

/**
 * La carte intégrée est visible dès 900 px, où la feuille de style l'épingle
 * à côté de la pile ; en dessous, seulement quand on l'a mise par-dessus le
 * schéma.
 */
function isEmbeddedCarteVisible(): boolean {
    return isLargeScreen() || isCarteOverSchema();
}

/** Une carte est-elle sous les yeux ? Le GPS ne tourne que dans ce cas. */
function isAnyCarteVisible(): boolean {
    return isEmbeddedCarteVisible() || fullscreenChoice;
}

const carteVisible$ = new BehaviorSubject<boolean>(isAnyCarteVisible());

/** Une seule expression décide, et trois gestes la rejouent. */
function refreshCarteVisible(): void {
    carteVisible$.next(isAnyCarteVisible());
}
```

Et les trois lectures brutes existantes de la classe passent par le prédicat :
dans `showPointFromCarte`, `if (isCarteOverSchema()) { toggleCarte(); }` ; dans
`showPointOnCarte`, `if (!isLargeScreen() && !isCarteOverSchema()) { toggleCarte(); }`.

- [ ] **Étape 4 : le flux, et ce qui l'allume**

Toujours dans `mount` :

```ts
/**
 * « Ma position », telle que les cartes de cet écran doivent la montrer.
 *
 * Le `switchMap` est ce qui allume et éteint le GPS : replier la carte
 * referme la session, la déplier en rouvre une — qui annonce `attente` avant
 * toute position, et efface donc d'elle-même le marqueur périmé.
 *
 * `shareReplay` parce que deux consommateurs l'écoutent (la carte intégrée et
 * la barre de position) et qu'ils doivent partager **une seule** session ; la
 * dernière valeur est rejouée à qui arrive en retard — la carte plein écran,
 * dont le cadrage d'ouverture la trouve ainsi déjà connue.
 */
const maPosition$ = carteVisible$.pipe(
    distinctUntilChanged(),
    switchMap((visible) => (visible ? positionSource.events$ : EMPTY)),
    map(displayedPosition),
    shareReplay({ bufferSize: 1, refCount: true }),
    takeUntil(parti$),
);

carteDesPoints.mount(query('#carte-points', HTMLElement, root));
carteDesPoints.showPosition(maPosition$);
```

> `carteDesPoints.mount(...)` existe déjà ligne ~85 : le déplacer ici, sous le
> flux, et ajouter `showPosition` juste après — l'ordre compte, `showPosition`
> exige une carte montée.

Le redimensionnement de fenêtre peut traverser le seuil des 900 px, ce qui rend
la carte intégrée visible ou non sans qu'on ait rien touché :

```ts
// Posé sur `window`, donc hors de l'écran : sans le `takeUntil`, il
// survivrait à la sortie et s'ajouterait une fois de plus à chaque visite.
windowEventsOf('resize')
    .pipe(takeUntil(parti$))
    .subscribe(() => {
        refreshCarteVisible();
    });
```

`toggleCarte` rejoue la décision — un seul écrivain de `carte-ouverte`, donc
tous ses appelants sont couverts :

```ts
function toggleCarte(): void {
    const overSchema = root.classList.toggle('carte-ouverte');
    carteButton.textContent = overSchema ? '🖼️ Schéma' : '🗺️ Carte';
    carteDesPoints.resized();
    refreshCarteVisible();
}
```

Et `chooseCoordonnee` remplace son `EMPTY` provisoire :

```ts
async function chooseCoordonnee(initial: Coordonnee | null): Promise<Coordonnee | null> {
    const reperes = pointsForCarte(trajet === null ? [] : trajet.numberedPointsInOrdreDuVoyage());
    if (!isLargeScreen()) {
        // La carte plein écran est une carte regardée, elle aussi : sans ce
        // drapeau, le GPS resterait éteint tout le temps du choix sur mobile.
        fullscreenChoice = true;
        refreshCarteVisible();
        try {
            return await coordonneeSelector.choose(initial, reperes, maPosition$);
        } finally {
            fullscreenChoice = false;
            refreshCarteVisible();
        }
    }
    hintText.textContent = 'Cliquez la coordonnée sur la carte…';
    hintBanner.hidden = false;
    try {
        return await carteDesPoints.chooseCoordonnee(initial);
    } finally {
        hintBanner.hidden = placementMode === null;
    }
}
```

Ajouter enfin la traduction, en bas du fichier, **identique** à celle de
`SuiviScreen.ts` (voir tâche 5, étape 3, avec le même commentaire justifiant la
double écriture).

- [ ] **Étape 5 : le composition root injecte la source**

`src/main.ts`, dans `openEditor` :

```ts
            createTrajetEditorScreen({
                repository,
                coordonneeSelector,
                carteDesPoints,
                positionSource: realSource,
                run,
                trajetId: id,
                …
```

- [ ] **Étape 6 : jouer les tests et les voir passer**

Run : `pnpm typecheck && pnpm lint && pnpm test`
Attendu : PASSE.

- [ ] **Étape 7 : inscrire les exigences**

`docs/EXIGENCES.md`, tableau **Géoréférencement** :

```
| GR-17 | Les deux cartes montrent la position qui pilote l'appli : le GPS réel, ou la position simulée quand la simulation est active | `U SuiviScreen.test.ts`, `U TrajetEditorScreen.test.ts` |
| GR-22 | Le GPS ne tourne que tant qu'une carte est regardée : replier la carte referme la session, la déplier en rouvre une | `U TrajetEditorScreen.test.ts` |
```

et, dans **Cycle de vie des écrans** :

```
| CV-8 | Quitter l'éditeur, ou refermer la carte plein écran, referme l'abonnement à la position et retire son marqueur | `U TrajetEditorScreen.test.ts`, `U LeafletCarteDesPoints.test.ts`, `U LeafletCoordonneeSelector.test.ts` |
```

- [ ] **Étape 8 : commiter**

```bash
git add src/trajets/ui/TrajetEditorScreen.ts src/trajets/ui/TrajetEditorScreen.test.ts src/main.ts docs/EXIGENCES.md
git commit -m "N'allume le GPS de l'éditeur que quand une carte est regardée

Trois gestes rejouent une seule expression, et cette expression ne mélange
plus les niveaux : « une carte est-elle visible » se lit à travers deux
prédicats nommés, la lecture de classe descend d'un cran, et les trois
autres endroits qui interrogeaient le DOM passent par le même nom."
```

---

## Tâche 7 : La barre de position de l'éditeur

**Fichiers :**

- Modifier : `src/trajets/ui/TrajetEditorScreen.html`
- Modifier : `src/trajets/ui/TrajetEditorScreen.ts`
- Tester : `src/trajets/ui/TrajetEditorScreen.test.ts`
- Modifier : `src/style.css`

**Interfaces :**

- Consomme : `maPosition$` et `carteDesPoints.centerOn(coordonnee)` (déjà au port).

- [ ] **Étape 1 : écrire les tests qui échouent**

```ts
describe('Étant donné une position refusée, carte dépliée', () => {
    it("alors l'écran dit pourquoi aucun marqueur n'apparaît", async () => {
        const element = await attacherLEcran();
        query('#carte-button', HTMLButtonElement, element).click();

        positionSource.emettre(statusEvent({ kind: 'permission-refusee' }));

        expect(query('#editor-position-status', HTMLSpanElement, element).textContent).toBe(
            'Accès à la position refusé — autorisez la localisation pour ce site puis revenez.',
        );
    });
});

describe('Étant donné une position connue, quand je demande « Ma position »', () => {
    it('alors la carte vient dessus', async () => {
        const element = await attacherLEcran();
        query('#carte-button', HTMLButtonElement, element).click();
        positionSource.emettre(positionEvent(Coordonnee.create(44.83, -0.57)));

        query('#editor-position-button', HTMLButtonElement, element).click();

        expect(
            carteDesPoints
                .centrages()
                .map((coordonnee) => [coordonnee.latitude, coordonnee.longitude])
                .at(-1),
        ).toEqual([44.83, -0.57]);
    });

    it("alors le bouton reste inerte tant qu'aucune position n'est connue", async () => {
        const element = await attacherLEcran();

        query('#carte-button', HTMLButtonElement, element).click();

        expect(query('#editor-position-button', HTMLButtonElement, element).disabled).toBe(true);
    });
});
```

Ajouter aussi `'editor-position-button'` à la liste des boutons dont le cas
existant vérifie le nom accessible (QA-5).

- [ ] **Étape 2 : jouer le test et le voir échouer**

Run : `pnpm test src/trajets/ui/TrajetEditorScreen.test.ts`
Attendu : ÉCHEC — `Élément introuvable pour le sélecteur « #editor-position-status »`.

- [ ] **Étape 3 : le gabarit**

`src/trajets/ui/TrajetEditorScreen.html` — la carte gagne une colonne, pour que
sa barre la suive quand elle passe par-dessus le schéma :

```html
<div class="editor-body">
    <div class="carte-column">
        <div id="carte-points" class="carte-points"></div>
        <!-- La phrase et le bouton restent avec la carte, y compris quand elle
             couvre l'écran sous 900 px : c'est la colonne qui bascule, plus la
             carte seule. -->
        <!-- Des identifiants distincts de ceux de la carte plein écran : les deux
             barres coexistent dans le document, et deux fois le même `id` n'est
             pas un HTML valide — c'est aussi ce qui permet aux `query` scopés de
             cet écran et à ceux du sélecteur de ne jamais se croiser. -->
        <p class="carte-position-bar">
            <span id="editor-position-status"></span>
            <button
                id="editor-position-button"
                type="button"
                class="secondary"
                aria-label="Ma position"
                disabled
            >
                🎯<span class="button-label">Ma position</span>
            </button>
        </p>
    </div>
    <div class="images-column">
        <div id="images-stack"></div>
    </div>
</div>
```

- [ ] **Étape 4 : la feuille de style suit la carte**

`src/style.css` — la règle du plein écran remonte de la carte à sa colonne, et
la carte reprend la hauteur dans la colonne :

```css
.carte-column {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}
```

```css
/* Par-dessus le schéma, et non plus au-dessus de lui : sous les boutons
   flottants (20), au-dessus de tout le reste. La carte reprend sa hauteur de
   vignette dès qu'on la referme — c'est `resized()` qui la fait se remesurer.
   C'est la **colonne** qui bascule, et non la carte seule : sa barre doit rester
   avec elle, sans quoi la phrase qui explique l'absence de marqueur resterait
   derrière l'écran que la carte recouvre. */
.carte-ouverte .carte-column {
    position: fixed;
    inset: 0;
    z-index: 15;
    background: white;
    padding: 0.5rem;
}

.carte-ouverte .carte-points {
    height: auto;
    flex: 1;
    border: none;
    border-radius: 0;
}
```

et, dans la requête média `@media (min-width: 900px)`, `.carte-points` devient
`.carte-column` pour l'épinglage :

```css
.carte-column {
    /* Épinglée : elle ne bouge pas pendant le défilement des images. */
    position: sticky;
    top: 1rem;
    height: calc(100dvh - 2rem);
    flex: 1;
}

.carte-points {
    flex: 1;
}
```

Enfin la barre elle-même :

```css
.carte-position-bar {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    justify-content: space-between;
    margin: 0;
    font-size: 0.875rem;
    color: #6b7280;
}
```

- [ ] **Étape 5 : l'écran rend la barre**

`src/trajets/ui/TrajetEditorScreen.ts` — les deux `query` avec les autres, puis
l'abonnement et le geste :

```ts
const positionStatus = query('#editor-position-status', HTMLSpanElement, root);
const positionButton = query('#editor-position-button', HTMLButtonElement, root);
let derniereCoordonnee: Coordonnee | null = null;
```

```ts
maPosition$.pipe(takeUntil(parti$)).subscribe((position) => {
    renderPositionBar(position);
});

eventsOf(positionButton, 'click')
    .pipe(takeUntil(parti$))
    .subscribe(() => {
        goToPosition();
    });
```

```ts
/**
 * La barre de la carte : ce qu'on sait de la position, ou la phrase qui dit
 * pourquoi on n'en sait rien. C'est l'écran qui rédige — la carte, elle, ne
 * reçoit que des coordonnées.
 */
function renderPositionBar(position: DisplayedPosition): void {
    derniereCoordonnee = position.kind === 'inconnue' ? null : position.coordonnee;
    positionButton.disabled = derniereCoordonnee === null;
    positionStatus.textContent = position.kind === 'connue' ? '' : position.message;
}

/** Le cadrage ne bouge jamais tout seul ; ici on le lui demande. */
function goToPosition(): void {
    const coordonnee = derniereCoordonnee;
    if (coordonnee === null) {
        return;
    }
    carteDesPoints.centerOn(coordonnee);
}
```

- [ ] **Étape 6 : normaliser le bandeau de consigne**

Le bandeau s'écrit aujourd'hui de **trois manières différentes** — deux lignes
dans `changeMode`, deux autres dans `chooseCoordonnee`, et une restauration par
comparaison dans son `finally`. Un seul écrivain, et la consigne dérivée de
l'état :

```ts
/** Ce que l'écran attend de l'utilisateur, en une phrase — ou rien du tout. */
function hintFor(mode: PlacementMode): string | null {
    return mode === null ? null : "Touchez l'image à la hauteur voulue…";
}

/** Le seul endroit qui écrit le bandeau : `null` le retire. */
function renderHint(text: string | null): void {
    hintBanner.hidden = text === null;
    if (text !== null) {
        hintText.textContent = text;
    }
}
```

`changeMode` devient :

```ts
function changeMode(mode: PlacementMode): void {
    placementMode = mode;
    renderHint(hintFor(mode));
    pagesContainer.classList.toggle('placement-active', mode !== null);
}
```

et la branche grand écran de `chooseCoordonnee` :

```ts
renderHint('Cliquez la coordonnée sur la carte…');
try {
    return await carteDesPoints.chooseCoordonnee(initial);
} finally {
    renderHint(hintFor(placementMode));
}
```

- [ ] **Étape 7 : jouer les tests et les voir passer**

Run : `pnpm typecheck && pnpm lint && pnpm test`
Attendu : PASSE.

- [ ] **Étape 8 : commiter**

```bash
git add src/trajets/ui src/style.css
git commit -m "Donne à la carte de l'éditeur sa barre, et au bandeau un seul écrivain

La barre suit la carte quand elle couvre le schéma : la phrase qui explique
l'absence de marqueur ne peut pas rester derrière l'écran qu'on recouvre.
Au passage, la consigne de placement s'écrivait de trois manières — elle se
dérive maintenant de l'état, en un seul endroit."
```

---

## Tâche 8 : Le scénario de bout en bout

**Fichiers :**

- Modifier : `e2e/gps.spec.ts`

**Interfaces :**

- Consomme : `#carte-points .carte-position-marker`,
  `#carte-container .carte-position-marker`, `#editor-position-button`,
  `#carte-button`, `#simuler-button`.

- [ ] **Étape 1 : écrire les scénarios**

`e2e/gps.spec.ts` — le fichier accorde déjà `permissions: ['geolocation']` et une
position ; c'est le seul, et c'est pourquoi les scénarios vont là. Ajouter aux
imports `isLargeScreen`, puis, dans le `describe` existant :

```ts
test("Étant donné ma position accordée, quand j'ouvre la carte de l'éditeur, alors mon marqueur y est", async ({
    page,
}) => {
    await ouvrirUnTrajetAvecUnePage(page);
    await ajouterUnPoint(page, 0.8, 0);

    // Sous 900 px la carte est repliée — et le GPS avec elle, délibérément.
    if (!(await isLargeScreen(page))) {
        await page.locator('#carte-button').click();
    }

    await expect(page.locator('#carte-points .carte-position-marker')).toBeVisible();
    await expect(page.locator('#editor-position-button')).toBeEnabled();
});

test("Étant donné le suivi au GPS, quand j'ouvre la carte pour simuler, alors mon marqueur y est", async ({
    page,
}) => {
    await ouvrirUnTrajetAvecUnePage(page);
    await ajouterUnPoint(page, 0.8, 0);
    await ajouterUnPoint(page, 0.2, 150);
    await page.getByRole('button', { name: 'Suivre' }).click();

    await page.locator('#simuler-button').click();

    await expect(page.locator('#screen-carte')).toBeVisible();
    await expect(page.locator('#carte-container .carte-position-marker')).toBeVisible();
});
```

> Le mock de géolocalisation de Playwright ne pousse qu'au **changement** ; ici
> la position est posée par `test.use` avant le chargement, donc le premier fix
> arrive de lui-même. Si un scénario devait la faire bouger, reprendre le
> contournement `visibilitychange` du second cas de ce fichier plutôt que d'en
> inventer un autre.

- [ ] **Étape 2 : jouer les scénarios**

Run : `pnpm test:e2e e2e/gps.spec.ts`
Attendu : PASSE sur les cinq navigateurs.

> Sur macOS, Chromium ne démarre pas dans le bac à sable Bash ; `pnpm test:e2e`
> en est exclu et s'exécute donc hors confinement. Ne pas chercher à le lancer
> depuis un shell confiné.

- [ ] **Étape 3 : compléter les témoins des exigences**

`docs/EXIGENCES.md` — ajouter `, `E e2e/gps.spec.ts`` aux témoins de GR-17 et
GR-21.

- [ ] **Étape 4 : commiter**

```bash
git add e2e/gps.spec.ts docs/EXIGENCES.md
git commit -m "Fait constater le marqueur par un vrai navigateur, sur les deux cartes"
```

---

## Tâche 9 : Les disparités restantes

Trois niveaux mélangés, repérés dans les fichiers que ce lot a touchés, et une
duplication entre les deux adapters. Aucun changement de comportement : les tests
existants doivent passer **sans être modifiés**, c'est le témoin de ce refactor.

**Fichiers :**

- Modifier : `src/carte/adapters/fitting.ts`
- Modifier : `src/carte/adapters/LeafletCarteDesPoints.ts`
- Modifier : `src/carte/adapters/LeafletCoordonneeSelector.ts`
- Modifier : `src/suivi/ui/SuiviScreen.ts`
- Modifier : `src/style.css`

- [ ] **Étape 1 : la remesure, écrite une fois pour deux cartes**

`setTimeout(() => carte.invalidateSize(), 0)` est écrit **deux fois**, dans les
deux adapters, avec deux commentaires qui disent la même chose — exactement la
divergence que `fitting.ts` a été créé pour empêcher. Ajouter à `fitting.ts` :

```ts
/**
 * Remesure la carte à la microtâche suivante : son conteneur vient d'être
 * dévoilé ou (dé)masqué avec son écran, et Leaflet ne mesure qu'au moment où on
 * le lui demande. Écrit une fois pour les deux cartes — il l'était deux fois.
 */
export function remeasureAfterReveal(carte: L.Map): void {
    setTimeout(() => carte.invalidateSize(), 0);
}
```

et remplacer les deux appels (`LeafletCarteDesPoints.show`,
`LeafletCoordonneeSelector.choose`) par `remeasureAfterReveal(carte);`.

- [ ] **Étape 2 : le curseur d'attente, posé et retiré à un seul endroit**

`LeafletCarteDesPoints` manipule `awaiting-click` à trois endroits, par deux
chemins d'accès différents à la carte (`carte.getContainer()` dans `mount`,
`this.carte?.getContainer()` dans `cancelChoice`). Ajouter :

```ts
    /**
     * Le curseur qui annonce qu'un clic est attendu. Un seul endroit le pose et
     * le retire : il s'écrivait trois fois, en `add`, en `remove`, et par deux
     * chemins d'accès différents à la même carte.
     */
    private awaitClick(awaiting: boolean): void {
        this.carte?.getContainer().classList.toggle('awaiting-click', awaiting);
    }
```

et remplacer les trois manipulations par `this.awaitClick(true)` /
`this.awaitClick(false)`.

- [ ] **Étape 3 : la mesure qui répondait à une question nommée**

`SuiviScreen.placeOverviewPosition` teste
`overviewStack.getBoundingClientRect().height === 0` : une géométrie brute au
milieu de code qui parle d'aperçu et de position. Nommer la question, en gardant
mot pour mot la raison déjà écrite :

```ts
/**
 * L'aperçu est-il déplié ? `display: none` ne mesure rien, et c'est la
 * mesure qui répond — pas un seuil de largeur recopié ici. La feuille de
 * style reste seule à décider.
 */
function isOverviewVisible(): boolean {
    return overviewStack.getBoundingClientRect().height > 0;
}
```

```ts
function placeOverviewPosition(currentTrajet: Trajet, last: SurTrajet): void {
    if (!isOverviewVisible()) {
        positionBar.hidden = true;
        return;
    }
    const offset = offsetAt(overviewEtapes(currentTrajet), last);
    positionBar.style.top = `${String(offset)}px`;
    positionBar.hidden = false;
}
```

- [ ] **Étape 4 : le commentaire écrit deux fois**

`src/style.css`, vers la ligne 27, porte deux fois de suite le même commentaire
(« Un custom element est `inline` par défaut… »), à un mot près. Supprimer le
premier, garder le second.

- [ ] **Étape 5 : jouer la suite entière, sans avoir touché un test**

Run : `pnpm typecheck && pnpm lint && pnpm test`
Attendu : PASSE — et **aucun fichier de test modifié dans cette tâche** : c'est
ce qui prouve que rien n'a changé de comportement.

- [ ] **Étape 6 : commiter**

```bash
git add src/carte src/suivi/ui/SuiviScreen.ts src/style.css
git commit -m "Remet au même niveau ce qui se lisait dans la même expression

Une remesure écrite deux fois avec deux commentaires identiques, un curseur
manipulé par deux chemins d'accès à la même carte, une hauteur mesurée là
où une question était posée. Aucun test touché : c'est le témoin."
```

---

## Tâche 10 : Les documents rattrapent le code

**Fichiers :**

- Modifier : `docs/GLOSSAIRE.md`
- Modifier : `docs/ARCHITECTURE.md`
- Modifier : `src/suivi/ports/Foreground.ts`

- [ ] **Étape 1 : le glossaire nomme le concept**

`docs/GLOSSAIRE.md`, table **Métier**, après « Simulation » :

```
| **Ma position** | Où se trouve l'utilisateur, telle que les cartes la montrent : le GPS réel, ou la position simulée quand la simulation tourne. Approximative au-delà de ce que le suivi accepte pour caler la page — elle est alors cerclée de son incertitude. | `DisplayedPosition` |
```

**Ne pas toucher à la liste close du Lexique** : `position` en est absent, donc
technique par défaut — sans conséquence, l'orthographe étant la même dans les
deux langues.

- [ ] **Étape 2 : la table des ports dit la vérité**

`docs/ARCHITECTURE.md`, lignes 48-49 — deux dérives, dont une antérieure à ce
lot (`show` a trois arguments, pas deux) :

```
| `CoordonneeSelector` | `choose(initial, reperes, position$) → Coordonnee \| null`                                                                                   | `LeafletCoordonneeSelector` (Leaflet + OSM, plein écran)                              |
| `CarteDesPoints`     | `mount(container)` / `unmount()` puis `show(points, onMove, onShow)` / `showPosition(position$)` / `centerOn(coordonnee)` / `resized()` / `chooseCoordonnee(initial)` / `cancelChoice()` | `LeafletCarteDesPoints` (carte intégrée à l'éditeur, marqueurs numérotés déplaçables) |
```

- [ ] **Étape 3 : le JSDoc de `Foreground` cesse de nommer un opérateur absent**

`src/suivi/ports/Foreground.ts` annonce un `auditTime` côté GPS là où
`GeolocationPositionSource` fait `throttleTime(MINIMUM_DELAY_BETWEEN_RESTARTS_MS)`.
Corriger le nom de l'opérateur dans la prose, sans rien changer d'autre.

- [ ] **Étape 4 : vérifier tout le lot**

Run : `pnpm quality`
Attendu : PASSE — typecheck, lint, tests et audit fallow.

Run : `pnpm test:e2e`
Attendu : PASSE sur les cinq navigateurs.

- [ ] **Étape 5 : commiter**

```bash
git add docs src/suivi/ports/Foreground.ts
git commit -m "Fait dire aux documents ce que le code fait vraiment

Le glossaire nomme « ma position », la table des ports rattrape un show()
à trois arguments qu'elle en donnait deux, et Foreground cesse d'annoncer
un auditTime que le code n'a jamais écrit."
```

---

## Après le lot

- `pnpm mutation` sur `src/carte/adapters` et `src/suivi/adapters` : **lire les
  survivants**, ne pas courir après le score. Deux sont attendus et à commenter
  sur place plutôt qu'à tuer — le `setTimeout` de remesure (jsdom ne mesure
  rien) et l'écouteur `resize` de `mount` (déjà documenté comme survivant
  assumé, l'observer demanderait un espion).
- `superpowers:finishing-a-development-branch` pour ramener la branche
  `ma-position-sur-les-cartes` sur `main` en `--ff-only`.

## Revue de ce plan

**Couverture de la spec.** Chaque section a sa tâche : source de la position
(5, 6) · flux jusqu'aux ports (3, 4) · fix imprécis conservé (1) · cadrage
englobant (2) · GPS allumé à vue (6) · rien de plus en simulation (5) · symbole,
cercle, bouton, message (3, 4, 7) · exigences GR-17 à GR-23 et CV-8 (3 à 6, 8) ·
dérives de doc (10). Les trois limites assumées de la spec ne demandent aucun
code — elles sont écrites, c'est leur seul livrable.

**Écart assumé avec la spec.** Elle annonçait `LeafletCarteDesPoints` ignorant le
`message` ; la tâche 7 le fait afficher par l'**écran** d'édition, dans sa propre
barre, ce qui est exactement ce que la spec décrivait par ailleurs. Le champ
n'est donc lu que par la carte plein écran, comme prévu.

**Deux pièges attrapés à la relecture, et déjà réparés dans le plan.**

1. Les identifiants de la barre de l'éditeur (`#editor-position-status`,
   `#editor-position-button`) sont **distincts** de ceux de la carte plein écran
   (`#carte-position-status`, `#carte-position-button`) : les deux barres
   coexistent dans le document, et deux fois le même `id` n'est pas un HTML
   valide. Le sélecteur plein écran interroge `document` sans racine — il aurait
   trouvé celui de l'écran monté.
2. `resetSuivi` **ne remet rien à zéro** pour `maPosition$`, contrairement à la
   première intention : le contrat de `PositionSource` garantit qu'une source
   commence par un état, donc le `attente` de la source qui arrive efface
   l'ancienne position tout seul. La ligne défensive aurait été un mutant
   équivalent, et ce dépôt refuse de les fabriquer.

**Une seule chose reste à lire dans le fichier plutôt qu'ici** : la liste exacte
des boutons que le cas QA-5 de `TrajetEditorScreen.test.ts` énumère, à laquelle
ajouter `'editor-position-button'`. Partout ailleurs les signatures, les noms de
fabriques (`attacherLEcran`, `dependances`, `laisserLesPromessesSAchever`) et le
rythme d'attente de chaque fichier sont recopiés du code.
