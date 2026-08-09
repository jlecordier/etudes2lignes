# Aller à la carte depuis le repère — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cliquer la pastille numérotée d'un repère, sur le schéma, amène la carte sur ce point.

**Architecture:** Le geste est le symétrique exact de GR-11 (marqueur de la carte → repère du schéma), et emprunte la même mécanique : la pastille devient un bouton qui **annonce** une intention (`show-point-on-carte`), l'écran l'écoute une fois sur sa racine, ouvre la carte si elle était repliée, puis demande au port `CarteDesPoints` de se caler sur la coordonnée du point. La coordonnée quitte au passage l'infobulle du repère pour un attribut `data-coordonnee` : illisible pour un humain, elle reste la seule chose que quatre scénarios e2e peuvent relire.

**Tech Stack:** TypeScript · vanilla DOM (custom elements natifs) · Leaflet · Vitest (jsdom) · Playwright.

**Conception :** [`docs/superpowers/specs/2026-08-09-aller-a-la-carte-depuis-le-repere-design.md`](../specs/2026-08-09-aller-a-la-carte-depuis-le-repere-design.md)

## Global Constraints

- **Langue** : français pour le métier, anglais pour la plomberie, mot à mot ([ADR 0007](../../adr/0007-langue-du-code-metier-francais-technique-anglais.md)). Prose, commentaires, titres de tests BDD, étapes e2e et messages de commit : **français**.
- **Pas de `!` ni de `as` de forme** ([ADR 0002](../../adr/0002-lint-type-aware-strict.md)). Accès indexé → `requireElementAt` ; recherche DOM → `query` / `queryAll`, qui vérifient le type par `instanceof`.
- **Ne jamais désactiver une règle de lint** pour esquiver un signalement.
- **Tests BDD, par état** : `Étant donné / Quand / Alors`. **Pas de `vi.fn`, pas de `toHaveBeenCalled`** — des faux écrits à la main, injectés, et des assertions sur les **valeurs produites**.
- **Règle de dépendance** : `domain` ne dépend de rien ; `ports` du domaine seul ; `adapters`/`ui` des ports + domaine ; seul `src/main.ts` instancie les adapters concrets.
- **Le seuil du grand écran (900 px) ne s'écrit que dans `src/style.css`**, exposé par la variable `--large-screen`. Le TypeScript et les tests la lisent (`isLargeScreen()`), jamais le nombre.
- **Zoom du point unique : 12**, défini une seule fois dans `src/carte/adapters/fitting.ts` (`SINGLE_POINT_ZOOM`). Ne pas le recopier.
- **Intitulé du bouton, verbatim** : `` `Voir le point ${numéro} sur la carte` `` — porté par `aria-label` **et** `title`.
- **Format de l'attribut, verbatim** : `data-coordonnee="<latitude>,<longitude>"`, degrés bruts, virgule sans espace, sans préfixe ni arrondi. Exemple : `44.826,-0.556`.
- **Nom de l'intention, verbatim** : `show-point-on-carte`, portant un `PointIntent`.
- **Chaque tâche finit par un commit**, message en français, disant _pourquoi_. Le hook de pré-commit lance `fallow fix --yes`, `lint-staged`, `typecheck` puis `test` : un commit qui « ne fait rien » est souvent le hook qui valide.
- **`pnpm quality`** (typecheck + lint + test + audit fallow) doit être vert avant de déclarer une tâche finie.

---

## Structure des fichiers

| Fichier                                       | Responsabilité après ce plan                                                                        |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `src/carte/ports/CarteDesPointsPort.ts`       | contrat de la carte de l'éditeur ; regagne `centerOn(coordonnee)`                                   |
| `src/carte/adapters/LeafletCarteDesPoints.ts` | implémentation Leaflet ; `centerOn` délègue à `centerOnCoordonnee`, déjà écrite dans `fitting.ts`   |
| `src/trajets/ui/intents.ts`                   | catalogue des intentions des feuilles ; gagne `show-point-on-carte`                                 |
| `src/trajets/ui/PointMarker.html`             | balisage du repère ; la pastille devient un `<button type="button">`                                |
| `src/trajets/ui/PointMarker.ts`               | fabrique du repère ; câble le bouton, pose `data-coordonnee`, ne pose plus de `title` de coordonnée |
| `src/trajets/ui/TrajetEditorScreen.ts`        | écoute l'intention, ouvre la carte au besoin, la centre                                             |
| `src/trajets/domain/presentation.ts`          | perd `pointCoordonneeText` — plus aucune coordonnée n'est mise en phrase                            |
| `src/style.css`                               | rend la pastille cliquable, sauf pendant le placement                                               |
| `e2e/helpers.ts`                              | `coordonneeDuPoint` lit l'attribut ; `ecartAuCentreDeLaCarte` retrouve un appelant                  |
| `docs/EXIGENCES.md`, `README.md`              | GR-15 ajoutée, GR-10 réécrite                                                                       |

**Quatre tâches**, chacune livrable et relisable seule :

1. `centerOn` revient au port et à l'adapter — la carte sait se caler sur un point.
2. Le geste — la pastille devient un bouton, l'écran l'écoute, la carte suit.
3. La coordonnée quitte l'infobulle pour un attribut.
4. Les témoins e2e du geste, et la documentation d'accord.

---

### Task 1 : `centerOn` revient au port et à l'adapter

**Files:**

