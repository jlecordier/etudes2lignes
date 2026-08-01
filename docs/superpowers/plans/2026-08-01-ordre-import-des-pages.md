# Ordre d'import des pages — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Les pages sélectionnées dans l'explorateur se posent dans la pile de haut en bas, dans l'ordre de la sélection, et un second lot se pose sous le premier.

**Architecture:** La règle est une règle métier, elle vit donc dans l'agrégat `Trajet` : une nouvelle méthode d'intention `addImagesInReadingOrder(files)` insère chaque page **en tête** du voyage, dans l'ordre reçu. `_images` reste stocké en ordre du voyage, `imagesInReadingOrder()` reste son inverse, et l'écran d'édition se contente de transmettre la sélection. Aucune migration : les trajets déjà enregistrés gardent leur ordre.

**Tech Stack:** TypeScript · vanilla DOM · Vitest (unitaire) · Playwright (e2e) · pnpm.

Conception validée : [`../specs/2026-08-01-ordre-import-des-pages-design.md`](../specs/2026-08-01-ordre-import-des-pages-design.md).

## Global Constraints

- Architecture hexagonale : `domain` ne dépend de rien ; `ui` dépend du domaine. La règle d'ordre appartient au `domain`, jamais à l'écran.
- Nommage mot à mot (ADR 0007) : un mot reste français s'il est au [Lexique](../../GLOSSAIRE.md#lexique), passe à l'anglais sinon. `image`, `page`, `voyage` sont français ; `file`, `start`, `end`, `place`, `add`, `reading order` sont anglais. L'ordre des mots suit l'anglais (`voyage-start`, comme `suivi-status`).
- Prose en français : commentaires, JSDoc, titres de tests `Étant donné / Quand / Alors`, pas de scénario e2e, messages de commit.
- Interdits : `!` (non-null assertion) et `as` de forme. Accès indexé → `requireElementAt`.
- Tests par l'état : pas de `vi.fn`, pas de `toHaveBeenCalled`. Assertions complètes (`toEqual`/`toHaveText` exacts), jamais `toContain`.
- Prettier : 4 espaces, points-virgules. ESLint `strictTypeChecked` doit rester à 0.
- Ne jamais désactiver une règle de lint pour esquiver un constat.
- Branche de travail : `ordre-import-des-pages` (déjà créée, la spec y est commitée). Historique linéaire, `main` fast-forwardé à la fin.
- Le hook pre-commit enchaîne `fallow fix --yes` → `lint-staged` → `typecheck` → `test`. Un commit lent est normal.

---

## Structure des fichiers

