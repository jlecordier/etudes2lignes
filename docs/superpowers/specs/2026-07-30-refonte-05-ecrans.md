# Lot 05 — Écrans, navigation, composition root

**Périmètre strict** : `src/trajets/ui/**`, `src/suivi/ui/**`, `src/navigation.ts`,
`src/main.ts`, `src/commun/dom.ts`, `index.html`, `src/style.css`.

**Vague 2 : ce lot part après les lots 01 à 04** et consomme leurs contrats. Il
est seul dans sa vague, il a donc le droit de toucher tous les écrans.

Règles communes : [index](2026-07-30-refonte-00-index.md#règles-communes-à-tous-les-lots).

## Constat général

C'est ici que se concentrent les quatre défauts majeurs de la revue. Les écrans
portent l'orchestration, la gestion d'échec, l'état applicatif et la navigation,
sans qu'aucun de ces rôles ne soit nommé. **Aucune couche nouvelle n'est
demandée** : on nomme des fonctions dans les fichiers existants.

## A. Les quatre défauts majeurs

### A1. Une frontière d'erreur unique

`grep -rn 'unhandledrejection|onerror' src e2e index.html` ne rend **rien**, et
**33** appels partent en `void f()` (`main.ts:34,45,49,58,66,69` ;
`ListeTrajetsScreen.ts:24,31,41,55,115,139,146,152` ;
`EditeurTrajetScreen.ts:63,266` …). Tout rejet est donc perdu.

L'asymétrie prouve que le mode de panne est connu : `ListeTrajetsScreen.ts:66-69`
documente que « le quota IndexedDB peut déborder sur mobile avec plusieurs
images » et protège l'import — mais `EditeurTrajetScreen.ts`, celui qui **ajoute
les images**, n'a aucun `catch`.

Ajouter **une seule** couture dans `src/commun/` : `lancer(promesse, quoi)` qui
attrape, journalise et affiche un message français unique mentionnant `quoi`, et
`signalerLEchec(quoi, erreur)`. Remplacer chaque `void f()` par
`lancer(f(), "l'enregistrement du trajet")`. Conserver les messages spécifiques
existants là où ils sont déjà soignés (import, export) : ils sont meilleurs que
le message générique.

- Étant donné un dépôt qui refuse d'écrire, quand j'ajoute une image, alors un
  message français explique l'échec (et non un écran silencieux).

### A2. Nommer le cas d'usage « modifier le trajet puis l'enregistrer »

`sauvegarderEtRendre` (`EditeurTrajetScreen.ts:230-236`) a **neuf** appelants
(`:99,114,132,166,201,212,266,331,339`) qui partagent la séquence _muter en
mémoire → enregistrer → réafficher_. Si l'écriture échoue, `rendre()` est sauté :
mémoire, IndexedDB et DOM divergent sans un mot. Symptôme du cas d'usage absent :
`if (trajet === null) { return; }` est recopié **quatorze** fois
(`:54,80,91,103,124,148,197,208,231,239,262,327,335`), chacune étant une action
utilisateur ignorée en silence — plus un commentaire d'aveu en `:242-244`.

Introduire `appliquerAuTrajetEtEnregistrer(modification: (trajet: Trajet) => Promise<void> | void)` :
porte la garde de nullité **une seule fois**, applique, enregistre, réaffiche ; en
cas d'échec, recharge l'agrégat via `repository.charger` pour resynchroniser
mémoire et DOM sur la vérité du stockage, puis prévient (A1). Les neuf appelants
deviennent une ligne.

- Étant donné une suppression d'image dont l'écriture échoue, quand je clique une
  seconde fois sur « Supprimer », alors le domaine ne lève pas « Image inconnue
  dans ce trajet » (l'écran a été resynchronisé).

### A3. Nommer la transition de source de position

`afficher` (`SuiviScreen.ts:92-95`) réinitialise `dernierePosition`,
`ancragePrecedent`, `suiviAutomatique`, le bouton et le bandeau ;
`choisirUnePositionSimulee` (`:198`) ne réinitialise **rien** ;
`quitterLaSimulation` (`:214`) ne réinitialise que le texte — tout en affichant
« En attente de position… » alors que la position simulée reste exploitable.

**Bug utilisateur à corriger** : simuler une position → quitter la simulation →
défiler à la main → « Reprendre le suivi » → la page se recale sur la position
**simulée**, que l'utilisateur lit comme sa position GPS.

Introduire un mode explicite, sur le modèle de `ModeDePlacement` qui fonctionne
déjà bien (`EditeurTrajetScreen.ts:20`) :

```
type ModeDeSuivi = { type: 'gps' } | { type: 'simulation' } | { type: 'quitte' };
```

et **une seule** fonction propriétaire de la transition : elle arrête la source
courante, remet à zéro `dernierePosition` et `ancragePrecedent`, réinitialise
l'affichage d'état, puis démarre la nouvelle source. Les trois transitions
l'appellent. Le bandeau de simulation cesse d'être la source de vérité du mode.

### A4. La carte est une superposition, pas un écran

`#ecran-carte` a trois propriétaires : `navigation.ts:10` peut la masquer avec les
autres `.ecran` (`index.html:95`), `LeafletSelecteurDeCoordonnee.ts:48,158` la
montre et la cache hors de `navigation.ts`, et `SuiviScreen.ts:182` **relit son
`hidden`** pour savoir si un choix est en cours. Et `'carte'` dans `NomEcran`
(`navigation.ts:6`) n'est **jamais** passé à `afficherEcran`.

- Retirer la classe `ecran` de `#ecran-carte` dans `index.html` (le CSS la
  positionne déjà en `position: fixed; inset: 0` — vérifier avant de retirer) et
  retirer `'carte'` de `NomEcran` : `afficherEcran` ne peut plus la masquer.
- Dans `SuiviScreen`, remplacer la lecture du DOM par un booléen local posé
  autour du `await selecteurDeCoordonnee.choisir(...)` (`:201-204`) : l'écran
  **sait** qu'il attend un choix, il n'a pas à le déduire d'un identifiant DOM
  d'une autre capacité.

## B. Les moyens

### B1. Un propriétaire des pages affichées

`elementImagePleineLargeur(image, urlsARevoquer)` (`elementsDImage.ts:9-14`)
délègue la propriété des object URLs à un **accumulateur passé en paramètre** —
un paramètre de sortie — et `revoquerLesUrls` (`:26-31`) vide le tableau **sans
toucher au conteneur**, qui garde ses `<img>` et donc les bitmaps décodés
(≈ 35 Mo par page). Après `quitterLEcran()` (`EditeurTrajetScreen.ts:71-75`) et
`quitter()` (`SuiviScreen.ts:103-112`), la libération ne libère rien.

Créer un petit objet propriétaire, par exemple
`creerPileDePages(conteneur: HTMLElement)` exposant
`rendre(images: readonly ImageDeTrajet[]): void` et `detruire(): void` : il garde
ses URLs en interne (l'accumulateur disparaît des deux écrans), `rendre` révoque
celles du rendu précédent, `detruire` révoque **puis** vide le conteneur.

### B2. Une source unique pour les règles partagées CSS ↔ TypeScript

Les trois quarts d'écran existent en trois exemplaires (`projection.ts:35` = 0.75,
`style.css:384` = `top: 75vh` pour la ligne-repère bleue, `e2e/aides.ts:133`) et
le seuil de grand écran en trois (`EditeurTrajetScreen.ts:23` = `900px`,
`style.css:241`, `e2e/aides.ts:98`). Si le domaine change, la ligne-repère ment.

- Les trois quarts : `SuiviScreen` pose la constante du domaine en propriété CSS
  personnalisée sur l'élément racine, et le CSS devient
  `top: calc(var(--fraction-position) * 100dvh)`. Le domaine reste pur.
- Le seuil : le CSS reste propriétaire du point de rupture et l'expose ; le TS le
  lit au lieu de le redéclarer.

### B3. Nommer la transition d'écran

La recette `afficherEcran(...)` + `void ecran.afficher(...)` est recopiée **six**
fois dans `main.ts` (`:33-34,44-45,48-49,57-58,65-66,68-69`), et les six jettent
la promesse. Ajouter dans `navigation.ts` un `aller(nom, chargement)` qui décide
l'ordre à un seul endroit et passe par la couture de A1.

### B4. Une seule fabrique de boutons

`boutonDAction` (`EditeurTrajetScreen.ts:422-435`) et `boutonFlottant` (`:438-457`)
sont un clone de douze lignes (confirmé par fallow, `dup:15945c77`), et trois
blocs de la même recette sont recopiés dans `ListeTrajetsScreen.ts:135-152`.
Conséquence déjà visible : `aria-label` est présent sur « Exporter » (`:145`) mais
**absent** sur « Renommer » et « Supprimer » — avec plusieurs trajets, trois
boutons indiscernables au lecteur d'écran.

Une fabrique unique dans `src/commun/dom.ts`, paramétrée par un **objet nommé**
(fin des deux `string` positionnels et du drapeau anonyme `dangereux`) :
`bouton({ texte, intitule, action, danger?, variante? })`, `intitule` obligatoire.
La variante posée sur l'image devient un décorateur (classe + arrêt de
propagation), pas une copie du corps. Les appelants passent l'objet que
`actionsDuPoint` (`:389-413`) produit déjà, au lieu de le déstructurer pour le
repasser positionnellement (`:358-360`, `:379-381`).

**Ne pas casser les tests E2E** : ils ciblent le nom accessible
(`e2e/points.spec.ts:44,67,91,113,134,155`, `e2e/import-export.spec.ts:18`).

### B5. `requeteTous`, le pendant pluriel de `requete`

`navigation.ts:15` utilise `document.querySelectorAll<HTMLElement>` — un générique
retour-seul, c'est-à-dire exactement le cast déguisé que `requete`
(`commun/dom.ts:10-25`) existe pour bannir, puisque rien ne vérifie le type à
l'exécution.

Ajouter `requeteTous<E extends Element>(selecteur, type, racine?): E[]` sur le
même principe du constructeur-témoin, qui lève un `TypeError` nommant l'élément
fautif dès qu'un `instanceof` échoue. `tousLesEcrans()` l'utilise.

### B6. La mémoire du dernier trajet ouvert n'est pas le rôle du composition root

`main.ts` déclare la clé de stockage (`:20`), écrit (`:56`), efface (`:43`), relit
et **reforge une marque de type sans validation** (`:63` :
`localStorage.getItem(…) as TrajetId | null`) — une frontière de persistance
logée dans le fichier qui ne devrait qu'instancier et injecter.

Créer `src/trajets/adapters/derniereSessionOuverte.ts` (`memoriser` / `oublier` /
`restaurer`), seul détenteur de la clé, de la validation de la chaîne relue et du
`try/catch` d'écriture. **Pas de port ni d'interface** : le seul consommateur est
le composition root, l'abstraction n'inverserait rien.

### B7. L'import d'images protégé et non bloquant

Si `createImageBitmap` rejette (`EditeurTrajetScreen.ts:460`), la boucle
`importerLesFichiers` (`:90-100`) a déjà muté l'agrégat pour les fichiers
précédents, et surtout `champFichiers.value = ''` (`:98`) n'est jamais atteint :
resélectionner les mêmes fichiers n'émet plus d'événement `change`, **l'import
est mort silencieusement**.

Préparer d'abord la liste des `{ nom, blob, largeur, hauteur }` (fonction de
préparation, échec traduit en message de frontière : « « page-2.jpg » n'est pas
une image lisible. »), ne muter l'agrégat qu'ensuite, enregistrer une seule fois,
et remettre `champFichiers.value = ''` dans un `finally`.

