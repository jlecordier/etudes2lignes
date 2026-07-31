# Lot 01 — Domaine trajets

**Périmètre strict** : `src/trajets/domain/**` (+ tests), `src/commun/tableau.ts`,
et la création éventuelle de `src/commun/nombre.ts`. **Rien d'autre.**

Règles communes : [index](2026-07-30-refonte-00-index.md#règles-communes-à-tous-les-lots).

## Constat général

L'agrégat `Trajet` protège ses invariants, mais plusieurs connaissances qui lui
appartiennent sont reconstruites par ses appelants, et une de ses portes
d'entrée ne passe pas par ses gardes. Les appelants seront basculés par le
lot 05 : ici, on **ajoute** ce qui manque et on applique le parallel change.

## Correctifs

### 1. `rehydrater` doit passer par les mêmes gardes que `ajouterImage`

`Trajet.ts:46` promet « en revalidant les invariants » mais `rehydrater`
(`:47-60`) ne revalide que l'appartenance point→image : les dimensions ne
passent pas par `estUneDimension` (`:79`, `:178-180`).

Extraire une garde privée partagée (par exemple `admettreLImage(image)`) appelée
par les **deux** chemins d'admission d'une image dans l'agrégat.

- Étant donné un enregistrement d'image de largeur 0, quand je réhydrate un
  trajet, alors la réhydratation est refusée avec un message nommant la dimension.
- Étant donné un trajet valide, quand je le réhydrate, alors rien ne change.

### 2. `ordreVoyageDesPoints` ne doit plus acquitter une absence en silence

`Trajet.ts:134-135` fait `rangParImage.get(a.imageId) ?? 0` alors que l'agrégat
lève partout ailleurs (`indexImageObligatoire`, `:161-167`). Le `?? 0` trie
silencieusement de travers si l'invariant casse.

Utiliser la même recherche obligatoire. Aucun test existant ne doit changer de
résultat (l'invariant garantit que le cas ne se produit pas).

### 3. `pointsDeLImage(imageId)` : la jointure appartient à la racine

La relation point→image est reconstruite par ses appelants
(`EditeurTrajetScreen.ts:106` et `:302`, hors périmètre) et par l'agrégat
lui-même (`:153-159`).

Exposer `pointsDeLImage(imageId: ImageId): readonly Point[]` et l'utiliser dans
`supprimerLesPointsDeLImage`.

- Étant donné un trajet à deux images portant chacune des points, quand je
  demande les points de la première image, alors je n'obtiens que les siens.
- Étant donné une image absente du trajet, quand je demande ses points, alors
  c'est refusé (comme les autres méthodes de l'agrégat).

### 4. `pointsNumerotesDansLOrdreDuVoyage()` : un seul producteur du numéro

Le numéro visible par l'utilisateur est produit par **trois** calculs
`index + 1` indépendants au-dessus de `ordreVoyageDesPoints()`
(`EditeurTrajetScreen.ts:419` et `:257`, `pointsAffiches.ts:8` — hors périmètre)
qui doivent rester d'accord pour que la liste, les pastilles sur l'image et les
marqueurs de la carte concordent.

Exposer `pointsNumerotesDansLOrdreDuVoyage(): readonly { point: Point; numero: number }[]`,
numérotée à partir de 1.

- Étant donné un trajet à trois points sur deux images, quand je demande les
  points numérotés, alors les numéros suivent l'ordre du voyage sans trou.

### 5. `imagesDansLOrdreDeLecture()` : l'ordre d'affichage est une règle du domaine

« Les pages se lisent de bas en haut, la première du voyage tout en bas » est une
règle métier, aujourd'hui appliquée par un `.reverse()` recopié dans deux écrans
(`EditeurTrajetScreen.ts:250`, `SuiviScreen.ts:119` — hors périmètre).

Exposer `imagesDansLOrdreDeLecture(): readonly ImageDeTrajet[]` (l'inverse de
l'ordre du voyage), documentée par la règle de lecture.

### 6. Renommer les méthodes de déplacement d'image dans le langage du voyage

`monterImage` / `descendreImage` (`Trajet.ts:87-93`) sont nommées dans un
vocabulaire **spatial** dont le sens est l'inverse du spatial de l'écran : d'où
`monterVisuellement → trajet.descendreImage` dans l'éditeur, une inversion que
le compilateur ne peut pas voir (mêmes signatures). Le glossaire ne connaît que
« l'ordre du voyage ».

Ajouter `avancerImageDansLeVoyage(imageId)` et `reculerImageDansLeVoyage(imageId)`.
**Parallel change** : `monterImage`/`descendreImage` sont conservées, délèguent
aux nouvelles, et portent `@deprecated à supprimer par le lot 05`.

### 7. `FractionVerticale.depuisHauteur(distance, hauteur)`

L'intervalle `[0, 1]` du value object est recopié par l'UI
(`EditeurTrajetScreen.ts:189`, hors périmètre) pour éviter de faire lever le
constructeur. La fabrique doit borner elle-même.

- Étant donné une distance négative, quand je construis la fraction depuis une
  hauteur, alors j'obtiens 0.
- Étant donné une distance supérieure à la hauteur, alors j'obtiens 1.
- Étant donné une hauteur nulle, alors c'est refusé (division impossible).

### 8. Un seul `borner`

`borner` est dupliqué à l'identique dans `suivi/domain/projection.ts:202-204` et
`trajets/ui/EditeurTrajetScreen.ts:466-468` (tous deux hors périmètre).

Créer `src/commun/nombre.ts` exportant `borner(valeur, minimum, maximum)`, avec
son test. Ne modifier aucun des deux appelants (les lots 02 et 05 s'en chargent).

### 9. ~~`NomDeTrajet` sans `egale`~~ — **abandonné**

Fait, puis **retiré**. La méthode n'a trouvé aucun appelant en dehors de son
propre test : c'était de la symétrie pour la symétrie, exactement le travers que
cette refonte combat ailleurs. À noter que `Coordonnee.egale` et
`FractionVerticale.egale` sont dans le même cas — dette préexistante, laissée
telle quelle faute de mandat, mais elle mérite la même question.

Énoncé d'origine :

`Coordonnee` et `FractionVerticale` exposent `egale`, `NomDeTrajet` non
(`NomDeTrajet.ts`). Incohérence de solution entre trois value objects du même
domaine : ajouter `egale(autre: NomDeTrajet): boolean`, avec son test.

## Définition de terminé

- `pnpm exec vitest run src/trajets/domain src/commun` est vert.
- Chaque correctif a au moins un test BDD nommé `Étant donné / Quand / Alors`.
- Aucun fichier hors périmètre modifié (`git status` le prouve).
- Rapport final : liste des signatures ajoutées et des délégations `@deprecated`
  que le lot 05 devra basculer puis supprimer.
