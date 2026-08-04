# Accueil lisible sur mobile — conception

L'écran d'accueil sur un téléphone de 390 px : le titre écrasé, l'action
principale sous la secondaire, et les trois boutons d'une ligne de trajet plus
hauts que le trajet lui-même.

## Constat, mesuré à 390 px

| Constat                            | Mesure                                                                                         |
| ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| **« Mes trajets » écrasé**         | le `<h1>` comprimé à **96 × 47 px** (deux lignes) pendant que les boutons gardaient **246 px** |
| **Boutons en escalier**            | 108 px et 152 px, empilés, alignés à gauche — et l'action principale **sous** la secondaire    |
| **Les actions écrasent le trajet** | **86 px des 168 px** de chaque carte, soit 51 % : plus que le trajet                           |
| **Le nom ressemble à un champ**    | bouton encadré gris sur fond blanc, cassé en deux (**189 × 56 px**)                            |
| **Le compte flotte**               | centré verticalement à droite du nom, laissant un trou sous lui                                |
| **Densité**                        | 2 trajets = **344 px** sur 844 ; le reste vide                                                 |

`.header` est un `space-between` sans `flex-wrap`, et `.trajet-name` porte
`flex: 1; min-width: 10rem` : le nom ne peut donc pas occuper sa ligne, il la
partage avec le compte. Les trois actions sont des enfants directs du
`trajet-row` en `flex-wrap: wrap`, d'où l'empilement.

## Décision

**Le masquage des libellés sous 560 px devient une convention générale, et la
ligne de trajet passe à deux lignes : le trajet d'abord, ce qui agit dessus
ensuite.**

```
AVANT (390 px)                        APRÈS (390 px)

┌──────────────────────────────┐      ┌──────────────────────────────────┐
│ Mes      ┌──────────┐        │      │ Mes trajets  ⬆️  🆕 Nouveau trajet │
│ trajets  │⬆️ Importer│        │      └──────────────────────────────────┘
│          └──────────┘        │      ┌──────────────────────────────────┐
│          ┌────────────────┐  │      │ Paris → Bordeaux (ERTMS)          │
│          │🆕 Nouveau trajet│  │      │ 2 images · 2 points   ✏️  ⬇️  🗑️  │
│          └────────────────┘  │      └──────────────────────────────────┘
└──────────────────────────────┘
┌──────────────────────────────┐        en-tête   86 px → 39 px
│ ┌──────────┐   2 image(s) ·  │        carte    168 px → 93 px  (−45 %)
│ │Paris →   │   2 point(s)    │        liste    344 px → 194 px
│ │Bordeaux  │                 │        ligne de point 168 → 68 px
│ └──────────┘                 │
│ ┌─────────┐ ┌─────────┐      │
│ │✏️Renommer│ │⬇️Exporter│      │
│ └─────────┘ └─────────┘      │
│ ┌──────────┐                 │
│ │🗑️Supprimer│                 │
│ └──────────┘                 │
└──────────────────────────────┘
```

### `createButton` sépare le pictogramme du libellé

```ts
export interface Button {
    readonly icon: string; // toujours visible
    readonly label?: string; // masqué sous 560 px ; absent = bouton pictogramme
    readonly ariaLabel: string; // obligatoire — le masquage ne peut pas le retirer
    …
}
```

Le libellé part dans un `<span class="button-label">`, que la feuille de style
retire sous 560 px. **L'omettre** fait un bouton pictogramme en toute largeur —
c'est le cas de ▲/▼ sur une page, qui l'étaient déjà.

Cela ferme le piège que la fabrique existait déjà pour fermer : `ariaLabel` y est
requis, donc un bouton créé par `createButton` ne peut pas devenir muet. Pour les
boutons écrits à la main dans un gabarit, c'est `TrajetEditorScreen.test.ts` qui
le vérifie.

**Qui garde son libellé.** « 🆕 Nouveau trajet » (l'action principale de
l'accueil : sur une liste vide, un pictogramme seul n'inviterait à rien) et
« 🧭 Suivre » (l'action de l'éditeur ; une boussole seule ne la dirait pas). Ils
ne portent simplement pas la classe.