### B8. Un seul producteur du numéro de point, et plus de sélecteur par attribut

- Le numéro est produit par trois `index + 1` indépendants (`:419`, `:257`,
  `pointsAffiches.ts:8`) : utiliser `pointsNumerotesDansLOrdreDuVoyage()` du
  lot 01, ce qui supprime la `Map` et la branche que son propre commentaire
  déclare impossible (`:303-307`).
- `SuiviScreen.ts:161` retrouve l'élément d'une page par
  `requete('img[data-image-id="…"]')`, couplé par convention de chaîne à
  `elementsDImage.ts:22`, et **lève depuis un rappel GPS sans filet**. La pile de
  pages (B1) connaît ses éléments : lui faire exposer l'association
  `ImageId → HTMLImageElement`.

### B9. Basculer sur les contrats des lots 01 à 04

- Remplacer les deux `.reverse()` (`EditeurTrajetScreen.ts:250`,
  `SuiviScreen.ts:119`) par `imagesDansLOrdreDeLecture()`.
- Remplacer `monterVisuellement`/`descendreVisuellement` (`:326-340`), qui
  appellent aujourd'hui l'inverse de ce que leur nom promet, par les nouvelles
  intentions `avancerImageDansLeVoyage`/`reculerImageDansLeVoyage`, **puis
  supprimer les délégations `@deprecated`** du lot 01.
