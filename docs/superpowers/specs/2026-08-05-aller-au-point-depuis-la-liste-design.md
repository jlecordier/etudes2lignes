# Aller au point depuis la liste — conception

La liste des points de l'éditeur annonce chaque point par une phrase de mise au
point :

```
Point 1 — page-1.png à 47 % — 44.8260, -0.5560
```

Trois des quatre informations n'en sont pas. Le nom de fichier est déjà écrit sur
la barre de l'image ; le « à 47 % » est le champ `fraction` rendu tel quel ; les
coordonnées sont la donnée brute que la carte, juste à côté, montre infiniment
mieux. Et la liste ne mène nulle part : repérer un point puis aller le voir sur le
schéma demande de le chercher à la main dans une pile de plusieurs milliers de
pixels de haut.

Cette conception fait deux choses : **la ligne d'un point dit où il tombe dans le
trajet**, et **cliquer dessus y amène**.

## Constat

| Ce qui existe                                             | Où                                     |
| --------------------------------------------------------- | -------------------------------------- |
| La phrase, écrite dans l'écran                            | `TrajetEditorScreen.ts:516`            |
| La ligne, une feuille sans intention                      | `PointRow.ts`, `PointRow.html`         |
| Le repère rouge sur la page, qui ignore quel point il est | `PointMarker.ts`                       |
| Le numéro que l'utilisateur lit, produit en un seul lieu  | `Trajet.numberedPointsInOrdreDuVoyage` |
| Les proportions de chaque page, dans l'agrégat            | `ImageDeTrajet.largeur/hauteur`        |

Tout est là, sauf trois choses : une mesure d'avancement, une numérotation des
pages, et un chemin pour qu'une ligne dise « emmène-moi ».

## Décision

### Le pourcentage, pas les kilomètres

**Ce que la ligne annonce est l'avancement du point dans le voyage, en part du
trajet entier.** Pas une distance : l'application ne connaît aucun kilométrage —
ni les PK du schéma, ni la longueur réelle de la ligne. Sommer les distances à
vol d'oiseau entre points produirait un nombre en « km » qui n'est pas celui de
la ligne, et un chiffre faux est pire qu'un chiffre absent.

L'avancement se mesure donc **dans le document**, les pages à leurs proportions :

```
avancement = ( Σ ratio des pages déjà parcourues + (1 − fraction) × ratio de la sienne )
             ────────────────────────────────────────────────────────────────────────────
                                     Σ ratio de toutes les pages

  avec ratio = hauteur / largeur, la pile posant toutes ses pages à la même largeur.
```

C'est **la même mesure que la barre de l'aperçu** pendant le suivi (`ratiosSum`,
`suivi/domain/overview.ts`) : lire « 34 % du trajet » dans l'éditeur et voir la
barre au tiers de l'aperçu, c'est la même vérité dite deux fois. Rien de neuf n'est
supposé — la pile qui défile, l'aperçu et cette phrase mesurent tous les trois le
document.

`(1 − fraction)`, parce que le voyage traverse une page **du bas vers le haut** :
au bas de la première page on est à 0, en haut de la dernière à 1.

**Conséquence assumée : un point haut dans la pile a un grand pourcentage.** C'est
déjà la convention des numéros de points — « les numéros croissent en remontant la
pile, comme les PK » (`e2e/editeur.spec.ts:40`). Une liste lue de haut en bas
donne des pourcentages croissants et des numéros de pages **décroissants** : le
voyage part de la dernière page du document. C'est le modèle de l'application, pas
un accident de cette phrase.

### Le numéro de la page, compté depuis le haut

Le nom de fichier disparaît de la phrase. Ce qui le remplace est le rang de la
page **dans la pile telle qu'elle s'affiche** — celui que l'œil compte depuis le
haut, et l'ordre dans lequel l'explorateur a livré les fichiers.

Pour que « page 2 » soit vérifiable d'un coup d'œil, le numéro se pose dans un
coin de chaque image :

