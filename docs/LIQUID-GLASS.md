# Liquid Glass — les règles de l'interface

Ce document explique **pourquoi** l'interface a l'apparence qu'elle a. Il
s'adresse à qui doit la modifier sans la défaire.

La source des règles est la
[Human Interface Guidelines d'Apple](https://developer.apple.com/design/human-interface-guidelines/materials).
Les citations en anglais sont d'elle, mot pour mot ; ce qui suit chaque citation
est la conséquence pour **cette** application, souvent mesurée dans un
navigateur.

> Note pratique : les pages de la HIG sont une application web dont le HTML ne
> contient qu'un titre. Leur texte s'obtient par l'API JSON qui la sert :
> `https://developer.apple.com/tutorials/data/design/human-interface-guidelines/<page>.json`.
> Certaines valeurs — les couleurs système, notamment — ne vivent que dans le
> texte alternatif des images de ce JSON.

## La règle qui gouverne tout : deux couches

> « Liquid Glass forms a distinct functional layer for controls and navigation
> elements — like tab bars and sidebars — that floats above the content layer. »

Et son corollaire, tout aussi explicite :

> « **Don't use Liquid Glass in the content layer.** »

D'où la frontière, qui vaut pour chaque élément qu'on ajoute :

| Couche            | Ce qu'elle contient ici                                                                                                       | Traitement                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **Contenu**       | les pages du schéma, la carte, les lignes de la liste, l'aperçu du trajet, les repères et leurs pastilles, les encarts d'aide | Jamais de flou. Elle porte la couleur et l'information. |
| **Fonctionnelle** | les barres, les boutons flottants, les contrôles de la carte                                                                  | Le verre, et elle flotte au-dessus.                     |

Une barre qui **défile avec la page** n'appartient à aucune des deux : rien ne
passe jamais dessous, son flou n'échantillonne rien, et le matériau n'a plus
d'objet. C'est le défaut qu'avait l'en-tête, et il ne se voyait pas au premier
regard.

## La liste close des surfaces en verre

Neuf sélecteurs, et rien d'autre dans la feuille ne porte de `backdrop-filter` :

```
.header · .suivi-bar · .carte-bar
.floating-add-point-button · .carte-button · .overview-button · .resume-button
.leaflet-bar
```

> « Limit these effects to the most important functional elements in your app. »

Le budget compte autant que la doctrine : sur mobile, **trois à cinq flous
simultanés** est le plafond mesuré. Deux surfaces s'en trouvent donc exclues
alors qu'elles sont bien fonctionnelles :

- la **barre d'une page** existe une fois par page ;
- les **actions d'un point** existent une fois par point.

Trente flous coûteraient trente fois. Elles reçoivent la teinte du verre **sans
son flou** — ce qu'il fallait là était la lisibilité, pas l'optique, et un fond
suffit. Sans lui, ces boutons étaient illisibles sur un schéma chargé.

## Le verre ne se superpose jamais

> « Avoid overcrowding or layering Liquid Glass elements on top of each other. »

Deux conséquences quotidiennes :

- **La surface va au groupe, pas à chaque bouton.** Dans une barre, les items
  sont monochromes et partagent la surface de la barre. « Trajets » y montrait
  une pastille grise et « Suivre » une pastille bleue posées sur le verre : deux
  surfaces empilées.
- Le bouton de recentrage vit dans un `.leaflet-bar`, comme le zoom. Lui donner
  aussi du verre donnait **une gélule dans une boîte carrée**, et deux flous
  l'un sur l'autre.

## La couleur

> « Be judicious with your use of color in controls and navigation so they stay
> legible. »
> « Keep the number of prominent buttons to one or two per view. »
> « To emphasize primary actions, apply color to the background rather than to
> symbols or text. »

**Une action teintée par écran**, et c'est celle qui donne son sens à l'écran :
« Suivre » sur l'éditeur, « Nouveau trajet » sur la liste. Tout le reste est
monochrome ou porte le remplissage neutre. Les trois boutons de la barre
d'actions étaient teintés : avec « Suivre », quatre aplats bleus, et plus rien ne
disait lequel comptait.

Les actions **destructrices** font exception dans l'autre sens : le rouge est
dans le libellé, jamais en aplat sous lui — un aplat rouge attire précisément le
pouce qu'on veut voir hésiter.

Enfin, sur le verre les symboles sont monochromes :

> « Symbols and text on these elements follow a monochromatic color scheme,
> becoming darker when the underlying content is light, and lighter when it's
> dark. »

C'est la raison pour laquelle les emoji ont disparu : un emoji est une image en
couleurs, il ne sait pas s'inverser. Le jeu de symboles
([`src/shared/Icons.html`](../src/shared/Icons.html)) ne porte aucune couleur —
tout est en `currentColor`.

## La typographie

L'échelle est celle d'iOS, au corps par défaut, exprimée en fraction du corps de
texte pour suivre la taille dynamique :

| Style     | Corps / interligne   | Fraction | Où                                           |
| --------- | -------------------- | -------- | -------------------------------------------- |
| Title 2   | 22 / 28              | 1.294    | le grand titre d'un écran                    |
| Headline  | 17 / 22, graisse 600 | 1        | le titre d'une **barre**, le nom d'un trajet |
| Body      | 17 / 22              | 1        | le texte courant                             |
| Subhead   | 15 / 20              | 0.882    | l'aide, le compte des pages                  |
| Footnote  | 13 / 18              | 0.765    | les lignes d'état, les libellés serrés       |
| Caption 1 | 12 / 16              | 0.706    | le numéro d'un point                         |
| Caption 2 | 11 / 13              | 0.647    | le numéro d'une page                         |

Headline ne diffère de Body **que par la graisse** : c'est le geste de hiérarchie
le moins coûteux d'Apple, et le bon sur une interface dense. Un titre de barre
qui prend Title 2 Bold écrase tout et se tronque — « Paris → Bordeaux » tombait à
« Paris → Bordea… » sur 390 px.

La racine porte `font: -apple-system-body`, seul crochet que le web offre sur la
taille dynamique d'iOS : WebKit y résout la taille réellement choisie dans les
réglages, de 14 à 53 px, et tous les `rem` suivent.

## Les formes

Un contrôle est une **gélule**. Une section est arrondie à 22 px. Un rayon
**intérieur** ne s'écrit pas : il se calcule depuis celui qui le contient, moins
le rembourrage qui les sépare.

> « Consider aligning the shape of controls with other rounded elements
> throughout the interface. »

Et toute cible tactile fait au moins **44 × 44 px**. Quand la taille visible
porte l'information — la pastille d'un point sur un schéma dense —, c'est la
cible qu'on agrandit, pas le dessin.

## Ce que les réglages retirent

Trois réglages système changent le verre, et aucun ne se contente d'un demi-geste :

- **Transparence réduite** et **contraste renforcé** : le flou est coupé — les
  **deux** propriétés, préfixée comprise. Rendre la surface opaque ne suffit pas,
  le flou ne part pas tout seul.
- **Mouvement réduit** : les transitions cèdent, **pas** le défilement
  automatique — il _est_ la fonction de l'application.

iOS ne publie toujours pas `prefers-reduced-transparency` : la requête ne couvre
donc pas la plateforme où le verre est le plus visible. C'est pourquoi le
contraste renforcé partage la même liste.

## Les pièges de moteur, tous mesurés

Ceux-là ne se devinent pas, et chacun a coûté un défaut visible :

1. **`-webkit-backdrop-filter` doit précéder `backdrop-filter`**, avec la même
   valeur. Un iPhone sous iOS 16 ou 17 ne lit que la préfixée.
2. **Pas de `var()` dans un `backdrop-filter`** : WebKit l'ignore. C'est la seule
   valeur de la feuille qui ne peut pas être un jeton.
3. **Le fond opaque se déclare avant**, sans condition ; le verre ne s'ajoute que
   dans le `@supports`. L'inverse laisse les moteurs partiels sans rien.
4. **Un conteneur de carte doit ouvrir son contexte d'empilement** (`z-index: 0`).
   Les panneaux de Leaflet portent `z-index: 400` : sans cela ils remontent dans
   le contexte du parent et recouvrent tout. Le formulaire de saisie a été
   **intégralement invisible** pour cette raison.
5. **`leaflet.css` arrive après la feuille dans le bundle.** Monter en
   spécificité n'y suffit pas — `.leaflet-touch .leaflet-bar a` vaut autant qu'un
   sélecteur scopé, et l'ordre tranche alors en sa faveur. D'où les `!important`
   sur les contrôles de la carte, et eux seuls.
6. **Aucun filtre sur un ancêtre du verre** : il en annulerait le flou. Les
   tuiles sont donc assourdies sur `.leaflet-tile-pane`, jamais sur le conteneur.
7. **`viewport-fit=cover`** conditionne l'existence des `env(safe-area-inset-*)` :
   sans lui, ces fonctions valent `0px` et une barre tombe sous l'encoche.

## Le témoin

[`src/style.test.ts`](../src/style.test.ts) relit la **source** de la feuille.
C'est grossier, et c'est le prix à payer pour que ces règles cessent d'être
tacites : jsdom n'applique aucune feuille externe, et un navigateur ne dirait
rien d'une règle simplement absente.

Il ne vérifie pas des présences mais des **invariants** — aucune couleur écrite
en clair hors des jetons, aucune taille de texte hors des onze styles d'iOS,
aucun rayon inventé, tout jeton de couleur doublé en apparence sombre, la liste
close des surfaces en verre. Deux jetons oubliés du bloc sombre ont été trouvés
par lui, et non par une relecture.