| Fichier                                | Rôle dans ce changement                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/trajets/domain/Trajet.ts`         | **Modifié** — type `ImageFile`, méthode `addImagesInReadingOrder`, `admitImage` paramétré   |
| `src/trajets/domain/Trajet.test.ts`    | **Modifié** — quatre cas BDD pour la nouvelle règle                                         |
| `src/trajets/ui/TrajetEditorScreen.ts` | **Modifié** — `importFiles` appelle la nouvelle méthode ; `preparePages` typé `ImageFile[]` |
| `e2e/editeur.spec.ts`                  | **Modifié** — l'ordre attendu de la pile s'inverse (3 tests)                                |
| `e2e/points.spec.ts`                   | **Modifié** — le second lot se lit sous le premier (1 test)                                 |
| `README.md`                            | **Modifié** — § Préparer un trajet, étape 2                                                 |
| `docs/EXIGENCES.md`                    | **Modifié** — exigence `TR-7`                                                               |
| `docs/GLOSSAIRE.md`                    | **Modifié** — entrée « Ordre de lecture »                                                   |

Ne **pas** toucher : `pointsInOrdreDuVoyage`, `moveImageForwardInVoyage` / `moveImageBackwardInVoyage`, `src/suivi/**`, `IdbTrajetRepository`, `trajetJson` (l'import JSON restitue un ordre déjà enregistré et doit continuer d'utiliser `addImage`).

---

### Task 1 : la règle dans l'agrégat

**Files:**

- Modify: `src/trajets/domain/Trajet.ts` (type exporté après `ImageDeTrajet` ~:15 ; `addImage` :90-94 ; `admitImage` :185-194 ; `rehydrate` :55-57)
- Test: `src/trajets/domain/Trajet.test.ts` (helper `imageFile` :12-19 ; nouveau `describe` après celui qui finit :68)

**Interfaces:**

- Consumes: rien (premier lot).
- Produces:
    - `export type ImageFile = Omit<ImageDeTrajet, 'id'>` — `{ readonly nom: string; readonly blob: Blob; readonly largeur: number; readonly hauteur: number }`
    - `Trajet.addImagesInReadingOrder(files: readonly ImageFile[]): void`
    - `Trajet.addImage(file: ImageFile): ImageId` — signature ré-exprimée avec le type nommé, sémantique inchangée (ajout en fin de voyage).

- [ ] **Step 1 : écrire les tests qui échouent**

Dans `src/trajets/domain/Trajet.test.ts`, remplacer l'import ligne 6 pour prendre aussi le type, et retyper le helper :

```ts
import { Trajet, type ImageFile } from './Trajet';
```

```ts
function imageFile(nom = 'page-1.jpg'): ImageFile {
    return { nom, blob: new Blob(['fausse image']), largeur: 2481, hauteur: 3508 };
}
```

Puis insérer ce `describe` juste après celui qui se termine ligne 68 (« quand j'ajoute des images ») :

```ts
describe('Étant donné un trajet vierge, quand j’importe un lot de pages', () => {
    it('alors la pile les lit dans l’ordre du lot, et la dernière ouvre le voyage', () => {
        const trajet = newTrajet();

        trajet.addImagesInReadingOrder([
            imageFile('page-1.jpg'),
            imageFile('page-2.jpg'),
            imageFile('page-3.jpg'),
        ]);

        expect(imageNoms(trajet.imagesInReadingOrder())).toEqual([
            'page-1.jpg',
            'page-2.jpg',
            'page-3.jpg',
        ]);
        expect(imageNoms(trajet.images)).toEqual(['page-3.jpg', 'page-2.jpg', 'page-1.jpg']);
    });

    it('alors une page aux dimensions invalides est refusée', () => {
        const trajet = newTrajet();

        expect(() => trajet.addImagesInReadingOrder([{ ...imageFile(), largeur: 0 }])).toThrow(
            'Dimensions d’image invalides',
        );
    });
});

describe('Étant donné un trajet qui a déjà des pages, quand j’importe un second lot', () => {
    it('alors il se lit sous les pages existantes, et sa dernière page ouvre le voyage', () => {
        const trajet = newTrajet();
        trajet.addImagesInReadingOrder([imageFile('page-1.jpg'), imageFile('page-2.jpg')]);

        trajet.addImagesInReadingOrder([imageFile('page-3.jpg'), imageFile('page-4.jpg')]);

        expect(imageNoms(trajet.imagesInReadingOrder())).toEqual([
            'page-1.jpg',
            'page-2.jpg',
            'page-3.jpg',
            'page-4.jpg',
        ]);
        expect(imageNoms(trajet.images)).toEqual([
            'page-4.jpg',
            'page-3.jpg',
            'page-2.jpg',
            'page-1.jpg',
        ]);
    });

    it('alors un lot vide laisse le trajet inchangé', () => {
        const trajet = newTrajet();
        trajet.addImagesInReadingOrder([imageFile('page-1.jpg')]);

        trajet.addImagesInReadingOrder([]);

        expect(imageNoms(trajet.images)).toEqual(['page-1.jpg']);
    });
});
```

Les deux faces sont assérées à chaque fois (`imagesInReadingOrder()` **et** `images`) : n'en vérifier qu'une laisserait passer une inversion compensée ailleurs.

- [ ] **Step 2 : lancer les tests pour les voir échouer**

Run: `pnpm exec vitest run src/trajets/domain/Trajet.test.ts`
Expected: échec de compilation TypeScript / `trajet.addImagesInReadingOrder is not a function`, et `Module './Trajet' has no exported member 'ImageFile'`.

- [ ] **Step 3 : exporter le type `ImageFile`**

Dans `src/trajets/domain/Trajet.ts`, juste après l'interface `ImageDeTrajet` :

```ts
/** Une page telle que l'utilisateur la fournit : l'agrégat lui forge son identifiant. */
export type ImageFile = Omit<ImageDeTrajet, 'id'>;
```

Et ré-exprimer `addImage` avec (corps inchangé) :

```ts
    addImage(file: ImageFile): ImageId {
        const image: ImageDeTrajet = { id: newImageId(), ...file };
        this.admitImage(image, 'voyage-end');
        return image.id;
    }
```

- [ ] **Step 4 : donner deux extrémités à la porte d'admission**

Remplacer `admitImage` (fin de classe) par :

```ts
    /**
     * Seule porte d'entrée d'une image dans l'agrégat : l'ajout par l'utilisateur,
     * l'import par lot et la réhydratation depuis la persistance passent par cette
     * garde. Seule l'extrémité d'insertion les distingue.
     */
    private admitImage(image: ImageDeTrajet, place: 'voyage-start' | 'voyage-end'): void {
        if (!isDimension(image.largeur) || !isDimension(image.hauteur)) {
            throw new Error(`Dimensions d’image invalides : ${image.largeur}×${image.hauteur}`);
        }
        if (place === 'voyage-start') {
            this._images.unshift(image);
            return;
        }
        this._images.push(image);
    }