- Remplacer les deux `trajet.points.filter(...)` (`:106`, `:302`) par
  `pointsDeLImage(...)`.
- Remplacer le `borner` local (`:466-468`) par l'import de `src/commun/nombre.ts`,
  et `fractionDepuisPosition` (`:187-190`) par `FractionVerticale.depuisHauteur`.
- Adapter `SuiviScreen` au nouveau port du lot 02 (`surEtat` au lieu de
  `surErreur`) : le texte d'état vient désormais de `presentation.ts`, l'écran ne
  rédige plus rien — supprimer les deux « En attente de position… » en dur
  (`:97`, `:217`).
- Adapter l'éditeur au nouveau contrat de `CarteDesPoints` du lot 04 (initiale
  honorée) et afficher le message de lecture du lot 03 quand une lecture rejette.
- `SuiviScreen.ts:6-7` importe `trajets/ui/elementsDImage` et
  `trajets/ui/pointsAffiches` : une capacité qui dépend de l'`ui/` d'une autre,
  ce que la règle de dépendance d'AGENTS.md ne prévoit pas. Après B1 et B8, placer
  la pile de pages et les points affichés là où les deux capacités peuvent les
  consommer sans se référencer (les déplacer sous `src/commun/` est acceptable si
  elles ne dépendent que du domaine).