```
┌────────────────────────────────┐
│ page-1.png      🔼  🔽  🗑️     │  la barre garde le nom de fichier
├────────────────────────────────┤
│ (1)                            │  pastille GRISE, coin haut-gauche
│                                │
│  ──────────────── (4) 🖼️🗺️🗑️  │  les pastilles de POINTS restent rouges
│                                │
└────────────────────────────────┘
```

Deux numérotations à l'écran, deux couleurs : gris `#1f2937` pour une page, rouge
`#dc2626` pour un point. Sans cet écart, deux pastilles voisines diraient la même
chose de deux choses différentes.

**La pastille est en position absolue, pas épinglée.** Un élément épinglé
(`position: sticky`) resterait visible en traversant une longue page — tentant —
mais il occuperait de la place dans le flux de `.image-area`, dont la hauteur sert
à convertir un clic en fraction verticale (`ImageFrame.ts:109`). Tout le
géoréférencement se décalerait de la hauteur d'une pastille. Elle porte aussi
`pointer-events: none`, comme le repère : un clic dessus doit atteindre l'image.

### La ligne devient le bouton

```
AVANT
┌──────────────────────────────────────────────────────────────┐
│ Point 1 — page-1.png à 47 % — 44.8260, -0.5560               │
│                                    🖼️     🗺️     🗑️          │
└──────────────────────────────────────────────────────────────┘

APRÈS
┌──────────────────────────────────────────────────────────────┐
│ (1)  53 % du trajet · page 1       🖼️     🗺️     🗑️          │
└──────────────────────────────────────────────────────────────┘
      └─ bouton plat « Aller au point 1 — 53 % du trajet · page 1 »,
         étiré sur la hauteur de la ligne
```

Pas de quatrième bouton : la description **est** la cible. C'est le motif de
`.trajet-name` dans la liste des trajets (`style.css:127`) — un bouton à plat,
aligné à gauche, dans le bleu des actions, qui se lit comme un titre et se touche
comme un bouton. `align-self: stretch` lui donne la hauteur de la ligne, donc une
cible tactile pleine sans ajouter un pixel à la liste.

La pastille du numéro reste **hors** du bouton : le texte du bouton est exactement
la phrase, ce qui garde les assertions lisibles et le nom accessible composé d'une
seule source.

### Les coordonnées passent en infobulle

`title="Coordonnée : 44.8260, -0.5560"` sur la ligne. Elles quittent la phrase, pas
l'écran :

- vérifier une coordonnée qu'on vient de saisir à la main reste légitime, et le
  survol ne coûte rien à qui ne le fait pas ;
- `e2e/gps.spec.ts:36` **lit cette coordonnée dans la description** pour piloter
  la position simulée du scénario de suivi. Sans elle, ce test devrait apprendre le
  schéma d'IndexedDB pour retrouver une valeur que l'écran affiche déjà.

### Le chemin du clic

Trois coutures, dans le sens de l'architecture — la feuille annonce, l'écran
décide ([ADR 0008](../../adr/0008-interface-en-custom-elements-natifs.md)) :

```ts
// intents.ts — la feuille dit ce que l'utilisateur veut, pas comment le faire
'show-point': CustomEvent<PointIntent>;

// PointMarker.ts — comme `schema-page` porte son `pageId`
get pointId(): PointId

// TrajetEditorScreen.ts
root.addEventListener('show-point', (event) => {
    showPoint(event.detail.pointId);
}, { signal });

function showPoint(pointId: PointId): void {
    carteDesPoints.centerOn(trajetPoint(currentTrajet, pointId).coordonnee);
    scrollToMarker(pointId);
}
```

**Un geste, deux réponses.** Le repère vient au centre de l'écran, et la carte se
cale sur la coordonnée du même point — l'intention ne nomme donc pas de support
(`show-point`, et non `show-point-on-image`) : elle dit qu'on veut voir ce point,
l'écran décide de ce que cela veut dire.