- Modify: `src/carte/ports/CarteDesPointsPort.ts`
- Modify: `src/carte/adapters/LeafletCarteDesPoints.ts`
- Modify: `src/trajets/ui/TrajetEditorScreen.test.ts:74-127` (le faux `FakeCarteDesPoints` doit satisfaire le port)
- Test: `src/carte/adapters/LeafletCarteDesPoints.test.ts`

**Interfaces:**

- Consumes: `centerOnCoordonnee(carte: L.Map, coordonnee: Coordonnee): void` — déjà exportée par `src/carte/adapters/fitting.ts`, déjà importée par `LeafletCarteDesPoints.ts`, et déjà utilisée par `chooseCoordonnee`. Elle applique `setView(toLatLng(coordonnee), 12, { animate: false })`.
- Produces: `CarteDesPoints.centerOn(coordonnee: Coordonnee): void`. `FakeCarteDesPoints.centrages(): Coordonnee[]` dans `TrajetEditorScreen.test.ts` — les coordonnées sur lesquelles la carte a été calée, dans l'ordre ; consommée par la Task 2.

**Contexte :** `centerOn` existait au port jusqu'au commit `5c3d45d` (« Supprime la liste des points »), retiré alors faute d'appelant. On le remet **à l'identique** : même nom, même signature, même délégation.

- [ ] **Step 1 : Écrire les tests qui échouent**

Dans `src/carte/adapters/LeafletCarteDesPoints.test.ts`, à la fin du `describe('Carte des points de l’éditeur', …)`, après le bloc « Étant donné un marqueur que l'utilisateur fait glisser » :

```ts
describe('Étant donné un point que l’écran demande de montrer sur la carte', () => {
    it('alors la carte se cale dessus, au zoom d’un point unique', () => {
        const { carteDesPoints, show, carte } = testBed();
        show([point(1, PARIS), point(2, BORDEAUX)]);

        carteDesPoints.centerOn(BORDEAUX);

        expect(carte().getCenter().lat).toBeCloseTo(BORDEAUX.latitude, 6);
        expect(carte().getCenter().lng).toBeCloseTo(BORDEAUX.longitude, 6);
        expect(carte().getZoom()).toBe(12);
    });

    it('alors le demander à une carte démontée est refusé, en le disant', () => {
        const { carteDesPoints } = testBed();

        carteDesPoints.unmount();

        expect(() => {
            carteDesPoints.centerOn(PARIS);
        }).toThrow('n’est pas montée');
    });
});
```

- [ ] **Step 2 : Lancer les tests pour les voir échouer**

Run: `pnpm test -- src/carte/adapters/LeafletCarteDesPoints.test.ts`
Expected: FAIL — `carteDesPoints.centerOn is not a function` (et une erreur de typage `tsc` : `Property 'centerOn' does not exist`).

- [ ] **Step 3 : Ajouter la méthode au port**

Dans `src/carte/ports/CarteDesPointsPort.ts`, ajouter au bloc de contrat du JSDoc, après la puce `onShow` :

```
 * - `centerOn` cale la carte sur une coordonnée, au zoom d'un point unique : le
 *   pendant de `onShow`, pour le geste inverse. Le schéma désigne un point, la
 *   carte vient à lui — on arrive d'ailleurs, il n'y a donc pas de cadrage
 *   courant à préserver.
```

et à l'interface, entre `show` et `resized` :

```ts
    centerOn(coordonnee: Coordonnee): void;
```

- [ ] **Step 4 : Implémenter dans l'adapter**

Dans `src/carte/adapters/LeafletCarteDesPoints.ts`, entre `resized()` et `chooseCoordonnee()` :

```ts
    /**
     * Amène la carte sur un point désigné depuis le schéma. Le zoom d'un point
     * unique, et non le cadrage courant : on arrive d'ailleurs, il n'y a pas
     * d'échelle réglée par l'utilisateur à lui voler.
     */
    centerOn(coordonnee: Coordonnee): void {
        centerOnCoordonnee(this.mountedCarte(), coordonnee);
    }
```

`centerOnCoordonnee` est déjà importée en tête de fichier ; ne pas ajouter d'import.

- [ ] **Step 5 : Faire suivre le faux de l'écran**

`FakeCarteDesPoints` (dans `src/trajets/ui/TrajetEditorScreen.test.ts`) implémente `CarteDesPoints` : sans cette méthode, `pnpm typecheck` échoue. Ajouter le champ à côté de `private remesures = 0;` :

```ts
    private readonly centres: Coordonnee[] = [];
```

et la méthode, après `resized()` :

```ts
    centerOn(coordonnee: Coordonnee): void {
        this.centres.push(coordonnee);
    }
```

puis, à côté de `remesuresDemandees()` :

```ts
    /** Les coordonnées sur lesquelles la carte a été calée, dans l'ordre. */
    centrages(): Coordonnee[] {
        return this.centres;
    }
```

`Coordonnee` est déjà importée dans ce fichier de test.

**Note fallow :** `centrages()` n'a pas encore d'appelant (la Task 2 le lui donne). C'est un membre de classe local à un module de test, pas un export : `fallow fix --yes` du hook de pré-commit n'y touche pas. S'il le signalait malgré tout, c'est le faux positif documenté par [ADR 0003](../../adr/0003-fallow-garde-fou-qualite.md) — ne pas le supprimer.

- [ ] **Step 6 : Lancer les tests pour les voir passer**