```

Et mettre à jour l'appel de `rehydrate` (`:56`) :

```ts
for (const image of donnees.images) {
    trajet.admitImage(image, 'voyage-end');
}
```

- [ ] **Step 5 : ajouter la méthode d'intention**

Juste après `addImage` :

```ts
    /**
     * Ajoute des pages sous celles déjà présentes, dans l'ordre où le document se
     * lit — celui de l'explorateur, première page en haut. Le document se lisant
     * de bas en haut, la dernière page fournie est celle qui se lit le plus bas :
     * c'est donc elle qui ouvre le voyage.
     *
     * Pas de `reverse` ici : insérer chaque page en tête du voyage, dans l'ordre
     * reçu, *est* l'inversion.
     */
    addImagesInReadingOrder(files: readonly ImageFile[]): void {
        for (const file of files) {
            this.admitImage({ id: newImageId(), ...file }, 'voyage-start');
        }
    }
```

- [ ] **Step 6 : lancer les tests pour les voir passer**

Run: `pnpm exec vitest run src/trajets/domain/Trajet.test.ts`
Expected: PASS — les 4 nouveaux cas plus tous les anciens (aucun ne doit changer de résultat : ils passent par `addImage`, dont la sémantique est intacte).

- [ ] **Step 7 : vérifier que rien d'autre n'a bougé**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: typecheck et lint à 0, 307 tests au vert (303 avant + 4).

- [ ] **Step 8 : commit**

```bash
git add src/trajets/domain/Trajet.ts src/trajets/domain/Trajet.test.ts
git commit -m "$(cat <<'MSG'
Apprend à l'agrégat à recevoir un lot de pages en ordre de lecture

L'ordre dans lequel l'explorateur rend une sélection est une règle de lecture du
document, donc du métier : elle appartient à l'agrégat, pas à l'écran. La porte
d'admission gagne son extrémité d'insertion plutôt qu'un second chemin — la
garde des dimensions couvre ainsi le nouveau cas sans être recopiée.

Insérer en tête du voyage dans l'ordre reçu remplace le renversement du lot : il
n'y a plus d'inversion à écrire, donc plus d'inversion à oublier.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 2 : brancher l'écran et retourner les attentes e2e

**Files:**

- Modify: `src/trajets/ui/TrajetEditorScreen.ts` (import de types :10 ; `importFiles` :172-190 ; `preparePages` :192-201)
- Modify: `e2e/editeur.spec.ts` (helper `importerDeuxPages` :9-16 ; test « je monte visuellement celle du bas » :29-38 ; test de numérotation :40-64)
- Modify: `e2e/points.spec.ts` (:155-164)

**Interfaces:**

- Consumes: `ImageFile` et `Trajet.addImagesInReadingOrder(files)` de la Task 1.
- Produces: rien pour la suite — c'est le changement visible.

- [ ] **Step 1 : retourner les attentes e2e (les tests qui échouent)**

Dans `e2e/editeur.spec.ts`, le helper :

```ts
async function importerDeuxPages(page: Page): Promise<void> {
    await page
        .locator('#input-images')
        .setInputFiles([pngFile('page-1.png'), pngFile('page-2.png')]);
    // Les pages s'importent de haut en bas, dans l'ordre de l'explorateur. Le
    // document se lisant de bas en haut, la dernière ouvre donc le voyage.
    await expect(page.locator('.image-name')).toHaveText(['page-1.png', 'page-2.png']);
}
```

Le test « quand je monte visuellement celle du bas » : c'est page-2 qui est en bas désormais.

```ts
await page.getByRole('button', { name: 'Monter page-2.png' }).click();

await expect(page.locator('.image-name')).toHaveText(['page-2.png', 'page-1.png']);
```

Le test de numérotation : les index visuels ne bougent pas (0 = haut = fin du voyage, 1 = bas = début), seuls les noms de page s'échangent.

```ts
// La liste suit l'ordre du voyage…
await expect(page.locator('.point-description')).toHaveText([
    /^Point 1 — page-2\.png à \d+ % — -?\d+\.\d{4}, -?\d+\.\d{4}$/,
    /^Point 2 — page-1\.png à \d+ % — -?\d+\.\d{4}, -?\d+\.\d{4}$/,
]);
```

