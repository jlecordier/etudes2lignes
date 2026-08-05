# Aperçu du trajet pendant le suivi — conception

L'écran de suivi montre le schéma à sa taille réelle, qui remonte sous un repère
fixe. On y lit finement où l'on est — et rien du voyage entier. Il tiendrait
pourtant dans une colonne étroite juste à côté : celle qu'aucun des deux écrans
ne montre.

**Sur iPad en paysage et au-delà, le trajet entier s'affiche à côté de celui qui
défile, avec une barre à la position. En portrait et en dessous, un bouton
flottant fait apparaître le même aperçu en incrustation.**

## L'échelle est déduite, jamais supposée

L'aperçu n'a pas de taille propre. Sa largeur est celle qui fait tenir la pile
entière dans la hauteur disponible :

```
largeur = hauteur disponible ÷ Σ (hauteur / largeur)
                                 ↑ le ratio propre à chaque page
```

**Rien ici ne suppose que les pages d'un trajet se ressemblent.** La somme porte
sur le ratio de chacune : deux pages ou trente, portrait, paysage, ou n'importe
quel mélange — l'égalité `Σ hauteurs affichées = hauteur disponible` est exacte
dans tous les cas, parce que la pile pose toutes les pages à la **même largeur**
et que chacune garde son propre ratio (`SchemaPage` réserve les `largeur` et
`hauteur` de _sa_ page, et sa géométrie est `img { width: 100%; height: auto }`).
L'agrégat garantit par ailleurs des dimensions entières strictement positives
(`isDimension`), donc aucun ratio n'est ni nul ni infini.

Ce que les ratios changent, c'est donc l'**échelle**, et rien d'autre. Quelques
trajets pour la donner, sur 775 px de hauteur utile — un iPad en paysage
(1180 × 820) barre d'état ôtée :

| Trajet                                      | Σ ratios | Largeur déduite            | Ce qu'on voit                      |
| ------------------------------------------- | -------- | -------------------------- | ---------------------------------- |
| 1 page panoramique 8000 × 800               | 0,10     | 7750 → **192** (plafonnée) | un ruban de 192 × 19               |
| 2 pages A4 portrait                         | 2,83     | 274 → **192** (plafonnée)  | deux pages, plus court que l'écran |
| 3 pages A4 + 1 panoramique                  | 4,34     | **178**                    | 252 + 252 + 252 + 18 = 775 ✓       |
| `PMP-BX (ERTMS)` du dépôt : 6 × 2481 × 3508 | 8,49     | **91**                     | des pages de 91 × 129              |
| 23 pages A4 portrait                        | 32,5     | **24**                     | la limite basse, voir plus bas     |

Le seuil de bascule, lui, ne dépend pas du trajet : c'est `--large-screen`
(900 px), déjà celui de la carte de l'éditeur.

### La limite basse est nommée, pas corrigée

Plus la pile est haute, plus la colonne est étroite : c'est le prix du « tout tient
dans un écran ». Vers 24 px de large une silhouette de page ne dit plus rien —
atteint au-delà d'une vingtaine de pages A4, ou bien plus tôt avec des pages
franchement hautes.

**Aucun plancher de largeur n'est posé**, et c'est délibéré : un plancher casse
l'invariant qui fait tout tenir (SU-16), et il faudrait alors soit rogner l'aperçu
— qui mentirait sur l'étendue du trajet — soit le rendre défilant, ce qui est
l'exact contraire de ce qu'on cherche. L'aperçu reste donc juste et devient
étroit ; c'est un compromis qu'on préfère assumer que masquer.

### Ce que l'aperçu porte, à toute échelle

À ces largeurs un libellé du schéma est illisible, quel que soit le trajet. Donc
l'aperçu répond à « où en suis-je du voyage », jamais à « qu'y a-t-il ici ». Il ne
porte **que** les images, un filet entre les pages et la barre — ni pastilles de
points, ni portion parcourue grisée.

Le filet est dessiné par `.overview-stack schema-page + schema-page::after`, en
absolu : une `border-top` aurait ajouté un pixel à la hauteur de chaque page, et
l'aperçu ne tiendrait plus _exactement_ dans la hauteur qu'on lui a calculée.

## Décision

**Deux piles des mêmes pages, une seule décision de projection.**