Les deux à chaque fois, sans regarder la taille de l'écran. Au-dessus de 900 px
la carte est épinglée à côté de la pile, donc les deux réponses se lisent d'un
coup ; en dessous elle est au-dessus des images, et son cadrage attend qu'on y
remonte. Rien ne se perd, et le seuil du grand écran n'a pas à être recopié dans
l'écran d'édition.

Le cadrage de la carte n'est pas inventé : `centerOn` appelle `centerOnCoordonnee`
(`carte/adapters/fitting.ts`), déjà utilisé quand on déplace un point. Désigner un
point et le déplacer amènent au même endroit, à la même échelle.

`block: 'center'` et non les trois quarts hauts du suivi : cette fraction existe
pour laisser voir ce qui arrive quand on avance (`POSITION_VIEWPORT_FRACTION`).
Ici on ne suit rien, on inspecte — le centre est la place d'une chose qu'on vient
regarder.

Le marqueur est de hauteur nulle et sans `pointer-events` : `scrollIntoView` s'en
moque, il travaille sur la boîte. Sa pastille, elle, se voit.

## Le domaine gagne trois requêtes

```ts
// Trajet.ts
numberedImagesInReadingOrder(): readonly { image: ImageDeTrajet; number: number }[]
pageNumberOfPoint(pointId: PointId): number
progressOfPoint(pointId: PointId): number   // [0, 1]
```

Les deux premières passent par **une seule** règle privée
(`_images.length − rang dans le voyage`) : le numéro peint sur l'image et celui
que la liste annonce ne peuvent pas diverger. C'est la raison d'être de
`numberedPointsInOrdreDuVoyage`, appliquée aux pages.

`progressOfPoint` ne peut pas diviser par zéro : un point vise toujours une image
du trajet (invariant), et `admitImage` refuse les dimensions non strictement
positives — la somme des ratios est donc au moins celle de sa propre page.

La phrase quitte l'écran pour `trajets/domain/presentation.ts`, à côté de
`trajetContentsText` :

```ts
export function pointDescriptionText(progress: number, pageNumber: number): string;
export function coordonneeText(latitude: number, longitude: number): string;
```

Deux règles d'écriture — l'arrondi du pourcentage, les quatre décimales — qui
deviennent testables sans DOM, là où elles n'avaient aucun témoin unitaire.

L'écran, lui, se réduit à composer :

```ts
createPointRow({
    pointId: point.id,
    number,
    description: pointDescriptionText(
        currentTrajet.progressOfPoint(point.id),
        currentTrajet.pageNumberOfPoint(point.id),
    ),
    coordonnee: coordonneeText(point.coordonnee.latitude, point.coordonnee.longitude),
});
```

## Ce que les tests prouvent

| Fichier                      | Ce qu'il prouve                                                                                                                                                                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Trajet.test.ts`             | Les pages sont numérotées depuis le haut, et le numéro d'un point suit un réordonnancement. L'avancement vaut 0 au bas de la première page, 1 en haut de la dernière, et pèse le ratio propre de chaque page — donc sur des formats mélangés. |
| `presentation.test.ts`       | L'arrondi du pourcentage, 0 % et 100 %, et l'écriture d'une coordonnée.                                                                                                                                                                       |
| `TrajetEditorScreen.test.ts` | Cliquer la ligne du second point amène **son** marqueur, pas un autre. La ligne porte sa coordonnée en infobulle et un nom accessible qui dit où l'on va.                                                                                     |
| `e2e/points.spec.ts`         | Un point au bas d'une pile de trois pages : sa pastille est hors écran, un clic sur sa ligne l'y amène. Sur les cinq navigateurs, dont les deux mobiles.                                                                                      |
| `e2e/editeur.spec.ts`        | Les pastilles de pages disent 1 puis 2 depuis le haut ; la ligne d'un point annonce la nouvelle page après un réordonnancement.                                                                                                               |

