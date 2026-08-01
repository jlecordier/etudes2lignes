# Ordre d'import des pages — conception

Les pages sélectionnées dans l'explorateur doivent se poser dans la pile **de
haut en bas**, dans l'ordre de la sélection, et non de bas en haut comme
aujourd'hui.

## Constat

Trois ordres coexistent, et il en manquait un quatrième — celui de l'import.

| Ordre                | Où il vit                                         | Sens                                    |
| -------------------- | ------------------------------------------------- | --------------------------------------- |
| **Ordre du voyage**  | `Trajet._images`, tel quel — c'est l'ordre stocké | première image = début du voyage        |
| **Ordre de lecture** | `Trajet.imagesInReadingOrder()` = l'inverse       | première page du voyage tout **en bas** |
| **Ordre des points** | `Trajet.pointsInOrdreDuVoyage()`, calculé         | image ASC, puis fraction DESC           |

L'ordre de lecture découle du métier : un schéma de ligne se lit de bas en haut
(PK croissants vers le haut), donc empiler la première page du voyage tout en
bas fait du trajet entier une montée d'un seul tenant, sans rupture aux
changements de page.

`TrajetEditorScreen.importFiles` (`src/trajets/ui/TrajetEditorScreen.ts:172`)
enfile la sélection telle quelle dans `addImage`, qui empile en fin de voyage.
La sélection est donc interprétée **en ordre du voyage** : sélectionner
`page-1 … page-6` affiche `page-6 … page-1` de haut en bas. C'est ce que le
présent document corrige : la sélection sera interprétée **en ordre de lecture**.

## Décision

**La sélection de l'explorateur est un ordre de lecture, et un lot importé
prolonge le document vers le bas.**

Sélectionner `page-1 … page-6` dans un trajet vierge donne :

```
ÉCRAN (haut → bas)      VOYAGE
┌──────────────┐
│  page-1      │  ← fin du voyage   (dernier point)
│  page-2      │        ▲
│  …           │        │  défilement automatique
│  page-5      │        │
│  page-6      │  ← début du voyage (point 1)
└──────────────┘

Trajet._images = [page-6, page-5, page-4, page-3, page-2, page-1]
```

Un second lot (`page-7 … page-12`) se pose **sous** les pages existantes : la
pile lit alors `page-1 … page-12` d'une traite, et le voyage part de `page-12`.

Deux conséquences assumées :

- La règle « le document se lit de bas en haut » est **intacte**. Les numéros de
  points croissent toujours en remontant la pile, le défilement automatique
  monte toujours, `pointsInOrdreDuVoyage()` trie toujours par fraction
  décroissante. Seule l'interprétation de la sélection change.
- **La dernière page sélectionnée ouvre le voyage.** Pour un livret dont la
  page 1 est le départ de la ligne, il faut sélectionner les fichiers en ordre
  inverse dans l'explorateur, ou réordonner ensuite avec ▲/▼.

Les trajets déjà enregistrés ne bougent pas : l'ordre stocké reste l'ordre du
voyage, aucune migration.

## Alternatives écartées

**Inverser dans l'écran** (`[...pages].reverse()` dans `importFiles`). Une
ligne, mais elle pose le lot au-dessus de l'existant au lieu de dessous, et
surtout elle réinstalle dans un adapter une règle de lecture que le lot 05 de la
refonte venait d'en sortir (les deux `.reverse()` recopiés dans les écrans,
remontés dans `imagesInReadingOrder()`).

**Retourner le sens de stockage** — `_images` en ordre de lecture, ordre du
voyage calculé. Cohérent, mais l'ordre stocké est persisté : `imageIds` de
`IdbTrajetRepository`, index d'image du JSON v1. Migration de données pour un
gain de symétrie : hors de proportion.

## Conception

### Domaine — `src/trajets/domain/Trajet.ts`

L'agrégat sait lire l'ordre de lecture ; il lui manque le pendant en écriture.

```ts
/** Une page telle que l'utilisateur la fournit : l'agrégat lui forge son identifiant. */
export type ImageFile = Omit<ImageDeTrajet, 'id'>;
```

```ts
/**
 * Ajoute des pages sous celles déjà présentes, dans l'ordre où le document se
 * lit — celui de l'explorateur, première page en haut. Le document se lisant de
 * bas en haut, la dernière page fournie est celle qui se lit le plus bas : c'est
 * donc elle qui ouvre le voyage.
 */
addImagesInReadingOrder(files: readonly ImageFile[]): void
```