### B10. `demanderUnNom` confond « annulé » et « invalide »

`ListeTrajetsScreen.ts:183-194` rend `null` dans les deux cas, si bien que
l'appelant ne peut pas les distinguer. Rendre l'issue explicite (par exemple
`{ type: 'annule' } | { type: 'nom'; nom: NomDeTrajet }`) ou séparer les deux
responsabilités.

## C. Consignes de migration reçues de la vague 1

Ces consignes viennent des lots 01 à 04, qui ont terminé avant ce lot. Elles font
loi : ils ont écrit le code, ils savent ce qu'ils ont changé.

### C1. Du lot 01 (domaine trajets)

Ajouts sur `Trajet` — **aucune signature existante n'a été modifiée**, pour ne pas
casser le typecheck avant ce lot :

```ts
imagesDansLOrdreDeLecture(): readonly ImageDeTrajet[]
avancerImageDansLeVoyage(imageId: ImageId): void   // vers la fin du voyage
reculerImageDansLeVoyage(imageId: ImageId): void   // vers le début du voyage
pointsDeLImage(imageId: ImageId): readonly Point[]
pointsNumerotesDansLOrdreDuVoyage(): readonly { point: Point; numero: number }[]
```

Plus `FractionVerticale.depuisHauteur(distance, hauteur)`,
`NomDeTrajet.egale(autre)` et `borner` dans `src/commun/nombre.ts`.