Run: `pnpm quality`
Expected: PASS — typecheck, lint, tous les tests (deux de plus qu'avant), audit fallow vert.

- [ ] **Step 7 : Commit**

```bash
git add src/carte/ports/CarteDesPointsPort.ts src/carte/adapters/LeafletCarteDesPoints.ts src/carte/adapters/LeafletCarteDesPoints.test.ts src/trajets/ui/TrajetEditorScreen.test.ts
git commit -F - <<'EOF'
Rend à la carte le pouvoir de se caler sur un point

Retiré avec la liste des points faute d'appelant, il en retrouve un : le
schéma va désigner un point, et la carte doit venir à lui. Le zoom du point
unique, et non le cadrage courant — on arrive d'ailleurs, il n'y a pas
d'échelle à préserver.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2 : Le geste — la pastille emmène à la carte

**Files:**

- Modify: `src/trajets/ui/intents.ts:52-66` (la carte des événements)
- Modify: `src/trajets/ui/PointMarker.html`
- Modify: `src/trajets/ui/PointMarker.ts:46-58`
- Modify: `src/trajets/ui/TrajetEditorScreen.ts` (écouteurs + une fonction)
- Modify: `src/style.css:247-249, 275-290, 297-301`
- Test: `src/trajets/ui/TrajetEditorScreen.test.ts`

**Interfaces:**

- Consumes: `CarteDesPoints.centerOn(coordonnee)` et `FakeCarteDesPoints.centrages()` (Task 1). `emitIntent(host, type, detail)` de `intents.ts`. `isLargeScreen(): boolean` et `toggleCarte(): void`, tous deux déjà dans `TrajetEditorScreen.ts`. `trajetPoint(trajet, pointId): Point`, déjà en bas du même fichier, qui lève si le point n'appartient pas au trajet.
- Produces: l'intention `'show-point-on-carte': CustomEvent<PointIntent>`. La pastille est désormais un `HTMLButtonElement` de classe `point-number` — tout code qui la cherchait en `HTMLSpanElement` doit suivre.

**Attention, deux endroits cherchent la pastille par son type :**

- `src/trajets/ui/PointMarker.ts:53` — `query('.point-number', HTMLSpanElement, element)`
- `src/trajets/ui/TrajetEditorScreen.test.ts:294` — dans `elementsMontres()`

Les deux doivent passer à `HTMLButtonElement`, sinon `query` lève à l'exécution (elle vérifie par `instanceof`).

- [ ] **Step 1 : Écrire les tests qui échouent**

Dans `src/trajets/ui/TrajetEditorScreen.test.ts`, ajouter le helper à côté de `cliquerLaBascule` (vers la ligne 267) :

```ts
/** Clique la pastille numérotée d'un repère : le geste « emmène-moi à la carte ». */
function cliquerLaPastille(element: HTMLElement, numero: number): void {
    cliquerLAction(element, `Voir le point ${String(numero)} sur la carte`);
}
```

Puis, après le `describe('Étant donné deux points sur deux pages différentes', …)` existant, ajouter :

```ts
describe('Étant donné deux points sur deux pages, quand je clique la pastille de l’un', () => {
    it('alors la carte se cale sur SA coordonnée, pas celle de son voisin', async () => {
        repository = new FakeTrajetRepository(trajetDeDeuxPoints);
        const element = await attacherLEcran();

        cliquerLaPastille(element, 2);

        // Le point 1 est à Bordeaux, le point 2 à Paris : c'est bien celui
        // qu'on a désigné que la carte est allée chercher.
        expect(
            carteDesPoints
                .centrages()
                .map((coordonnee) => [coordonnee.latitude, coordonnee.longitude]),
        ).toEqual([[48.8566, 2.3522]]);
    });

    it('alors la pastille de chaque repère annonce où elle mène', async () => {
        repository = new FakeTrajetRepository(trajetDeDeuxPoints);
        const element = await attacherLEcran();

        // Le document se lit de bas en haut : le point 2, posé sur la
        // dernière page du voyage, s'affiche en haut de la pile.
        expect(
            queryAll('point-marker .point-number', HTMLButtonElement, element).map((pastille) => [
                pastille.textContent,
                pastille.getAttribute('aria-label'),
            ]),
        ).toEqual([
            ['2', 'Voir le point 2 sur la carte'],
            ['1', 'Voir le point 1 sur la carte'],
        ]);
    });
});

describe('Étant donné un petit écran où la carte est repliée', () => {
    it('quand je clique la pastille d’un point, alors la carte vient par-dessus le schéma', async () => {
        const element = await attacherLEcran();

        cliquerLaPastille(element, 1);

        expect(element.classList.contains('carte-ouverte')).toBe(true);
        // La remesure part avant le centrage : sans elle, la carte se
        // calerait sur la taille de la vignette qu'elle vient de quitter.
        expect(carteDesPoints.remesuresDemandees()).toBe(1);
        expect(carteDesPoints.centrages()).toHaveLength(1);
    });

    it('quand la carte est déjà ouverte, alors elle y reste et se contente de se caler', async () => {
        const element = await attacherLEcran();
        cliquerLaBascule(element);

        cliquerLaPastille(element, 1);

        expect(element.classList.contains('carte-ouverte')).toBe(true);
        // Une seule remesure : celle de la bascule. Le geste n'en demande
        // pas une seconde pour un conteneur qui n'a pas changé de taille.
        expect(carteDesPoints.remesuresDemandees()).toBe(1);
        expect(carteDesPoints.centrages()).toHaveLength(1);
    });
});
```

- [ ] **Step 2 : Lancer les tests pour les voir échouer**

Run: `pnpm test -- src/trajets/ui/TrajetEditorScreen.test.ts`
Expected: FAIL — `Aucun bouton « Voir le point 2 sur la carte » dans l’écran.`

- [ ] **Step 3 : Déclarer l'intention**

Dans `src/trajets/ui/intents.ts`, dans `declare global { interface HTMLElementEventMap { … } }`, ajouter **avant** `'move-point-on-image'` :

```ts
        'show-point-on-carte': CustomEvent<PointIntent>;
```

- [ ] **Step 4 : Faire de la pastille un bouton**

Remplacer intégralement `src/trajets/ui/PointMarker.html` par :

```html
<!-- La pastille est un bouton : le numéro qui dit quel point c'est est aussi ce
     qui emmène le voir sur la carte. Le geste inverse existe déjà, du marqueur
     de la carte vers ce repère. -->
<button type="button" class="point-number"></button>
<!-- Les trois actions du point, directement sur l'image, pour ne pas avoir à
     remonter en haut de la page à chaque point. -->
<div class="point-actions"></div>
```

Dans `src/trajets/ui/PointMarker.ts`, remplacer la ligne 53 :

```ts
query('.point-number', HTMLSpanElement, element).textContent = String(marker.number);
```

par :

```ts
const pastille = query('.point-number', HTMLButtonElement, element);
pastille.textContent = String(marker.number);
// Le nom accessible et l'infobulle disent la même chose : sous 560 px la
// feuille de style masque les libellés visibles, et une pastille muette
// s'annoncerait « 2 » sans dire ce qu'un clic en ferait.
const intitule = `Voir le point ${String(marker.number)} sur la carte`;
pastille.setAttribute('aria-label', intitule);
pastille.title = intitule;
pastille.addEventListener('click', () => {
    emitIntent(element, 'show-point-on-carte', {
        pointId: marker.pointId,
        number: marker.number,
    });
});
```

Et compléter l'import en tête de fichier — `emitIntent` s'ajoute à côté du type déjà importé :

```ts
import { emitIntent, type PointIntent } from './intents';
```

- [ ] **Step 5 : Faire écouter l'écran**

Dans `src/trajets/ui/TrajetEditorScreen.ts`, ajouter un écouteur **avant** celui de `move-point-on-image` (vers la ligne 166) :

```ts
eventsOf(root, 'show-point-on-carte')
    .pipe(takeUntil(parti$))
    .subscribe((event) => {
        showPointOnCarte(event.detail.pointId);
    });
```

Puis la fonction, juste **après** `showPointFromCarte` (vers la ligne 432), pour que les deux sens du même aller-retour se lisent l'un sous l'autre :

```ts
/**
 * Le geste inverse : un point désigné sur le schéma, et la carte vient à
 * lui. Sous 900 px elle se met par-dessus le schéma — la laisser repliée
 * n'emmènerait nulle part. Au-dessus, elle est déjà à côté de la pile :
 * poser `carte-ouverte` la mettrait en plein écran, sa règle l'emportant en
 * spécificité sur celle du grand écran.
 *
 * La bascule demande la remesure, et le centrage vient après : l'inverse
 * calerait la carte sur la taille de la vignette qu'elle vient de quitter.
 */
function showPointOnCarte(pointId: PointId): void {
    const currentTrajet = trajet;
    if (currentTrajet === null) {
        return;
    }
    if (!isLargeScreen() && !root.classList.contains('carte-ouverte')) {
        toggleCarte();
    }
    carteDesPoints.centerOn(trajetPoint(currentTrajet, pointId).coordonnee);
}
```

- [ ] **Step 6 : Réparer `elementsMontres`**

Dans `src/trajets/ui/TrajetEditorScreen.test.ts:294`, la pastille n'est plus un `<span>` :

```ts
            `${montre.localName} ${query('.point-number', HTMLButtonElement, montre).textContent}`,
```

- [ ] **Step 7 : Rendre la pastille cliquable dans la feuille de style**

Dans `src/style.css`, trois retouches.

**(a)** Dans la règle partagée pastille-schéma / pastille-carte (vers la ligne 275), ajouter `padding: 0;` après `height:` — et compléter le commentaire au-dessus, qui explique déjà pourquoi les deux pastilles partagent une règle :

```css
.point-number,
.carte-points .carte-marker,
#carte-container .carte-marker {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--point-badge-size);
    height: var(--point-badge-size);
    /* La pastille du schéma est un bouton : sans cela, le `padding` de la règle
       globale `button` déformerait le disque, et seulement de ce côté-ci — les
       deux vues cesseraient de montrer la même pastille. */
    padding: 0;
    background: #dc2626;
    color: white;
    border: 2px solid white;
    border-radius: 999px;
    font-size: 0.8rem;
    font-weight: 600;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
}
```

**(b)** Dans `point-marker .point-number` (vers la ligne 297), ajouter la ligne et la phrase qui l'explique :

```css
point-marker .point-number {
    position: absolute;
    left: 0.25rem;
    top: calc((var(--point-line-thickness) + var(--point-badge-size)) / -2);
    /* Le repère est transparent aux clics ; la pastille, elle, en attend un. */
    pointer-events: auto;
}
```

**(c)** Juste après `.placement-active .image-area` (vers la ligne 249) :

```css
/* Tant qu'on vise une hauteur, toute l'image est cible : la pastille redevient
   transparente, sans quoi elle avalerait le clic sur ses 26 px et le point ne
   pourrait pas se poser à la hauteur d'un point existant. */