L'implémentation n'a pas besoin de `.reverse()` : insérer chaque page **en tête**
du voyage, dans l'ordre reçu, produit exactement le résultat voulu.
`[f1, f2, f3]` donne `_images = [f3, f2, f1, …existantes]`, donc
`imagesInReadingOrder()` rend `[…existantes, f1, f2, f3]`.

L'admission reste une porte unique : la garde des dimensions
(`admitImage`/`isDimension`) couvre le nouveau chemin comme les deux autres
(`addImage`, `rehydrate`), seule l'extrémité d'insertion diffère.

`addImage` (singulier, ajout en fin de voyage) **reste** : `importTrajetFromJson`
(`src/trajets/serialization/trajetJson.ts:83`) en a besoin pour restituer un
ordre déjà enregistré, et les tests unitaires s'en servent pour bâtir leurs
fixtures. Sa sémantique ne change pas.

Rien d'autre ne bouge dans le domaine : ni `pointsInOrdreDuVoyage`, ni
`moveImageForwardInVoyage`/`moveImageBackwardInVoyage`, ni la projection.

### Écran — `src/trajets/ui/TrajetEditorScreen.ts`

`importFiles` remplace sa boucle par un appel unique :

```ts
await applyToTrajetAndSave((currentTrajet) => {
    currentTrajet.addImagesInReadingOrder(pages);
});
```

`preparePages` déclare son retour avec le type nommé (`Promise<ImageFile[]>`) au
lieu de réécrire la forme en clair. La préparation en amont ne change pas :
dimensions lues **avant** de toucher à l'agrégat (un fichier illisible au milieu
d'une sélection n'en laisse aucune moitié importée), `fileInput.value` remis à
zéro dans le `finally`.

### Tests

**`src/trajets/domain/Trajet.test.ts`** — un `describe` pour la règle, assertions
sur les deux faces (`images` **et** `imagesInReadingOrder()`) : une seule des
deux laisserait passer une inversion compensée.

- Étant donné un trajet vierge, quand j'importe un lot de trois pages, alors la
  pile les lit dans l'ordre du lot et la dernière ouvre le voyage.
- Étant donné un trajet qui a déjà deux pages, quand j'importe un second lot,
  alors il se lit sous les pages existantes et son dernier élément ouvre le voyage.
- Étant donné un lot vide, quand je l'importe, alors le trajet est inchangé.
- Étant donné une page de largeur nulle dans le lot, quand je l'importe, alors
  c'est refusé avec le message nommant les dimensions (la garde couvre bien ce
  troisième chemin d'admission).

**`e2e/editeur.spec.ts`**

- `importerDeuxPages` attend `['page-1.png', 'page-2.png']`.
- « Monter page-1.png » devient « Monter page-2.png » : c'est page-2 qui est
  désormais en bas de la pile ; le résultat attendu reste `['page-2.png', 'page-1.png']`.
- Test de numérotation : les noms de page s'échangent dans les
  `.point-description`, mais `.point-number` reste `['2', '1']` — c'est
  précisément la preuve que la règle bas→haut n'a pas bougé.
- Le titre « la première du voyage est en bas de la pile » reste vrai tel quel.

**`e2e/points.spec.ts`** — le second lot passe dessous :
`['page-1.png', 'page-2.png', 'page-3.png']`.

Les autres specs (`helpers.ouvrirUnTrajetAvecUnePage`, `horsligne`, `suivi`,
`carte-editeur`, `import-export`) n'importent qu'une page ou passent par le
JSON : inchangées.

### Documentation

- **`README.md` § Préparer un trajet, étape 2** — « importer les images **dans
  l'ordre du voyage** » devient l'ordre du document, avec la conséquence sur le
  sens de sélection.
- **`docs/EXIGENCES.md`** — ligne `TR-7` : « Un lot importé se lit sous les pages
  existantes, dans l'ordre de l'explorateur », tracée vers `U Trajet.test.ts` et
  `E e2e/editeur.spec.ts`.
- **`docs/GLOSSAIRE.md`** — entrée **Ordre de lecture** dans le tableau Métier :
  inverse de l'ordre du voyage, et c'est l'ordre dans lequel l'import lit la
  sélection. Le terme est dans le code (`imagesInReadingOrder`) sans être au
  glossaire.

## Vérification

1. `pnpm quality` (typecheck + lint + test + audit fallow).
2. `pnpm test:e2e` sur `editeur` et `points`.
3. Contrôle visuel au MCP Playwright : importer les six pages de `pmpbxenjpeg/`
et lire la pile. Une géométrie (ordi 1280) suffit — la mise en page ne change
pas, seul l'ordre change.
  </content>

</invoke>