Correspondances à appliquer :

| Aujourd'hui                                                                 | Devient                                                              |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `EditeurTrajetScreen.ts:330` `monterVisuellement` → `trajet.descendreImage` | `trajet.avancerImageDansLeVoyage(imageId)`                           |
| `EditeurTrajetScreen.ts:338` `descendreVisuellement` → `trajet.monterImage` | `trajet.reculerImageDansLeVoyage(imageId)`                           |
| `EditeurTrajetScreen.ts:250`, `SuiviScreen.ts:119` `[...images].reverse()`  | `imagesDansLOrdreDeLecture()`                                        |
| `EditeurTrajetScreen.ts:419`, `:256-258`, `pointsAffiches.ts:8`             | `pointsNumerotesDansLOrdreDuVoyage()`                                |
| `EditeurTrajetScreen.ts:106`, `:302` `trajet.points.filter(…)`              | `pointsDeLImage(image.id)`                                           |
| `EditeurTrajetScreen.ts:189` puis `borner` local `:466`                     | `FractionVerticale.depuisHauteur(clientY - cadre.top, cadre.height)` |

**À supprimer une fois la migration faite** : les délégations `@deprecated`
`Trajet.monterImage` / `Trajet.descendreImage` (`Trajet.ts:112-128`), **et avec
elles** l'interface de test `AncienneApiDeDeplacementDImage` (`Trajet.test.ts:10-17`)
et le test de délégation (`Trajet.test.ts:152-165`), qui n'ont plus d'objet.

Deux effets de bord signalés par le lot 01 : `supprimerImage` supprime désormais
les points **avant** de retirer l'image (cascade identique observable), et
`rehydrater` **refuse** un enregistrement d'image aux dimensions invalides — ce
qui remonte jusqu'à l'écran, voir C2.

Attention `fallow` : les cinq méthodes ci-dessus n'ont **aucun appelant** avant ce
lot. Le hook de pre-commit lance `fallow fix --yes`, qui supprime les exports
inutilisés : **ne rien commiter avant que ce lot ait câblé tous les appelants**.
Si `NomDeTrajet.egale` n'en trouve aucun, le signaler — il sera retiré plutôt que
conservé « pour la symétrie ».

### C2. Du lot 03 (persistance)

**Aucune signature de `TrajetRepository` n'a changé**, seule sa documentation. Mais
le comportement observable change : `charger` **rejette** au lieu de rendre un
trajet amputé, et `listerResumes` rejette si un enregistrement est corrompu. La
politique retenue est le **refus** — un trajet amputé serait ré-enregistré amputé
à la sauvegarde suivante, transformant une anomalie réparable en perte définitive.

Messages produits par l'adapter, à afficher tels quels via `erreur.message` :

- `Trajet illisible : une image de ce trajet est introuvable dans la base (<id>).`
- `Trajet illisible : le champ « largeur » est invalide dans la base.`
- `Trajet illisible : l'enregistrement du trajet est illisible dans la base.`

Habillage attendu côté écran :

- liste : `Impossible de lire la liste des trajets. <message>` + un bouton `Réessayer` ;
- éditeur / suivi : `Ce trajet ne peut pas être ouvert. <message> Réimportez-le
depuis un fichier JSON, ou supprimez-le.` ;
- ouverture de base impossible : `Le stockage local est indisponible. Fermez les
autres onglets d'Etudes2Lignes puis rechargez la page.`

### B11 (nouveau, remonté par le lot 03). Sérialiser les sauvegardes