.placement-active .point-number {
    pointer-events: none;
}
```

- [ ] **Step 8 : Lancer les tests pour les voir passer**

Run: `pnpm quality`
Expected: PASS — typecheck, lint, tous les tests, audit fallow vert.

- [ ] **Step 9 : Commit**

```bash
git add src/trajets/ui/intents.ts src/trajets/ui/PointMarker.html src/trajets/ui/PointMarker.ts src/trajets/ui/TrajetEditorScreen.ts src/trajets/ui/TrajetEditorScreen.test.ts src/style.css
git commit -F - <<'EOF'
Fait du numéro d'un point le chemin vers la carte

La carte savait emmener au schéma ; depuis un repère, rien ne disait où le
point se trouve dans le monde. La pastille annonce déjà lequel c'est : elle
devient ce qui y mène, et le repère un aller-retour.

Elle redevient transparente aux clics pendant le placement : viser une
hauteur ne doit pas buter sur les 26 px d'un point déjà posé.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3 : La coordonnée quitte l'infobulle pour une donnée

**Files:**

- Modify: `src/trajets/ui/PointMarker.ts:9-15, 46-58`
- Modify: `src/trajets/ui/TrajetEditorScreen.ts:12, 496-504`
- Modify: `src/trajets/domain/presentation.ts:20-27` (suppression)
- Modify: `src/trajets/domain/presentation.test.ts:1-2, 30-43` (suppression)
- Modify: `src/trajets/ui/TrajetEditorScreen.test.ts:320-328`
- Modify: `e2e/helpers.ts:44-56`
- Modify: `e2e/points.spec.ts:31-36, 126, 142, 305-309`
- Modify: `e2e/gps.spec.ts:38-47`
- Modify: `e2e/carte-editeur.spec.ts:44` (la dernière assertion du test de glisser)