### `gap` global, pas d'espace dans le texte

`button { display: inline-flex; gap: 0.35rem }`. Une espace entre le pictogramme
et le libellé laisserait une traîne de ~4 px à droite du pictogramme une fois le
libellé retiré, et Prettier reformate les `.html` : l'espacement du gabarit n'est
pas un appui fiable.

### La ligne de trajet, en deux lignes

Le nom occupe sa ligne, en pleine largeur, à plat et dans le bleu des actions —
c'est ce qu'on touche pour ouvrir le trajet, pas un champ de saisie. Le compte et
les trois actions partagent la seconde, le compte poussant les actions contre le
bord droit (`flex: 1`).

### Deux plafonds de largeur desserrés

- `.trajet-details` : `min-width: 5rem` explicite et **pas** de `nowrap`. Sans
  cela le `min-width: auto` d'un élément flex vaut sa taille min-content, donc le
  compte imposait sa largeur entière comme plancher — et un trajet à trois
  chiffres de points renvoyait les trois actions à la ligne suivante.
- `.point-description` : `12rem` → `8rem`. 12 rem mettait la ligne pile à la
  limite (192 de description + 126 de boutons + 24 de gouttières = 342, pour 342
  disponibles) et la corbeille repassait à la ligne. La description grandit de
  toute façon pour occuper ce qui reste.

### `.header` reste sans `flex-wrap`

Essayé, et c'est pire : l'en-tête de l'éditeur porte trois éléments (retour,
titre, Suivre) et plier les envoie sur **trois lignes**, ce qui coûte plus de
hauteur qu'un titre serré. C'est `.header > button { flex-shrink: 0 }` qui règle
le problème : les boutons gardent leur largeur, le titre plie. Sans lui, tout se
comprimait au prorata et « Suivre » se cassait en deux dans son propre bouton.

### Les comptes se lisent en français

`trajetContentsText` (`src/trajets/domain/presentation.ts`, à côté de la
présentation du suivi) : pluriel porté par chaque compte séparément, absence dite
en mots.

| Avant                     | Après                    |
| ------------------------- | ------------------------ |
| `0 image(s) · 0 point(s)` | `Aucune image`           |
| `1 image(s) · 1 point(s)` | `1 image · 1 point`      |
| `3 image(s) · 0 point(s)` | `3 images · aucun point` |
| `6 image(s) · 4 point(s)` | `6 images · 4 points`    |

Un trajet sans image n'a pas de point à compter : l'agrégat garantit qu'un point
vise une de ses images (exigence GR-6), donc la phrase s'arrête là.

## Ce que les tests prouvent

| Fichier                               | Ce qu'il prouve                                                                                                              |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `trajets/domain/presentation.test.ts` | Chaque compte porte son pluriel ; l'absence se dit en mots. Mutation-testé (`domain/`).                                      |
| `shared/elements.test.ts`             | Le libellé vit dans un élément atteignable par un sélecteur ; sans libellé, aucun span — rien à masquer.                     |
| toute la suite `E` sur iPhone / Pixel | 390 px et 412 px sont sous le seuil : les parcours désignent les boutons par leur nom et échouent si un `aria-label` manque. |

La mise en page elle-même n'a pas de test : elle est vérifiée en mesurant les
boîtes réelles dans le navigateur, et les chiffres du tableau ci-dessus en sont
le relevé.

## Écarté

- **Réduire « Nouveau trajet » et « Suivre » à leurs pictogrammes** : gagnerait
  de la place, mais ce sont les deux actions principales de leurs écrans.
- **Réutiliser `--large-screen` (900 px)** comme seuil : réduirait ces barres à
  des pictogrammes minuscules sur un iPad en portrait.
- **Le `point(s)` du dialogue de suppression d'une page**
  (`TrajetEditorScreen.ts`) : même verrue, mais la phrase accorde aussi son verbe
  (« seront supprimés »), ce qui en fait un autre chantier.
- **Un ADR** : rien d'architectural n'est décidé ni renversé.