L'assertion suivante, `.point-number` → `['2', '1']`, **reste telle quelle** : c'est elle qui prouve que la règle bas→haut n'a pas bougé. Le titre du premier test (« la première du voyage est en bas de la pile ») et le test de suppression (« Supprimer page-1.png » → reste `['page-2.png']`) restent vrais tels quels.

Dans `e2e/points.spec.ts` (:158-164), le second lot se pose dessous :

```ts
// Le lot importé se pose sous les pages déjà présentes, dans l'ordre de
// l'explorateur : le document se lit d'une traite, page-1 tout en haut.
await expect(page.locator('.image-name')).toHaveText(['page-1.png', 'page-2.png', 'page-3.png']);
```

- [ ] **Step 2 : lancer les e2e pour les voir échouer**

Run: `pnpm test:e2e e2e/editeur.spec.ts --project=chromium`
Expected: FAIL — `.image-name` rend `['page-2.png', 'page-1.png']` là où le test attend l'inverse (Playwright construit et sert lui-même l'app, comptez ~1 min au premier lancement).

- [ ] **Step 3 : brancher l'écran**

Dans `src/trajets/ui/TrajetEditorScreen.ts`, ajouter `ImageFile` à l'import de types (:10) :

```ts
import type { ImageDeTrajet, ImageFile, Point, Trajet } from '../domain/Trajet';
```

Dans `importFiles`, remplacer la boucle par l'appel unique :

```ts
const pages = await preparePages(Array.from(files));
await applyToTrajetAndSave((currentTrajet) => {
    currentTrajet.addImagesInReadingOrder(pages);
});
```

Et nommer la forme dans `preparePages` :

```ts
async function preparePages(files: readonly File[]): Promise<ImageFile[]> {
    const pages: ImageFile[] = [];
    for (const file of files) {
        const { largeur, hauteur } = await imageDimensions(file);
        pages.push({ nom: file.name, blob: file, largeur, hauteur });
    }
    return pages;
}
```