**Interfaces:**

- Consumes: `Coordonnee` (`src/trajets/domain/Coordonnee.ts`), un value object aux champs publics `readonly latitude: number` et `readonly longitude: number`.
- Produces: `DisplayedMarker.coordonnee` change de type — `string` (phrase formatée) devient `Coordonnee`. `<point-marker>` porte `data-coordonnee="44.826,-0.556"` et n'a plus de `title`. `coordonneeDuPoint(page, index?)` de `e2e/helpers.ts` garde sa signature `Promise<string>` mais rend `"44.826,-0.556"` au lieu de `"Coordonnée : 44.8260, -0.5560"`.

**Pourquoi la donnée reste :** aucun humain ne lit une suite de décimales, mais c'est le seul endroit où l'application expose la coordonnée d'un point. Quatre scénarios e2e s'en servent — trois comme témoin qu'un point a bougé, et `gps.spec.ts` pour **apprendre les degrés d'un point et y placer le GPS du navigateur**. Le point étant posé en cliquant une carte aux tuiles coupées, le test ne connaît pas la coordonnée à l'avance : il ne peut que la relire.

- [ ] **Step 1 : Écrire le test qui échoue**

Dans `src/trajets/ui/TrajetEditorScreen.test.ts`, remplacer intégralement le test des lignes 320-328 :

```ts
it('alors chaque repère porte la coordonnée de son point, sans jamais la montrer', async () => {
    const element = await attacherLEcran();

    // Elle reste là où le point est posé — c'est ce que le repère marque
    // —, mais elle ne s'affiche plus : ni en clair, ni au survol. Une
    // suite de décimales n'apprend rien à qui la lit.
    expect(marqueurs(element).map((marqueur) => marqueur.dataset.coordonnee)).toEqual([
        '44.826,-0.556',
    ]);
    expect(marqueurs(element).map((marqueur) => marqueur.title)).toEqual(['']);
});
```

- [ ] **Step 2 : Lancer le test pour le voir échouer**

Run: `pnpm test -- src/trajets/ui/TrajetEditorScreen.test.ts`
Expected: FAIL — reçu `[undefined]` au lieu de `['44.826,-0.556']`.

- [ ] **Step 3 : Le repère porte la donnée**

Dans `src/trajets/ui/PointMarker.ts`, remplacer le champ de l'interface :

```ts
    /** Sa coordonnée, portée par le repère sans être montrée. */
    readonly coordonnee: Coordonnee;
```

et ajouter l'import du value object :

```ts
import type { Coordonnee } from '../domain/Coordonnee';
```

Puis, dans `createPointMarker`, remplacer la pose de l'infobulle :

```ts
// La coordonnée exacte se lit au survol du repère, là où le point est posé.
element.title = marker.coordonnee;
```

par :

```ts
// La coordonnée reste sur le repère — c'est ce qu'il marque — mais elle ne
// s'affiche plus : illisible pour un humain, elle occupait un survol que la
// pastille a mieux à employer.
element.dataset.coordonnee = `${String(marker.coordonnee.latitude)},${String(marker.coordonnee.longitude)}`;
```

- [ ] **Step 4 : L'écran passe le value object**

Dans `src/trajets/ui/TrajetEditorScreen.ts`, dans `render()`, remplacer :

```ts
                            coordonnee: pointCoordonneeText(
                                point.coordonnee.latitude,
                                point.coordonnee.longitude,
                            ),
```

par :

```ts
                            coordonnee: point.coordonnee,
```

et retirer la ligne d'import devenue inutile :

