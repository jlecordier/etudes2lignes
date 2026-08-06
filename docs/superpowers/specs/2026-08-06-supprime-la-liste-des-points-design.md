# Supprimer la liste des points — conception

L'éditeur montrait les mêmes points sur **trois** surfaces : la carte (où ils
sont dans le monde), la pile (où ils sont dans le document), et une liste (où ils
sont dans une phrase). La troisième part.

Cette conception remplace celle de la veille
([aller au point depuis la liste](2026-08-05-aller-au-point-depuis-la-liste-design.md)),
dont l'objet — rendre la phrase de la liste lisible, puis la relier au schéma —
n'a plus de sujet.

## Constat

Pour **agir** sur un point, la liste n'apportait rien : `pointActions` fabrique
littéralement les mêmes trois boutons pour la ligne et pour le repère. Pour
**parcourir** le trajet, la carte fait mieux — elle montre l'espacement
géographique, celui dont dépend la projection du suivi.

Ce que la liste portait seule tient en trois lignes, et chacune a une place
ailleurs :

| Ce qu'elle portait           | Où ça va                                |
| ---------------------------- | --------------------------------------- |
| « 48 % du trajet · page 2 »  | nulle part — voir « Écarté »            |
| La coordonnée en infobulle   | sur le repère, là où le point est posé  |
| Aller au point sur le schéma | sur la carte, d'un clic sur le marqueur |

Elle coûtait, en revanche : sur iPad portrait, la carte (45 vh) **et** la liste
remplissaient le premier écran — le schéma n'apparaissait qu'après les avoir
dépassés tous les deux.

## Décision

### Le geste passe sur la carte

Cliquer un marqueur numéroté fait défiler le schéma jusqu'au repère du même
point. C'est le geste qui manquait le plus : la carte disait « ce point est près
d'Angoulême » sans permettre d'y aller.

L'intention `show-point` disparaît avec la feuille qui l'émettait ; la carte
rapporte le point désigné par son port, à côté du déplacement qu'elle rapportait
déjà :

```ts
show(points, onMove, onShow): void
```

**Clic et glisser ne se confondent pas**, et c'est vérifié plutôt que supposé :
un glisser de 70 px déplace le point sans faire défiler, un clic net fait défiler
sans déplacer, sur les cinq navigateurs. Leaflet s'en charge doublement — un
mouvement de moins de trois pixels ne démarre aucun glisser (`clickTolerance`),
et un glisser accompli supprime le clic qui le suit (`_draggableMoved`).

**Risque assumé, mesuré et accepté** : sondé au doigt (et non à la souris), un
marqueur déplaçable ne reçoit **aucun** événement sur l'Android émulé de
Playwright — pas même un `pointerdown` —, là où le fond de carte les reçoit tous
et où iOS répond normalement. Le geste peut donc être mort sur Android. On verra
en production ; c'est un ajout, il n'enlève rien à ce qui marchait.

### Un aiguillage carte / schéma sous 900 px

Au-dessus de 900 px la carte est épinglée à côté de la pile : rien à aiguiller,
et la feuille de style masque le bouton. En dessous, la carte défile avec la page
et disparaît dès qu'on travaille sur le schéma.

```
┌──────────────────────┐        ┌──────────────────────┐
│  schéma qui défile   │        │                      │
│                      │  🗺️    │        CARTE         │
│  ── (2) 🖼️🗺️🗑️      │  ───►  │     (1)  (2)  (3)    │
│                      │        │                      │
│ 🗺️Carte  📍Ajouter   │        │ 🖼️Schéma             │
└──────────────────────┘        └──────────────────────┘
                                     clic sur (2)
                                          │
                                          ▼
                                 la carte se retire,
                                 le schéma vient au repère 2
```

Trois choses valent d'être dites :

- **Le libellé dit où l'on va, pas où l'on est** : « 🗺️ Carte » puis « 🖼️ Schéma ».
  C'est un aiguillage, pas un interrupteur d'état — un `aria-pressed` sur un
  libellé qui change dirait deux fois la même chose, dans deux sens contraires.
- **Désigner un point referme la carte.** La garder ouverte cacherait exactement
  ce qu'on vient de demander à voir.
