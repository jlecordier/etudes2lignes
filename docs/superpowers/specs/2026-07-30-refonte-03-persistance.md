# Lot 03 — Persistance et sérialisation

**Périmètre strict** : `src/trajets/adapters/**`, `src/trajets/serialisation/**`,
`src/trajets/ports/TrajetRepository.ts` (+ leurs tests). **Rien d'autre.**

Règles communes : [index](2026-07-30-refonte-00-index.md#règles-communes-à-tous-les-lots).

## Constat général

La persistance est globalement soignée (transaction unique, ArrayBuffer par
ADR 0005, réécriture des seules nouvelles images). Trois choses manquent : une
décision de suppression prise **hors** de la transaction qui la protège, une
politique déclarée face à un enregistrement rompu, et un `as` de forme qui
contredit l'ADR 0002.

## Correctifs

### 1. Décider les suppressions d'images **dans** la transaction

`IdbTrajetRepository.ts:90-92` lit les clés d'images **hors** transaction, et ces
clés servent à décider des suppressions à `:108-112` — alors que le même corps de
méthode lit les clés de points **dans** la transaction (`:125-128`). Deux
sauvegardes rapprochées (un glisser de marqueur pendant un autre enregistrement :
`EditeurTrajetScreen.ts:266` lance sans attendre) peuvent donc s'entrelacer et
supprimer une image que l'autre vient d'ajouter.

Le contrat du port promet pourtant « écrit tout l'agrégat de façon atomique (tout
ou rien) » (`TrajetRepository.ts:17`).

Lire les clés d'images **dans** la transaction pour décider les suppressions,
exactement comme pour les points. Conserver la pré-lecture hors transaction
**uniquement** comme indice de ce qu'il faut convertir en octets (c'est le point
qu'ADR 0005 justifie : on ne peut pas attendre une promesse étrangère dans une
transaction IndexedDB).

- Étant donné un trajet dont une image a été retirée, quand je sauvegarde, alors
  l'enregistrement de cette image disparaît et les autres survivent.

N'ajouter **ni** révision d'agrégat **ni** verrou : hors sujet, coût supérieur au
gain.

### 2. Une seule définition du « nombre d'images »

`listerResumes` compte via `countFromIndex` (`:62`) alors que la source de vérité
de l'agrégat est `imageIds` (`:81`, `:104`, `:178`). Deux définitions du même
concept dans le même fichier, et un N+1 (une requête de comptage par trajet).

Utiliser `enregistrement.imageIds.length`. Le compte des points n'a pas d'autre
source et reste sur `countFromIndex`.

### 3. Déclarer la politique face à un enregistrement rompu

`dansLOrdreDuTrajet` (`:176-179`) avale en silence une image listée dans
`imageIds` mais absente du magasin, tandis que `Trajet.rehydrater` refuse le même
incident dès qu'un point vise cette image (`Trajet.ts:55-58`). Deux réponses
opposées à un même état, dans le même chemin de lecture.

Trancher **une** politique et l'écrire dans la documentation du port :
réhydratation en meilleur effort (ignorer l'image absente **et** les points qui la
visent) **ou** refus avec une erreur que l'écran saura afficher. Le choix
recommandé est le refus : il est cohérent avec l'agrégat, qui lève déjà.

- Étant donné une base dont une image listée est absente du magasin, quand je
  charge le trajet, alors le résultat est celui que la politique déclare (test
  avec `fake-indexeddb`, données posées à la main).

### 4. Valider les enregistrements relus au bord de l'adapter

Le JSON importé est validé champ par champ (`trajetJson.ts:129-155`) ; les
enregistrements IndexedDB sont présumés conformes parce que `DBSchema` les type —
un typage qui est une promesse non vérifiée sur des données externes. `NomDeTrajet`,
`Coordonnee` et `FractionVerticale` valident au passage, mais `largeur`, `hauteur`,
`type` et `donnees` entrent sans contrôle (`:181-189`).

Valider ces champs au bord de l'adapter, en réutilisant les prédicats du
correctif 5 plutôt qu'en réécrivant des gardes.

### 5. Supprimer l'`as` de forme de `trajetJson.ts`

`trajetJson.ts:133` fait `return valeur as Record<string, unknown>`, ce qu'ADR 0002
proscrit et que `docs/EXIGENCES.md:79` (QA-2) affirme absent du code — l'exigence
est donc fausse aujourd'hui.

Écrire la garde comme un **prédicat de type** (`function estUnObjet(valeur: unknown): valeur is Record<string, unknown>`)
et faire lever `objet()` après son appel : c'est exactement la « validation
runtime » que prescrit l'ADR. Chaque champ reste `unknown`, contrôlé un par un
comme aujourd'hui. Vérifier qu'aucun `as` de forme ne subsiste dans le périmètre.

Les casts d'identifiants brandés à la frontière de persistance (`:59`, `:183`,
`:193`, `:194`) sont **explicitement tolérés par ADR 0005** : ne pas y toucher.

### 6. Le contrat du port doit prévoir l'échec de lecture

`IdbTrajetRepository` mémorise sa promesse d'ouverture au constructeur (`:48`) ;
si l'ouverture échoue (base bloquée par un autre onglet, stockage refusé), la
promesse rejette et **aucun consommateur ne l'attrape**. L'utilisateur reste
devant un écran vide.

Ici, se limiter à ce qui est dans le périmètre : documenter dans
`TrajetRepository.ts` que `charger`, `listerResumes`, `sauvegarder` et `supprimer`
peuvent rejeter, et fournir `blocked` / `blocking` à `openDB` pour que le cas soit
diagnosticable. L'affichage du message est le travail du lot 05.

Ne pas ajouter de migration versionnée : la version est épinglée à 1, `upgrade`
est correct sur base neuve, rien n'est cassé. Le jour d'une version 2, la suite
`if (ancienneVersion < n)` s'imposera d'elle-même.

## Définition de terminé

- `pnpm exec vitest run src/trajets/adapters src/trajets/serialisation` est vert.
- Un test couvre l'entrelacement de deux sauvegardes (correctif 1) et un
  l'enregistrement rompu (correctif 3).
- Zéro `as` de forme dans le périmètre ; les casts brandés d'ADR 0005 intacts.
- Aucun fichier hors périmètre modifié.
- Rapport final : la politique retenue au correctif 3, et ce que le lot 05 doit
  afficher quand une lecture rejette.