```ts
import { pointCoordonneeText } from '../domain/presentation';
```

- [ ] **Step 5 : Supprimer la mise en phrase, devenue sans appelant**

Dans `src/trajets/domain/presentation.ts`, supprimer intégralement le bloc de JSDoc et la fonction `pointCoordonneeText` (lignes 20-27). `trajetContentsText` et `plural` restent.

Dans `src/trajets/domain/presentation.test.ts`, supprimer le `describe('pointCoordonneeText', …)` entier (lignes 30-43) et ramener l'import à :

```ts
import { trajetContentsText } from './presentation';
```

- [ ] **Step 6 : Lancer les tests unitaires pour les voir passer**

Run: `pnpm quality`
Expected: PASS. Si `fallow` signale `pointCoordonneeText` comme export inutilisé, c'est qu'un appelant a été manqué — le chercher plutôt que d'ignorer.

- [ ] **Step 7 : Faire suivre les témoins e2e**

Dans `e2e/helpers.ts`, remplacer `coordonneeDuPoint` (lignes 44-56) :

```ts
/**
 * La coordonnée d'un point, telle que son repère la porte : « 44.826,-0.556 ».
 *
 * Elle ne s'affiche nulle part — ni en clair dans l'écran, ni au survol : une
 * suite de décimales n'apprend rien à qui la lit. Elle reste sur le repère, où
 * le point est posé, et c'est ici que les scénarios la relisent. L'index compte
 * les repères dans l'ordre du document, de haut en bas.
 */
export async function coordonneeDuPoint(page: Page, index = 0): Promise<string> {
    return requireDefined(
        await page.locator('point-marker').nth(index).getAttribute('data-coordonnee'),
        `coordonnée du repère ${String(index + 1)}`,
    );
}
```

Dans `e2e/points.spec.ts` :

```ts
// La coordonnée, elle, reste portée par le repère — sans s'afficher.
await expect(page.locator('point-marker')).toHaveAttribute(
    'data-coordonnee',
    /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/,
);
```

puis, aux deux endroits qui comparent un avant et un après (lignes 126 et 142) :

```ts
await expect(page.locator('point-marker').first()).not.toHaveAttribute('data-coordonnee', before);
```

et pour la saisie manuelle (lignes 305-309) :

```ts
await expect(page.locator('point-marker')).toHaveAttribute('data-coordonnee', '46.5802,0.3404');
```

Dans `e2e/carte-editeur.spec.ts`, la dernière assertion du test de glisser :

```ts
// Assertion qui réessaie : la sauvegarde et le re-rendu sont asynchrones.
await expect(page.locator('point-marker').first()).not.toHaveAttribute('data-coordonnee', before);
```

Dans `e2e/gps.spec.ts`, remplacer le commentaire et l'extraction (lignes 38-47) :

```ts
// La coordonnée exacte du second point est portée par son repère, sans
// être affichée : c'est la seule chose que le test peut relire, le point
// ayant été posé en cliquant une carte dont il ignore le cadrage.
const correspondance = requireDefined(
    /^(-?[\d.]+),(-?[\d.]+)$/.exec(await coordonneeDuPoint(page, 1)),
    'coordonnées portées par le second repère',
);
```

Les degrés ne sont plus arrondis à quatre décimales avant d'être rendus au GPS : le scénario y gagne, il place le navigateur exactement sur le point.

- [ ] **Step 8 : Lancer les tests de bout en bout**

Run: `pnpm test:e2e`
Expected: PASS sur les cinq navigateurs (`chromium`, `webkit`, `firefox`, `iphone`, `android`).

- [ ] **Step 9 : Commit**