```
GRAND ÉCRAN (≥ 900 px)                    PETIT ÉCRAN, aperçu ouvert
┌─ .suivi-bar (sticky) ───────────┐       ┌─ .suivi-bar ────────┐
│ 🔙 Éditer      état        🧪   │       │ 🔙 Éditer   état 🧪 │
└─────────────────────────────────┘       └─────────────────────┘
┌──────────────────┬──────────────┐       ┌───────────────┐░░░░─┐
│ page 2           │ ░░░░░░░░░░░░ │       │ page 2        │░░░░ │
│ (taille réelle,  │ ░░░░░░░░░░░░ │       │ (taille       │░░░░ │
│  défile)         │ ░░░░░░░░░░░░ │       │  réelle)      │════ │ ← position
│                  │ ════════════ │ ←     │               │░░░░ │
│- - - - - - -  75%│ ░░░░░░░░░░░░ │       │- - - - -  75% │░░░░ │
│                  │ ░░░░░░░░░░░░ │       │          [🗺️] │░░░░ │
└──────────────────┴──────────────┘       └───────────────┘░░░░─┘
  flex: 1            sticky, 100dvh         incrustation translucide,
  guide-line s'arrête à l'aperçu            position: fixed
```

```
SuiviScreen.html
.suivi-bar                    ← inchangée
.suivi-body                   ← nouveau, flex
├── #suivi-stack              ← flex: 1 ; min-width: 0
└── #trajet-overview          ← aria-hidden
    ├── #overview-stack       ← position: relative
    └── #overview-position    ← la barre, position: absolute
.guide-line                   ← s'arrête au bord de l'aperçu
#resume-button                ← recentré sur la pile qui défile
#overview-button              ← flottant, masqué au-dessus de 900 px
```

Le suivi fait défiler **`window`** (`window.scrollTo`,
`document.documentElement.scrollHeight`), et tous les parcours e2e s'appuient sur
`scrollY`. L'aperçu se glisse à côté sans transformer la pile en conteneur
défilant : c'est ce qui garde SU-7, SU-9 et leurs témoins intacts.

### Le CSS décide du mode, le TypeScript n'a aucun seuil à connaître

Sous 900 px l'aperçu est `display: none`, et une classe `.overview-ouvert` sur
l'élément-écran le passe en incrustation. Au-dessus, la requête média le rend
visible en permanence et masque le bouton. Le TypeScript ne fait que basculer la
classe — il ne recopie donc pas le 900, ce que l'éditeur est obligé de faire pour
sa carte (`getComputedStyle(…).getPropertyValue('--large-screen')`).

L'aperçu est **à droite** dans les deux modes : la colonne épinglée d'un côté, et
l'incrustation qui vient recouvrir le même bord. En incrustation il est
`position: fixed`, sous la barre d'état (`top: var(--suivi-bar-height)`), fond
blanc à 90 % — la page continue de se lire dessous —, et il s'empile entre le
repère (`z-index: 5`) et les boutons flottants (`20`). Sa largeur n'est pas
imposée : un élément `fixed` s'ajuste à son contenu, donc à `--overview-width`.

Un trajet sans page masque le panneau **et** le bouton (`hidden`, qui gagne sur la
requête média) : sur grand écran, une colonne vide n'aurait laissé qu'un filet
vertical sans rien dedans.

Conséquence assumée du seuil partagé : un iPad Pro 12,9" **en portrait** fait
1024 px et obtient donc les deux colonnes. C'est cohérent avec la carte de
l'éditeur, qui s'épingle déjà à côté des images sur le même appareil.

### Qui calcule la largeur

Le TypeScript écrit la seule chose que le CSS ne peut pas deviner — la **somme des
ratios**, qu'il tire des dimensions portées par l'agrégat — et le CSS fait la
division :

```css
/* sur le sélecteur `suivi-screen` : le panneau comme le repère en héritent */
--overview-height: calc(100dvh - var(--suivi-bar-height, 3rem));
--overview-width: min(calc(var(--overview-height) / var(--overview-ratios-sum)), 12rem, 33vw);
```

Le repli `3rem` n'est pas décoratif : sans lui, un `var()` non résolu invalide le
`calc()`, donc `--overview-width`, donc la largeur — l'aperçu n'aurait aucune
taille entre le montage et la première mesure.