**jsdom ne défile pas.** Le test unitaire pose donc un `scrollIntoView` sur le
prototype, qui relève l'élément qu'on lui a demandé de montrer — exactement comme
le test de l'export fausse `HTMLAnchorElement.prototype.click` pour relever le
fichier proposé (`TrajetEditorScreen.test.ts:167`). Une doublure écrite à la main,
et une assertion sur la **valeur produite** : le marqueur visé.

Deux assertions e2e existantes changent de nature, et il faut le dire :

- une dizaine de motifs lisent le format actuel de la description
  (`points.spec.ts`, `editeur.spec.ts`, `gps.spec.ts`) : ils suivent la phrase.
  Les tolérances changent de sens — un clic à 25 % du haut d'une page unique
  devient « 75 % du trajet », le voyage se lisant de bas en haut ;
- `editeur.spec.ts:63` doit se scoper à `#images-stack .point-number`. La pastille
  d'un point partage désormais sa classe entre la liste et l'image — une seule
  identité visuelle, voulue —, donc le sélecteur nu en trouverait le double.

## Écarté

- **Une distance en kilomètres.** Elle n'existe pas : ni PK du schéma, ni longueur
  de ligne. La somme des cordes entre points n'est pas la distance parcourue, et
  l'afficher en « km » la ferait passer pour telle.
- **Un clignotement du marqueur à l'arrivée.** La pastille rouge au centre de
  l'écran se voit ; `element.animate` casserait le test unitaire (jsdom ne
  l'implémente pas) pour un confort marginal.
- **Une navigation « point suivant / précédent »** et un retour vers la liste
  après le défilement : hors périmètre. Les actions d'un point sont déjà
  atteignables sur son marqueur, sans remonter.
- **Une pastille de page épinglée**, qui survivrait au défilement d'une longue
  page : elle fausserait la conversion clic → fraction verticale (voir plus haut).
- **Des points qu'on nomme** (« Bordeaux-Saint-Jean »), le seul libellé vraiment
  humain. C'est une fonctionnalité — champ dans l'agrégat, clé dans le JSON
  exporté et dans IndexedDB, geste pour renommer — et ce travail ne lui ferme
  aucune porte : la description devient un point d'entrée unique.
- **Un ADR.** Rien d'architectural n'est décidé ni renversé.

## Fichiers touchés

| Fichier                                     | Nature                                                         |
| ------------------------------------------- | -------------------------------------------------------------- |
| `src/trajets/domain/Trajet.ts`              | trois requêtes, une règle privée de numérotation               |
| `src/trajets/domain/Trajet.test.ts`         | numérotation depuis le haut, avancement                        |
| `src/trajets/domain/presentation.ts`        | la phrase et la coordonnée                                     |
| `src/trajets/domain/presentation.test.ts`   | leurs témoins                                                  |
| `src/trajets/ui/intents.ts`                 | `show-point`                                                   |
| `src/trajets/ui/PointRow.ts` + `.html`      | bouton plat, pastille, infobulle                               |
| `src/trajets/ui/PointMarker.ts`             | `pointId`                                                      |
| `src/trajets/ui/ImageFrame.ts` + `.html`    | pastille du numéro de page                                     |
| `src/trajets/ui/TrajetEditorScreen.ts`      | écoute l'intention, défile ; perd `pointDescription`           |
| `src/trajets/ui/TrajetEditorScreen.test.ts` | le marqueur visé, l'infobulle, le nom accessible               |
| `src/style.css`                             | `.point-number` partagée, `.page-number`, `.point-description` |
| `e2e/points.spec.ts`                        | le clic qui défile, et les motifs de description               |
| `e2e/editeur.spec.ts`                       | pastilles de pages, réordonnancement, sélecteur scopé          |
| `e2e/gps.spec.ts`                           | lit la coordonnée dans l'infobulle                             |
| `docs/EXIGENCES.md`                         | exigences GR-9, GR-10, GR-11                                   |
| `docs/GLOSSAIRE.md`                         | `avancement → progress`                                        |
| `README.md`                                 | ce que la liste des points annonce, et qu'elle mène au schéma  |