```bash
git add src/trajets/ui/PointMarker.ts src/trajets/ui/TrajetEditorScreen.ts src/trajets/ui/TrajetEditorScreen.test.ts src/trajets/domain/presentation.ts src/trajets/domain/presentation.test.ts e2e/helpers.ts e2e/points.spec.ts e2e/gps.spec.ts e2e/carte-editeur.spec.ts
git commit -F - <<'EOF'
Garde la coordonnée d'un point sans plus la montrer

« Coordonnée : 44.8260, -0.5560 » n'apprenait rien à qui survolait un
repère, et occupait le survol que la pastille emploie mieux — elle a
maintenant une action à annoncer.

La donnée reste pourtant : c'est le seul endroit d'où quatre scénarios
peuvent relire où un point se trouve, et d'où celui du GPS tire les degrés
qu'il envoie au navigateur. Elle y gagne même en précision, n'étant plus
arrondie à quatre décimales pour se faire lire.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4 : Les témoins du geste, et la documentation d'accord

**Files:**

- Modify: `src/trajets/ui/TrajetEditorScreen.ts` (le garde de placement, issu de la revue de la Task 2)
- Modify: `src/trajets/ui/TrajetEditorScreen.test.ts` (son témoin)
- Modify: `e2e/points.spec.ts` (trois scénarios ajoutés)
- Modify: `docs/EXIGENCES.md:40, 44` (GR-10 réécrite, GR-15 ajoutée)
- Modify: `README.md:19-25`

**Interfaces:**

- Consumes: `ecartAuCentreDeLaCarte(page, numero): Promise<number>` de `e2e/helpers.ts` — « distance en pixels entre le marqueur numéroté demandé et le centre de la carte intégrée ; zéro quand la carte est calée sur ce point ». Le helper est **déjà écrit** et sans appelant depuis la suppression de `centerOn` : ne pas le réécrire, l'importer. `ouvrirUnTrajetAvecUnePage`, `ajouterUnPoint`, `clicDroitSurLImage`, `choisirUneCoordonneePourUnPoint`, `pngFile`, `requireDefined`, tous exportés par le même module.
- Produces: rien que d'autres tâches consomment.

**Deux ajouts issus de la revue de la Task 2**, traités en tête parce qu'ils touchent le code :

> **(i) Le garde de placement est aujourd'hui du CSS seul.** `pointer-events: none` retire le survol, pas le focus : au clavier, `Tab` puis `Entrée` sur une pastille déclenche le geste pendant qu'on vise une hauteur, et sur petit écran la carte vient couvrir l'image qu'on essayait de cliquer. Souris et clavier ne disent pas la même chose.
>
> **(ii) Cette règle CSS n'a aucun témoin.** jsdom n'applique pas de feuille de style, et aucun scénario e2e ne pose de point à la hauteur d'une pastille existante. Or ce dépôt tient qu'« un garde sans témoin n'est pas protégé » ([AGENTS.md](../../../AGENTS.md#conventions)).

- [ ] **Step 1 : Écrire le témoin du garde de placement**

Dans `src/trajets/ui/TrajetEditorScreen.test.ts`, ajouter au `describe('Étant donné un petit écran où la carte est repliée', …)` créé par la Task 2 :

```ts
it('quand un placement est en cours, alors la pastille n’emmène nulle part', async () => {
    const element = await attacherLEcran();
    // La feuille de style rend la pastille transparente aux clics tant
    // qu'on vise une hauteur ; le clavier, lui, ne connaît pas
    // `pointer-events`. Les deux doivent dire la même chose.
    cliquerLAction(element, 'Ajouter un point');

    cliquerLaPastille(element, 1);

    expect(carteDesPoints.centrages()).toEqual([]);
    expect(element.classList.contains('carte-ouverte')).toBe(false);
});
```

- [ ] **Step 2 : Le voir échouer**

Run: `pnpm test -- src/trajets/ui/TrajetEditorScreen.test.ts`
Expected: FAIL — `centrages()` contient une coordonnée, et `carte-ouverte` est posée.

- [ ] **Step 3 : Poser le garde d'état**

Dans `src/trajets/ui/TrajetEditorScreen.ts`, en tête de `showPointOnCarte`, après la garde sur le trajet :

```ts
// La feuille de style rend déjà la pastille transparente aux clics
// pendant le placement ; le clavier ne connaît pas `pointer-events`, et
// partir à la carte au milieu d'une visée cacherait l'image qu'on
// cherchait à cliquer. L'état tranche, pas seulement le CSS.
if (placementMode !== null) {
    return;
}
```

- [ ] **Step 4 : Le voir passer**

Run: `pnpm test -- src/trajets/ui/TrajetEditorScreen.test.ts`
Expected: PASS.

- [ ] **Step 5 : Écrire les trois scénarios**

Dans `e2e/points.spec.ts`, ajouter `ecartAuCentreDeLaCarte` à la liste d'import du module de helpers (elle n'est pas triée : le placer où l'on veut), puis ajouter les deux tests à la fin du `describe` de fichier :

```ts
test('Étant donné un point posé sur le schéma, quand je clique sa pastille, alors la carte se cale sur lui', async ({
    page,
}) => {
    await ouvrirUnTrajetAvecUnePage(page);
    // Deux points, et c'est essentiel : avec un seul, la carte se serait
    // déjà cadrée dessus toute seule et le geste ne prouverait rien. À deux,
    // le cadrage d'ensemble les met de part et d'autre du centre.
    await ajouterUnPoint(page, 0.8, 0);
    await ajouterUnPoint(page, 0.2, 150);
    // Le document se lit de bas en haut : le point le plus bas sur la page
    // ouvre le voyage, c'est donc lui le numéro 1.
    await expect.poll(() => ecartAuCentreDeLaCarte(page, '1')).toBeGreaterThan(10);

    await page.getByRole('button', { name: 'Voir le point 1 sur la carte' }).click();

    // « Zéro quand la carte est calée sur ce point » : quelques pixels de
    // tolérance pour l'arrondi au pixel des marqueurs Leaflet. La pastille
    // en fait 26 : à 4 px, elle couvre toujours le centre.
    await expect.poll(() => ecartAuCentreDeLaCarte(page, '1')).toBeLessThanOrEqual(4);
});

test('Étant donné un petit écran où la carte est repliée, quand je clique la pastille d’un point, alors la carte vient par-dessus le schéma', async ({
    page,
}) => {
    test.skip(
        requireDefined(page.viewportSize(), 'viewport').width >= 900,
        'Au-dessus de 900 px la carte est déjà à côté de la pile : rien à mettre par-dessus.',
    );
    await ouvrirUnTrajetAvecUnePage(page);
    // Deux pages de plus : sans un document plus haut que l'écran, la carte
    // resterait visible et le geste ne prouverait rien.
    await page
        .locator('#input-images')
        .setInputFiles([pngFile('page-2.png'), pngFile('page-3.png')]);
    await expect(page.locator('.image-name')).toHaveCount(3);
    // Le point se pose sur la page du bas — la plus loin de la carte, qui
    // est tout en haut : le repère est à l'écran, la carte non.
    await clicDroitSurLImage(page, 0.5, 2);
    await choisirUneCoordonneePourUnPoint(page);
    await expect(page.locator('point-marker')).toHaveCount(1);
    await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
    });
    const carte = page.locator('#carte-points');
    await expect(carte).not.toBeInViewport();

    await page.getByRole('button', { name: 'Voir le point 1 sur la carte' }).click();

    // Par-dessus le schéma, quel que soit le défilement. Le centrage, lui,
    // est prouvé par le scénario précédent : avec un seul point, la carte
    // s'était déjà cadrée dessus et l'assertion ne dirait rien.
    await expect(carte).toBeInViewport({ ratio: 0.9 });
});