Le lot 03 a fermé la décision de suppression dans la transaction, mais **une
course résiduelle subsiste** et n'est pas refermable côté dépôt : l'ADR 0005
interdit d'attendre une promesse étrangère (la conversion des octets) pendant une
transaction IndexedDB. La source de l'entrelacement est ici :
`EditeurTrajetScreen.ts:266` lance `void sauvegarderEtRendre()` depuis un rappel
Leaflet **sans l'attendre**, en concurrence avec les autres actions.

Faire de `appliquerAuTrajetEtEnregistrer` (A2) le **seul** chemin d'écriture, et
lui donner une file d'attente : deux modifications rapprochées s'enregistrent
l'une après l'autre, jamais en parallèle.

- Étant donné deux modifications déclenchées coup sur coup, quand elles
  s'enregistrent, alors la seconde attend la première.

### B12 (nouveau, remonté par le lot 03). Ne pas enfermer l'utilisateur

Un trajet corrompu qui fait rejeter `listerResumes` rendrait le trajet
**impossible à supprimer depuis l'interface**. Prévoir l'action « supprimer ce
trajet » sur l'écran d'erreur lui-même.

### C3. Du lot 04 (carte)

```ts
// CarteDesPointsPort.ts
choisirUneCoordonnee(coordonneeInitiale: Coordonnee | null): Promise<Coordonnee | null>;
// SelecteurDeCoordonneePort.ts — `reperes` n'est plus facultatif
choisir(coordonneeInitiale: Coordonnee | null, reperes: readonly PointAffiche[]): Promise<Coordonnee | null>;
```

**Une seule ligne à changer dans tout le projet** :
`EditeurTrajetScreen.ts:181` `return await carteDesPoints.choisirUneCoordonnee();`
devient `… .choisirUneCoordonnee(initiale);` — et c'est exactement ce qui corrige
l'asymétrie grand écran / mobile (défaut relevé par la revue : sur grand écran,
déplacer un point ne recentrait pas la carte sur sa position actuelle).

`EditeurTrajetScreen.ts:176` et `SuiviScreen.ts:201-204` passent déjà `reperes` :
rien à changer. Mais `reperes` étant devenu obligatoire, tout nouvel appel doit
passer `[]` explicitement, et tout faux `CarteDesPoints` écrit pour un test
d'écran doit accepter l'argument `coordonneeInitiale`.

### C4. Du lot 02 (suivi)

```ts
// src/suivi/ports/PositionSource.ts
export interface PositionSource {
    demarrer(
        surPosition: (position: Coordonnee) => void,
        surEtat: (etat: EtatDeLaSource) => void,
    ): void;
    arreter(): void;
}

// src/suivi/domain/etatDeLaSource.ts — ce que la source MESURE
export type EtatDeLaSource =
    | { etat: 'attente' }
    | { etat: 'imprecise'; imprecisionMetres: number }
    | { etat: 'perdue'; ancienneteMs: number }
    | { etat: 'permission-refusee' }
    | { etat: 'indisponible' };

// src/suivi/ports/PremierPlan.ts
export interface PremierPlan {
    surRetourAuPremierPlan(action: () => void): () => void; // rend le désabonnement
    estAuPremierPlan(): boolean;
}
```

`SimulateurDePosition` est inchangé (il hérite du nouveau `demarrer`).
`presentation.ts` exporte désormais **deux** rédacteurs :
`texteDEtatDuSuivi(resultat)` (inchangé) et
`texteDEtatDeLaSource(etat)` (nouveau, porte les cinq libellés et les arrondis).

Migration de `src/suivi/ui/SuiviScreen.ts` :