Le commentaire au-dessus de `importFiles` (« Toutes les pages sont préparées **avant** de toucher à l'agrégat ») reste vrai et ne change pas.

- [ ] **Step 4 : lancer les e2e pour les voir passer**

Run: `pnpm test:e2e e2e/editeur.spec.ts e2e/points.spec.ts --project=chromium`
Expected: PASS.

- [ ] **Step 5 : la suite complète, tous navigateurs**

Run: `pnpm test:e2e`
Expected: PASS sur les 5 profils (chromium, webkit, firefox, iphone, android).

- [ ] **Step 6 : commit**

```bash
git add src/trajets/ui/TrajetEditorScreen.ts e2e/editeur.spec.ts e2e/points.spec.ts
git commit -m "$(cat <<'MSG'
Lit la sélection de l'explorateur comme un ordre de lecture

Sélectionner page-1 … page-6 affichait page-6 tout en haut : l'écran passait la
sélection en ordre du voyage. Il la passe désormais telle quelle à l'agrégat,
qui l'interprète comme l'ordre du document — première page en haut, lot suivant
dessous.

Les attentes e2e s'inversent en conséquence, sauf une : les numéros lus à
l'écran restent « 2 » puis « 1 » de haut en bas. C'est voulu, et c'est la preuve
que la lecture bas→haut du document n'a pas bougé.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 3 : la documentation

**Files:**

- Modify: `README.md` (:57-60)
- Modify: `docs/EXIGENCES.md` (tableau Trajets, après la ligne `TR-6` :21)
- Modify: `docs/GLOSSAIRE.md` (tableau Métier, après la ligne « Ordre du voyage » :24)

**Interfaces:**

- Consumes: le comportement livré par les Tasks 1 et 2.
- Produces: rien.

- [ ] **Step 1 : README — l'étape « Préparer un trajet »**

Remplacer l'étape 2 (:57-60) par :

```markdown
2. Créer le trajet, importer les images **dans l'ordre du document** : la
   première sélectionnée se place en haut de la pile, les suivantes dessous, et
   un second lot se pose sous le premier. Le document se lisant de bas en haut,
   c'est la **dernière** page qui ouvre le voyage, et tout le trajet se remonte
   d'un seul tenant, sans rupture aux changements de page. Si votre livret
   commence par sa page 1, sélectionnez les fichiers en ordre inverse — ou
   réordonnez ensuite avec ▲/▼.
```

- [ ] **Step 2 : EXIGENCES — la ligne TR-7**

Ajouter sous `TR-6` dans le tableau « Trajets » :

```markdown
| TR-7 | Un lot importé se lit sous les pages existantes, dans l'ordre de l'explorateur | `U Trajet.test.ts`, `E e2e/editeur.spec.ts` |
```

- [ ] **Step 3 : GLOSSAIRE — l'entrée « Ordre de lecture »**

Ajouter sous « Ordre du voyage » dans le tableau « Métier » :

```markdown
| **Ordre de lecture** | Ordre d'affichage de la pile : l'inverse de l'ordre du voyage, les pages se lisant de bas en haut. C'est aussi l'ordre dans lequel l'import lit la sélection de l'explorateur. | `Trajet.imagesInReadingOrder()`, `Trajet.addImagesInReadingOrder()` |
```

- [ ] **Step 4 : formater et relire**

Run: `pnpm exec prettier --write README.md docs/EXIGENCES.md docs/GLOSSAIRE.md`
Expected: les colonnes des tableaux se réalignent. Relire le diff : aucune autre ligne ne doit bouger.

- [ ] **Step 5 : commit**

```bash
git add README.md docs/EXIGENCES.md docs/GLOSSAIRE.md
git commit -m "$(cat <<'MSG'
Aligne la documentation sur le nouveau sens d'import

Le README disait d'importer « dans l'ordre du voyage » : c'est précisément ce
qui vient de changer, et le laisser en l'état ferait construire les trajets à
l'envers. La contrepartie y est dite plutôt que laissée à découvrir — la
dernière page sélectionnée ouvre le voyage.

Le glossaire nommait l'ordre du voyage mais pas l'ordre de lecture, alors que le
code le nomme depuis la refonte. Il lui manquait son entrée.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 4 : vérification et intégration

**Files:** aucun changement de code attendu. Si une vérification échoue, le correctif se fait dans la task concernée.

**Interfaces:**

- Consumes: les Tasks 1 à 3.
- Produces: `main` fast-forwardé.

- [ ] **Step 1 : le gate complet**

Run: `pnpm quality`
Expected: typecheck 0, lint 0, 307 tests verts, `fallow audit` sans nouveau constat.

- [ ] **Step 2 : la suite e2e complète**

Run: `pnpm test:e2e`
Expected: PASS sur les 5 profils.

- [ ] **Step 3 : contrôle visuel au MCP Playwright**

`pnpm dev`, puis via le MCP Playwright : créer un trajet, importer les six fichiers de `pmpbxenjpeg/` en une sélection, et lire la pile. Attendu de haut en bas : `PMP-BX (ERTMS)_page-0001.jpg` … `_page-0006.jpg`. Une capture en 1280 de large suffit — la mise en page ne change pas, seul l'ordre change.

- [ ] **Step 4 : tests de mutation sur le module touché**

Run: `pnpm exec stryker run --mutate src/trajets/domain/Trajet.ts`
Expected: lire les survivants, pas le score. Le `unshift`/`push` de `admitImage` et la comparaison `place === 'voyage-start'` doivent être tués par les nouveaux cas ; un survivant ailleurs qui préexistait n'est pas du ressort de ce lot. Ne jamais ajouter d'assertion pour faire taire un survivant.

- [ ] **Step 5 : fast-forward de `main`**

À faire **après** accord de Jean sur le résultat visuel.

```bash
git switch main
git merge --ff-only ordre-import-des-pages
git log --oneline -5
```

Expected: quatre commits en ligne droite (spec, domaine, écran, docs).

---

## Auto-relecture du plan

**Couverture de la spec** — Décision et ses deux conséquences → Task 1 (tests 1 et 2 du second `describe`) et Task 2. Type `ImageFile` → Task 1 Step 3. `addImagesInReadingOrder` → Task 1 Step 5. `addImage` conservé pour `trajetJson` → Task 1 Step 3 (signature ré-exprimée, sémantique intacte) et « ne pas toucher » de la structure des fichiers. Écran → Task 2 Step 3. Les quatre cas de test unitaires → Task 1 Step 1. Les quatre points e2e `editeur` + le point `points` → Task 2 Step 1. Les trois documents → Task 3. Les trois vérifications → Task 4. Pas de trou.

**Placeholders** — aucun « TBD », aucune étape sans son code, aucun « comme la tâche N ».

**Cohérence des types** — `ImageFile` est défini en Task 1 Step 3 et consommé sous ce nom exact en Task 1 Step 1 (helper de test), Task 1 Step 3 (`addImage`), Task 1 Step 5 (`addImagesInReadingOrder`) et Task 2 Step 3 (import + `preparePages`). `admitImage(image, place)` a la même signature à ses trois appels (`rehydrate`, `addImage`, `addImagesInReadingOrder`). `'voyage-start'` / `'voyage-end'` s'écrivent partout à l'identique.
</content>