- **La carte doit se remesurer** : son conteneur passe de 45 vh à plein écran sans
  que la fenêtre bouge, donc sans `resize`. D'où `resized()` au port — sans lui,
  la carte garde les tuiles et les marqueurs à l'échelle de la vignette qu'elle
  était. Le bouton d'ajout de point s'efface tant qu'elle couvre le schéma : il
  n'y a rien à placer sur une image qu'on ne voit pas.

### Ce que le domaine rend

`progressOfPoint` et `pageNumberOfPoint` ne servaient qu'à la phrase de la liste,
comme `pointDescriptionText` et `PointRow` : tout part, avec les témoins qui les
protégeaient. `numberedImagesInReadingOrder` reste — c'est elle qui numérote les
pages, et la pastille dans le coin de chaque image reste utile pour savoir
laquelle on parcourt.

`centerOn` part aussi : plus personne ne le demande. Désigner un point sur la
carte ne recadre pas la carte — on vient de cliquer le marqueur, on le voit ; lui
imposer le zoom 12 changerait l'échelle sous les doigts sans qu'on l'ait demandé.

## Ce que les tests prouvent

| Fichier                         | Ce qu'il prouve                                                                                                                                                                                            |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LeafletCarteDesPoints.test.ts` | Un clic sur un marqueur rapporte **son** point et ne déplace rien. Une remesure demandée fait suivre la taille de la carte.                                                                                |
| `TrajetEditorScreen.test.ts`    | Désigner un point amène son repère (le bon, pas un voisin). La bascule ouvre la carte, demande la remesure, change le libellé, et se referme quand on désigne un point. Chaque repère porte sa coordonnée. |
| `e2e/points.spec.ts`            | Sur les cinq navigateurs : le repère hors écran vient à l'écran, et sous 900 px la carte couvre le schéma puis s'en retire.                                                                                |

Les mesures d'e2e passent des phrases aux **cadres** : la hauteur d'un point sur
sa page se lit sur son repère (`hauteurDuRepere`), et non plus dans un texte à
côté. Ces mesures sont réessayées — chaque écriture reconstruit la pile, et une
mesure prise entre deux rendus lirait l'ancienne position.

Une assertion tombe au passage : l'ordre DOM des marqueurs Leaflet suit leur
**latitude**, pas leur numéro. Vérifier `['1', '2']` sur la carte ne tenait que
tant que deux points partageaient la même latitude.

## Écarté

- **Garder l'avancement en % quelque part.** Rien ne le porte plus : sur le
  schéma, on est déjà à l'endroit qu'il décrivait. L'aperçu du suivi montre la
  même mesure, là où elle sert — pendant le voyage.
- **Recadrer la carte sur le point désigné** (voir plus haut : le zoom imposé).
- **Contourner le silence d'Android** (écouter `touchend` et interroger
  `dragging.moved()` à la main) : de l'ingénierie contre une bizarrerie de
  navigateur, avant d'avoir constaté la bizarrerie sur un vrai appareil.
- **Replier la liste au lieu de la supprimer** : la redondance des trois actions
  serait restée, avec un état de plus à tenir.

## Fichiers touchés

| Fichier                                              | Nature                                      |
| ---------------------------------------------------- | ------------------------------------------- |
| `src/trajets/ui/PointRow.ts` + `.html`               | supprimés                                   |
| `src/trajets/domain/Trajet.ts` + test                | perd `progressOfPoint`, `pageNumberOfPoint` |
| `src/trajets/domain/presentation.ts` + test          | perd `pointDescriptionText`                 |
| `src/trajets/ui/intents.ts`                          | perd `show-point`                           |
| `src/trajets/ui/PointMarker.ts`                      | porte la coordonnée en infobulle            |
| `src/trajets/ui/TrajetEditorScreen.ts` + `.html`     | perd la liste, gagne l'aiguillage           |
| `src/carte/ports/CarteDesPointsPort.ts`              | `onShow`, `resized` ; perd `centerOn`       |
| `src/carte/adapters/LeafletCarteDesPoints.ts` + test | idem                                        |
| `src/style.css`                                      | perd la liste, gagne `.carte-ouverte`       |
| `e2e/*`                                              | les repères remplacent les lignes           |
| `docs/EXIGENCES.md`, `README.md`, `GLOSSAIRE.md`     | mis d'accord                                |