test('Étant donné un placement en cours, quand je vise la hauteur d’un point déjà posé, alors un point s’y pose au lieu de partir à la carte', async ({
    page,
}) => {
    await ouvrirUnTrajetAvecUnePage(page);
    await ajouterUnPoint(page, 0.5, 0);
    const hauteur = await hauteurDuRepere(page);

    // Le repère du point 1 traverse la page à cette hauteur : c'est lui qu'on
    // vise, et le mode placement doit le laisser passer.
    await page.locator('.action-bar').getByRole('button', { name: 'Ajouter un point' }).click();
    await cliquerSurLImage(page, 0.5);
    await choisirUneCoordonneePourUnPoint(page, 150);

    // Un second point est né à la même hauteur — la carte n'a pas été
    // convoquée à sa place.
    await expect(page.locator('point-marker')).toHaveCount(2);
    await expect.poll(() => hauteurDuRepere(page)).toBe(hauteur);
});
```

Ce troisième scénario vise le **trait** du repère, pas la pastille : `cliquerSurLImage` clique au centre horizontal de la zone, et la pastille est calée à gauche (`left: 0.25rem`). Il prouve donc que le repère ne vole pas le placement à sa hauteur ; le témoin direct de la pastille, lui, est le test unitaire des Steps 1-4, qui passe par l'état plutôt que par le CSS.

- [ ] **Step 6 : Lancer les scénarios pour les voir passer**

Run: `pnpm test:e2e -- points.spec.ts`
Expected: PASS sur les cinq navigateurs. Le second scénario est marqué `skipped` sur `chromium`, `webkit` et `firefox`, qui tournent à 1280 px.

- [ ] **Step 7 : Mettre les exigences d'accord**

Dans `docs/EXIGENCES.md`, réécrire la ligne GR-10 (`presentation.test.ts` n'en est plus un témoin) :

```
| GR-10 | La coordonnée d'un point est portée par son repère, sans jamais s'afficher : ni en clair, ni au survol | `U TrajetEditorScreen.test.ts`, `E e2e/points.spec.ts`                                    |
```

et ajouter GR-15 après GR-14 :

```
| GR-15 | La pastille d'un point amène la carte sur lui ; sous 900 px, elle la met par-dessus le schéma      | `U TrajetEditorScreen.test.ts`, `U LeafletCarteDesPoints.test.ts`, `E e2e/points.spec.ts` |
```

- [ ] **Step 8 : Mettre le README d'accord**

Dans `README.md`, remplacer la puce « Deux vues, et rien entre les deux » (lignes 19-25) :

```markdown
- **Deux vues, et rien entre les deux** : les points vivent là où ils sont — sur
  le schéma (pastille rouge numérotée et ses trois actions) et sur la carte (les
  mêmes numéros, dans le monde). Pas de liste à part : elle ne disait rien que
  ces deux-là ne montrent mieux. Et l'on passe de l'une à l'autre par le point
  lui-même : **désigner un point sur la carte amène son repère à l'écran**,
  **cliquer le numéro d'un repère cale la carte sur ce point**. Chaque page porte
  son numéro, compté depuis le haut de la pile, dans un coin de l'image.
```

- [ ] **Step 9 : Vérifier l'ensemble**

Run: `pnpm quality && pnpm test:e2e`
Expected: PASS partout.

- [ ] **Step 10 : Commit**

```bash
git add src/trajets/ui/TrajetEditorScreen.ts src/trajets/ui/TrajetEditorScreen.test.ts e2e/points.spec.ts docs/EXIGENCES.md README.md
git commit -F - <<'EOF'
Prouve l'aller-retour entre le repère et la carte sur cinq navigateurs

Le geste inverse était déjà couvert ; celui-ci l'est par la mesure qui lui
correspond — l'écart entre le marqueur et le centre de la carte —, dont le
helper attendait un appelant depuis qu'on avait retiré le centrage.

Le placement, lui, tranche désormais sur l'état et non plus seulement sur
`pointer-events` : le clavier ignore le CSS, et partir à la carte au milieu
d'une visée cachait l'image qu'on cherchait à cliquer.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Une fois les quatre tâches faites

`main` n'avance qu'en avant : rebaser la branche sur `main` si elle a pris du retard, puis `git merge --ff-only`. Le geste sur Android reste à confirmer sur un vrai appareil — le [risque assumé](2026-08-06-supprime-la-liste-des-points-design.md) de la conception précédente porte sur les marqueurs Leaflet, pas sur un `<button>` du document, mais c'est le même écran tactile qui tranchera.

Deux vérifications valent d'être faites à la main, qu'aucun test ne porte :

- **Le disque n'a pas bougé** : la pastille du schéma et celle de la carte doivent rester identiques (GR-13 le mesure en e2e, mais l'œil voit plus vite un `padding` oublié).
- **Le mode placement** : armer « Ajouter un point », viser la hauteur d'un point existant, et vérifier que le clic pose bien un point au lieu de partir à la carte.