| Aujourd'hui                                                      | Devient                                                                                                                                                                                                           |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `surErreur(message)` → `etat.textContent = message` (`:132-134`) | `surEtat(etat)` → `etat.textContent = texteDEtatDeLaSource(etat)`                                                                                                                                                 |
| `etat.textContent = 'En attente de position…'` (`:97` et `:217`) | **à supprimer** : la source annonce elle-même `{ etat: 'attente' }` au démarrage, et `presentation.ts` la rédige (« En attente du signal GPS… »). Deux libellés concurrents pour la même situation disparaissent. |
| `ancragePrecedent = resultat` (`:149`)                           | inchangé — mais `ResultatDeSuivi` et `AncragePrecedent` n'ont plus `indexSegment` (correctif 7), `AncragePrecedent` ne porte plus que `scrollCible`                                                               |

**Point de conception à trancher dans ce lot** : deux rédacteurs écrivent
désormais dans le même `#etat-suivi` — le texte de la source (`surEtat`) et celui
de la projection (`texteDEtatDuSuivi`, appelé par `appliquerLaPosition`). Leur
priorité n'est écrite nulle part et dépend aujourd'hui de l'ordre des rappels.
Décider explicitement la règle, la commenter, et la vérifier par un scénario :
un « Hors trajet » ne doit pas être effacé par un état de source anodin, ni
l'inverse.

**`main.ts`** : les deux adapters acceptent `premierPlan?: PremierPlan` avec un
repli sur `new NavigateurPremierPlan()`. Le code marche donc sans rien changer —
mais chaque adapter ouvrirait alors **son propre** jeu d'écouteurs sur
`document`. Le composition root doit instancier **un seul** `NavigateurPremierPlan`
et l'injecter dans `GeolocationPositionSource` et `NavigateurEcranAllume`.

## Découpage en deux étapes séquentielles

Ce lot est trop gros pour être mené d'un bloc. Il se fait en deux étapes qui se
suivent — **jamais en parallèle** : elles partagent `main.ts`, `index.html` et
`src/commun/`.

### Étape 05a — fondations transverses et capacité « trajets »

Fichiers : `src/commun/**`, `src/trajets/ui/**`, `src/trajets/adapters/derniereSessionOuverte.ts`, `src/main.ts`, `index.html`.

Correctifs : **A1** (couture d'erreur), **A2** (cas d'usage nommé), **B11** (file
d'attente des sauvegardes), **B4** (fabrique de boutons), **B5** (`requeteTous`),
**B6** (dernière session ouverte), **B7** (import d'images protégé), **B10**
(`demanderUnNom`), **B12** (ne pas enfermer l'utilisateur), **B1** (créer
`pileDePages` et l'utiliser dans l'éditeur), **B8** (partie éditeur), **C1**
(migration du domaine), **C2** (messages de persistance), **C3** (la ligne unique
de la carte).

À la fin de 05a : `pnpm exec vitest run src/trajets src/commun` vert, et le
rapport doit livrer la signature de `pileDePages` et de la couture d'erreur, dont
05b a besoin.

### Étape 05b — capacité « suivi », navigation, style

Fichiers : `src/suivi/ui/**`, `src/navigation.ts`, `src/main.ts`, `index.html`, `src/style.css`.

Correctifs : **A3** (transition de source), **A4** (superposition de la carte),
**B2** (seuils uniques CSS ↔ TS), **B3** (`aller`), **B8** (partie suivi : plus de
sélecteur `img[data-image-id]`), **C4** (migration du port de suivi), plus
l'utilisation de `pileDePages` dans l'écran de suivi et la fin des imports
`suivi/ui → trajets/ui`.

C'est 05b qui referme `pnpm quality`.

## Définition de terminé

## Définition de terminé

- `pnpm quality` est **vert** : c'est ce lot qui referme le typecheck laissé rouge
  entre les vagues (typecheck + lint + tests unitaires + audit fallow).
- Plus aucun `void f()` sur une promesse sans couture d'échec dans le périmètre.
- Plus aucune délégation `@deprecated` du lot 01 dans le code.
- `pnpm test:e2e` passe **sauf** les scénarios que le lot 06 doit ajouter ou
  réparer : les lister dans le rapport plutôt que de les corriger ici.
- Rapport final : ce qui a été renoncé et pourquoi.