Les deux plafonds servent les trajets courts et les pages très larges (voir le
tableau d'échelles) : `12rem` sur un iPad, `33vw` sur un téléphone — 129 px sur
390 px de large. Plafonner ne peut que faire tenir l'aperçu **davantage** dans la
hauteur, jamais moins ; et comme la barre se place sur des offsets **mesurés**,
elle reste juste quelle que soit la largeur réellement appliquée — plafonnée ou
non, uniforme ou pas.

`--suivi-bar-height` est mesurée par le TypeScript et posée sur l'élément-écran,
pas sur `:root` : elle disparaît avec l'écran. Elle est relevée au chargement, à
`resize`, et dans `switchTo` — le bandeau de simulation change la hauteur de la
barre sans qu'aucun événement de fenêtre ne le signale.

### Une seule décision, deux référentiels

`computeScrollTarget` rend désormais aussi **le segment retenu et l'avancement
dessus** :

```ts
export interface TrajetPosition {
    readonly segmentIndex: number;
    readonly t: number; // avancement ∈ [0, 1] sur ce segment
}

export type SuiviResult =
    | { kind: 'pas-assez-de-points' }
    | { kind: 'hors-trajet'; distanceMetres: number }
    | ({ kind: 'sur-trajet'; scrollTarget: number } & TrajetPosition);

/** Rejoue la même position sur le trajet dans un autre référentiel d'offsets. */
export function offsetAt(etapes: readonly EtapeDuVoyage[], position: TrajetPosition): number;
```

`scrollTarget` reste ce qu'il a toujours été — la cible dans le référentiel qu'on
a fourni —, donc **aucune assertion de `projection.test.ts` ne change** et aucune
fonction n'est renommée.

Côté écran, `voyageEtapes` sert désormais les deux piles et prend donc son
conteneur **et son origine** :

- pour la pile qui défile, l'origine reste le document (`frame.top +
window.scrollY + …`), puisque c'est `window` qu'on fait défiler ;
- pour l'aperçu, c'est le haut de sa propre pile (`frame.top − pileTop + …`), et
  non le document : le panneau est `sticky` ou `fixed`, où les coordonnées
  document ne veulent rien dire. Le résultat est directement le `top` de la barre,
  qui est en absolu dans `#overview-stack`.

Ce que cette forme garantit : les deux vues ne peuvent pas désigner deux endroits
différents, parce qu'aucune des deux ne redécide. Faire tourner la projection une
seconde fois aurait produit un second ancrage d'adhérence, donc deux segments
possiblement différents près d'une jonction — exactement le bruit que
`chooseSegment` existe pour absorber.

Le champ `ancragePrecedent` de l'écran devient `lastSurTrajet` : il garde le
résultat entier au lieu de la seule cible, et le passe comme `previous`. Le
**type** `AncragePrecedent` reste, et reste étroit (`{ scrollTarget }`) : c'est
lui qui continue de dire, par le type, ce que l'adhérence a le droit de regarder
— jamais un numéro de segment. La définition du glossaire (« Résultat
« sur-trajet » du tick précédent, mémorisé pour l'adhérence ») devient d'ailleurs
littéralement vraie, ce qu'elle n'était pas tout à fait.

### La barre ne bouge que sur `sur-trajet`, et pas d'un pixel autrement

Même règle que le défilement aujourd'hui. Un `hors-trajet` passager la laisse où
elle est — c'est la ligne d'état qui porte le doute, et le document ne recule pas
davantage. Tant qu'aucune position n'est tombée sur le trajet, elle est **cachée** :
elle ne prétend pas à une place qu'elle n'a pas.

Et elle hérite d'un garde-fou existant. `switchTo` remet la mémoire du suivi à
zéro, pour la raison écrite dans le code : quitter la simulation ne doit pas
recaler la page sur la position simulée, « que l'utilisateur lisait comme sa
position réelle ». `lastSurTrajet` tombant à `null`, **quitter la simulation
efface la barre** au lieu de laisser une position fictive plantée sur l'aperçu.

### La rotation réinterpole, elle ne redécide pas

Une rotation d'iPad ne déplace pas la position sur le trajet : elle déplace les
offsets des deux piles (la hauteur disponible change, donc la largeur de
l'aperçu, donc toutes ses pages). Aucune projection n'est donc rejouée.

```ts
window.addEventListener(
    'resize',
    () => {
        replayLastSurTrajet();
    },
    { signal },
);

function replayLastSurTrajet(): void {
    const last = lastSurTrajet;
    if (last === null) {
        return;
    }
    followTarget(offsetAt(stackEtapes(), last));
    placeOverviewPosition(last);
}
```

Trois déclencheurs, un seul chemin de placement : une position qui arrive
(`applyPosition` finit par cet appel), l'ouverture de l'incrustation, et
`resize`. Aucune coordonnée relue, aucun segment rechoisi, aucune interaction
avec l'adhérence ni avec les transitions `hors-trajet`. `followTarget` refuse
déjà de bouger quand le suivi est en manuel : rien n'arrache la page sous les
yeux de qui lit plus loin.

Le recalage du **défilement** à la rotation vient gratuitement, sur la même
ligne, et corrige un mensonge qui existe déjà : aujourd'hui rien ne se recale
après une rotation, donc le repère à 75 % désigne le mauvais endroit du schéma
jusqu'au tick suivant — jusqu'à ~10 s. C'est une amélioration hors du besoin
initial ; elle est écrite ici parce qu'elle ne doit pas passer en contrebande.

### Deux fois la même page en mémoire — mesuré, pas supposé

Chaque page est montée deux fois : deux `schema-page`, deux URL d'objet, deux
libérations au détachement. C'est exactement le contrat de la classe — « **le
propriétaire** de son URL d'objet » — donc rien à assouplir, et CV-4 continue de
valoir : le témoin compte simplement deux URL par page.

Le coût réel est le **décodage**, et il se compte en pixels sources : une page
scannée en A4 à 300 dpi (2481 × 3508) pèse 35 Mo décodée, donc les 6 pages de
`PMP-BX` en tiennent 209 — la pile qui défile les porte **déjà**, aperçu ou pas.
Un trajet d'images plus modestes coûte proportionnellement moins ; la question
posée par l'aperçu est la même dans tous les cas : est-ce que ça double ?

Deux atténuations tombent de la conception :

- sur petit écran, aperçu fermé = `display: none`, donc les images ne sont ni
  mises en page ni chargées (`loading="lazy"` sur un sous-arbre non affiché) :
  **aucun octet décodé tant que l'incrustation n'est pas ouverte** ;
- aux largeurs de l'aperçu, Safari et Chrome sous-échantillonnent le décodage des
  JPEG (par facteurs de 2), ce qui ramènerait ces 209 Mo à quelques mégaoctets.

Le second point est une attente, pas une garantie — un PNG ne se
sous-échantillonne pas de la même façon. **La mesure est donc un critère
d'acceptation** : `PMP-BX` ouvert sur grand écran, relevé mémoire avant/après —
c'est le trajet le plus lourd dont on dispose, donc le pire cas connu. Si le
décodage double, le repli documenté est de construire les vignettes une fois au
chargement (`createImageBitmap` page par page → un `<canvas>`), ce qui plafonne le
pic à une page et l'aperçu à quelques centaines de kilo-octets. Ce repli ne touche
que le contenu de la colonne : la géométrie, la barre, la bascule et le CSS
restent tels quels.

**Écarté : partager l'URL entre les deux piles avec un compteur de références.**
Une URL d'objet est une poignée, pas une copie — les octets du `Blob` sont déjà
partagés, c'est le même objet. Et le cache de décodage du navigateur est indexé
par URL **et taille de rendu**, or les deux tailles diffèrent par construction :
le compteur aurait ajouté de la mécanique sans économiser un octet.

### Le bouton dit son état, pas son action

`#overview-button` porte un intitulé **stable** — « Aperçu du trajet » — et un
`aria-pressed` que la bascule met à jour. Un bouton dont le nom accessible change
avec l'état est un bouton qu'on ne peut plus désigner dans un test ni annoncer
proprement. Le pictogramme reste 🗺️ dans les deux positions.

`#trajet-overview` porte `aria-hidden="true"` : sans cela un lecteur d'écran
énumère les noms de pages deux fois, alors que l'aperçu est une silhouette — il
n'ajoute rien de dicible. La position, elle, se dit déjà en toutes lettres dans
`#suivi-status`.

## Cas limites

| Cas                                 | Ce que fait l'aperçu                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| Trajet sans page                    | Panneau et bouton masqués, `--overview-ratios-sum` non écrite — le CSS ne divise jamais par zéro  |
| Une seule page                      | Montrée entière, plafonds de largeur appliqués (le suivi, lui, réclame deux points)               |
| Pages de ratios différents          | Chacune garde le sien ; seule l'échelle commune s'ajuste — c'est le cas normal, pas une exception |
| Une page très large (panoramique)   | Σ ratios minuscule → largeur plafonnée, aperçu plus court que l'écran : il tient, en plus court   |
| Beaucoup de pages très hautes       | Colonne très étroite, sans plancher : juste mais peu lisible, limite nommée et assumée            |
| Moins de deux points                | `pas-assez-de-points` → barre cachée                                                              |
| Aucun fix encore reçu               | Barre cachée                                                                                      |
| `hors-trajet`, signal perdu         | Barre à sa dernière place, la ligne d'état porte le doute — même règle que le défilement          |
| Simulation quittée                  | `lastSurTrajet` remis à zéro → barre cachée : aucune position fictive ne reste affichée           |
| Rotation d'iPad                     | Le CSS recalcule la largeur, `resize` réinterpole la barre **et** le défilement                   |
| Position reçue, incrustation fermée | `#overview-stack` mesure 0 → rien n'est placé ; l'ouverture rattrape                              |
| Grand écran                         | Aperçu toujours monté, bouton masqué, `.overview-ouvert` sans effet                               |

Le garde-fou du dernier cas est une mesure, pas un seuil recopié : si la pile de
l'aperçu ne mesure rien, il n'y a rien à y placer — et surtout aucun 0 à prendre
pour un offset.

## Ce que les tests prouvent

| Fichier                                | Ce qu'il prouve                                                                                                                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `suivi/domain/projection.test.ts`      | `offsetAt` rejoue la même position dans un second jeu d'offsets : deux référentiels, un seul choix de segment. Mutation-testé.                                                                               |
| `suivi/domain/overview.test.ts` (neuf) | La somme des ratios : une page, aucune (0 — le cas qui protège le CSS de la division par zéro), et **des pages de ratios différents**, dont une panoramique — le témoin qu'aucune uniformité n'est supposée. |
| `suivi/ui/SuiviScreen.test.ts`         | L'aperçu monte autant de pages que la pile ; **deux URL par page, toutes rendues au détachement** ; `aria-pressed` bascule.                                                                                  |
| `e2e/suivi.spec.ts` — grand écran      | Aperçu présent sans bouton ; **la pile entière tient dans la hauteur** ; simulation sur le point 1 → `(barreY − pileY) / hauteurDeLaPile ≈ 0,8`, la fraction du point.                                       |
| `e2e/suivi.spec.ts` — petit écran      | Aperçu absent, bouton présent ; activé → aperçu et barre ; rebasculé → il repart.                                                                                                                            |
| `e2e/suivi.spec.ts` — simulation       | Quitter la simulation efface la barre.                                                                                                                                                                       |

**Ce qui n'a pas de témoin, dit franchement.** jsdom ne fait pas de mise en page :
`getBoundingClientRect` y rend 0 partout. Aucun test unitaire ne peut voir _où_
tombe la barre — d'où le témoin en e2e, qui lit `0,8` d'une hauteur **mesurée** au
lieu de recalculer des offsets. Une assertion unitaire sur la barre serait un
test creux qui passe parce que tout vaut zéro.

## Nommage

`aperçu` est absent du lexique, donc technique par défaut
([ADR 0007](../../adr/0007-langue-du-code-metier-francais-technique-anglais.md)) →
**`overview`**. Deux lignes à ajouter au tableau des mots techniques récurrents de
[`GLOSSAIRE.md`](../../GLOSSAIRE.md#mots-techniques-récurrents--traduction-retenue) :
`aperçu → overview` et `bascule` / `basculer → toggle`. `TrajetPosition` suit
l'ordre des mots anglais, comme `trajet-row` : le mot métier garde sa forme
française à sa nouvelle place.

Une ligne à ajouter au tableau **Métier**, parce que c'est un concept du domaine
et pas seulement un type :

| Terme                      | Définition                                                                                                                                            | Dans le code     |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| **Position sur le trajet** | Le segment retenu et l'avancement dessus. Indépendante de tout référentiel de pixels : c'est ce qui permet aux deux vues de désigner le même endroit. | `TrajetPosition` |

## Traçabilité

Deux exigences dans [`EXIGENCES.md`](../../EXIGENCES.md), section Suivi :

| #     | Exigence                                                                                                                      |
| ----- | ----------------------------------------------------------------------------------------------------------------------------- |
| SU-15 | Aperçu du trajet entier avec une barre à la position : côte à côte au-dessus de 900 px, en incrustation basculable en dessous |
| SU-16 | L'aperçu tient toujours dans la hauteur disponible, quels que soient le nombre de pages et leurs ratios                       |

## Fichiers

| Fichier                               | Ce qui change                                                            |
| ------------------------------------- | ------------------------------------------------------------------------ |
| `src/suivi/domain/projection.ts`      | `TrajetPosition`, `offsetAt`, deux champs sur `sur-trajet`               |
| `src/suivi/domain/projection.test.ts` | Le témoin des deux référentiels                                          |
| `src/suivi/domain/overview.ts`        | **Neuf** — `ratiosSum(pages)`, pur                                       |
| `src/suivi/domain/overview.test.ts`   | **Neuf**                                                                 |
| `src/suivi/ui/SuiviScreen.html`       | `.suivi-body`, l'aperçu, la barre, le bouton flottant                    |
| `src/suivi/ui/SuiviScreen.ts`         | Seconde pile, placement de la barre, bascule, `resize`, hauteur de barre |
| `src/suivi/ui/SuiviScreen.test.ts`    | Montage, URL, `aria-pressed`                                             |
| `src/style.css`                       | Les deux modes, la largeur déduite, le repère qui s'arrête à l'aperçu    |
| `e2e/suivi.spec.ts`                   | Les trois parcours                                                       |
| `docs/EXIGENCES.md`                   | SU-15, SU-16                                                             |
| `docs/GLOSSAIRE.md`                   | Une ligne Métier, deux entrées de lexique                                |
| `README.md`                           | Une phrase dans la puce **Suivi**                                        |

## Écarté

- **Une réglette abstraite** (graduations + pastilles numérotées au lieu des
  images) : légère en mémoire, mais on ne reconnaît plus le schéma — or c'est
  précisément la silhouette de la ligne qui situe.
- **La carte du trajet à côté** : vue géographique, pas une réduction du
  document ; « une barre qui défile dessus » n'y a pas de sens, et l'éditeur la
  montre déjà.
- **Faire suivre à la barre la portion visible** plutôt que la position GPS :
  l'aperçu deviendrait un plan de lecture. C'est l'inverse du besoin — quand on
  défile à la main, ce qu'on veut voir, c'est que la position n'a pas bougé.
- **Deux vues exclusives sur petit écran** (l'une remplaçant l'autre en pleine
  largeur) : l'incrustation garde la pile en place, donc ses offsets, donc le
  suivi automatique pendant qu'on consulte l'aperçu.
- **Un aperçu cliquable** pour se déplacer dans le document : c'est une nouvelle
  intention, qui entre en conflit avec le suivi automatique et réclame sa propre
  décision (est-ce que ça coupe le suivi ?).
- **Un résultat de projection sans pixels du tout** (supprimer `scrollTarget`,
  l'écran interpolant lui-même les deux référentiels) : plus pur, mais ça renomme
  `computeScrollTarget`, réécrit quatre lignes d'exigences et leurs tests, pour un
  gain sans effet observable.
- **Calculer les offsets dans le domaine** depuis `largeur`/`hauteur` au lieu de
  mesurer le DOM : supprimerait toute mesure, mais ferait entrer la mise en page
  dans le domaine, que le glossaire tient dehors — « offset » y est explicitement
  une mesure de l'affichage.
- **Un ADR** : rien d'architectural n'est décidé ni renversé. Le domaine reste
  sans mise en page, l'écran reste un custom element, la pile continue de défiler
  avec `window`.
