# Aller à la carte depuis le repère — conception

La carte sait déjà emmener au schéma : cliquer un marqueur numéroté fait défiler
la pile jusqu'au repère du même point ([GR-11](../../EXIGENCES.md), acquis en
supprimant la liste des points). Le chemin inverse manque. Depuis un repère, rien
ne dit où ce point se trouve dans le monde, alors que la pastille annonce
précisément lequel c'est.

Le repère devient donc un aller-retour : **le numéro emmène à la carte, le
marqueur ramène au schéma.**

## Décision

### La pastille numérotée devient un bouton

Cliquée, elle amène la carte sur son point :

```
┌──────────────────────┐        ┌──────────────────────┐
│  schéma qui défile   │        │                      │
│                      │        │                      │
│  ── (2) 🖼️🗺️🗑️      │  ───►  │         (2)          │
│      ▲               │        │                      │
│      clic            │        │ 🖼️Schéma             │
└──────────────────────┘        └──────────────────────┘
                                 la carte vient par-dessus,
                                 centrée sur le point 2
```

- **Sous 900 px**, la carte vient par-dessus le schéma — elle s'ouvre si elle
  était fermée, elle reste ouverte si elle l'était déjà.
- **Au-dessus de 900 px**, elle est déjà épinglée à côté de la pile : elle se
  contente de se recentrer. La classe `carte-ouverte` n'y est jamais posée, et
  c'est délibéré : `.carte-ouverte .carte-points` l'emporte en spécificité sur la
  règle du grand écran, donc la poser mettrait la carte en plein écran là où elle
  n'a rien à couvrir.
- **L'ordre compte** : la bascule demande la remesure (`resized()`), _puis_ on
  centre. L'inverse calerait le centre sur la taille de la vignette, avant que la
  carte n'occupe l'écran.

### Le cadrage : centré, au zoom d'un point unique

`centerOnCoordonnee` — `setView(…, 12)`, le même zoom pour toutes les cartes de
l'appli. On arrive toujours au même niveau de détail, quel que soit le cadrage
d'où l'on vient. Un `panTo` qui conserverait le zoom laisserait le point au
centre d'un cadrage d'ensemble : visible, mais pas « au niveau du point », qui
est ce qui est demandé.

C'est le sens inverse de ce que la conception précédente avait tranché, et sans
la contredire : elle refusait de recadrer la carte **quand on venait d'y
cliquer** — le point était sous les yeux, lui imposer un zoom changeait l'échelle
sans qu'on l'ait demandé. Ici on arrive d'ailleurs, et il n'y a rien à voler.

### Pendant le placement, la pastille redevient transparente

Le repère est transparent aux clics (`point-marker { pointer-events: none }`) :
seuls ses trois boutons flottants les interceptent. Rendre la pastille cliquable
lui ferait avaler, en mode placement, les clics qui visent une hauteur.

Une règle suffit à l'éviter :

```css
.placement-active .point-number {
    pointer-events: none;
}
```

Deux modes, deux significations, et aucune ambiguïté : tant qu'on vise une
hauteur, toute l'image est cible ; le reste du temps, la pastille emmène à la
carte.

Reste un état intermédiaire, assumé : sur grand écran, entre le clic sur l'image
et le clic sur la carte, la carte attend une coordonnée sans que
`.placement-active` soit posée. Une pastille cliquée recentre alors la carte sans
résoudre le choix — ce qui aide à viser plutôt que de gêner.

### La coordonnée quitte l'infobulle pour une donnée

Une suite de décimales n'est lisible par personne : `title="Coordonnée : 44.8260,
-0.5560"` n'apprenait rien à qui la survolait, et la pastille a mieux à annoncer
que ça — son action.

Elle ne disparaît pas pour autant du document. `<point-marker>` porte
`data-coordonnee="44.826,-0.556"` : la donnée reste là où le point est posé, sans
être montrée. C'est ce qui permet aux témoins de continuer à la relire — et
l'application n'expose sa coordonnée nulle part ailleurs, ni en clair, ni au
survol.

Le format change avec l'usage : les deux degrés bruts, séparés d'une virgule,
sans préfixe ni arrondi. `pointCoordonneeText` formatait une phrase pour un
humain ; elle perd son dernier appelant et part, avec son bloc de test.

## Ce qui bouge

| Fichier                                                      | Nature                                                                |
| ------------------------------------------------------------ | --------------------------------------------------------------------- |
| `src/carte/ports/CarteDesPointsPort.ts`                      | `centerOn(coordonnee)` revient                                        |
| `src/carte/adapters/LeafletCarteDesPoints.ts` + test         | délègue à `centerOnCoordonnee`, déjà écrite                           |
| `src/trajets/ui/intents.ts`                                  | gagne `show-point-on-carte` (`PointIntent`)                           |
| `src/trajets/ui/PointMarker.html`                            | la pastille devient un `<button type="button">`                       |
| `src/trajets/ui/PointMarker.ts`                              | émet l'intention ; `data-coordonnee` remplace le `title`              |
| `src/trajets/ui/TrajetEditorScreen.ts` + test                | écoute l'intention, ouvre la carte au besoin, centre                  |
| `src/trajets/domain/presentation.ts` + test                  | perd `pointCoordonneeText`                                            |
| `src/style.css`                                              | `padding: 0`, `pointer-events` de la pastille et du mode placement    |
| `e2e/helpers.ts`                                             | `coordonneeDuPoint` lit l'attribut ; `ecartAuCentreDeLaCarte` ressert |
| `e2e/points.spec.ts`, `gps.spec.ts`, `carte-editeur.spec.ts` | témoins déplacés vers l'attribut, scénario ajouté                     |
| `docs/EXIGENCES.md`                                          | GR-15 ajoutée, GR-10 réécrite                                         |

### Le port parle coordonnées, pas identifiants

```ts
centerOn(coordonnee: Coordonnee): void;
```

`centerOn` était au port jusqu'au commit qui a supprimé la liste des points,
retiré alors « parce que plus personne ne le demande ». Quelqu'un le redemande, à
l'identique. C'est l'écran, qui tient l'agrégat, qui traduit `PointId →
Coordonnee` — même règle que `chooseCoordonnee`, qui reçoit déjà une coordonnée
initiale et non un point.

### L'écran

```ts
function showPointOnCarte(pointId: PointId): void {
    const currentTrajet = trajet;
    if (currentTrajet === null) {
        return;
    }
    if (!isLargeScreen() && !root.classList.contains('carte-ouverte')) {
        toggleCarte();
    }
    carteDesPoints.centerOn(trajetPoint(currentTrajet, pointId).coordonnee);
}
```

`trajetPoint` existe déjà et lève si le point n'appartient pas au trajet :
l'écran ne montre que ce que l'agrégat contient.

### Le bouton, et ce que la feuille de style doit rattraper

La pastille devient un `<button type="button" class="point-number">` portant
`aria-label` **et** `title` « Voir le point 5 sur la carte ». Elle est construite
à la main plutôt que par `createButton` : cette fabrique assemble un pictogramme
et un libellé, là où la pastille est une forme — un disque de taille fixe, centré
sur son trait, identique à celui de la carte (GR-13). Le nom accessible que
`createButton` rend obligatoire est donc porté ici par un témoin dédié.

Trois ajustements, et un cadeau :

- `padding: 0` dans la règle partagée pastille-schéma / pastille-carte : la règle
  globale `button` en pose une qui déformerait le disque. La poser dans la règle
  partagée garde les deux pastilles identiques, ce qui est sa raison d'être.
- `pointer-events: auto` sur `point-marker .point-number`, le repère étant
  transparent aux clics.
- `.placement-active .point-number { pointer-events: none }`, ci-dessus.
- `cursor: pointer` arrive gratuitement avec `button` — c'est lui qui dira que ça
  se clique.

Le reste du disque tient sans rien changer : `background`, `border`,
`border-radius`, `display` et la fonte sont posés par un sélecteur de classe, qui
l'emporte sur le sélecteur de type `button`.

## Ce que les tests prouvent

| Fichier                         | Ce qu'il prouve                                                                                                                                                                                                                                            |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LeafletCarteDesPoints.test.ts` | `centerOn` amène la coordonnée au centre, au zoom d'un point unique.                                                                                                                                                                                       |
| `TrajetEditorScreen.test.ts`    | Cliquer la pastille du point 2 centre la carte sur **sa** coordonnée, pas celle d'un voisin. La carte s'ouvre si elle était fermée, et reste ouverte si elle l'était déjà. La pastille porte son nom accessible, et chaque repère sa donnée de coordonnée. |
| `e2e/points.spec.ts`            | Sur les cinq navigateurs : la pastille cale la carte sur son point. Sous 900 px, elle la met d'abord par-dessus le schéma.                                                                                                                                 |

`ecartAuCentreDeLaCarte` reprend du service : le helper — « zéro quand la carte
est calée sur ce point » — a survécu à la suppression de `centerOn` sans plus
avoir d'appelant. C'est exactement la mesure que ce geste demande.

Les quatre témoins qui lisaient l'infobulle changent d'attribut, pas de nature :
`getAttribute('title')` devient `getAttribute('data-coordonnee')`, dans le seul
helper qui les sert. Trois comparent un avant et un après (`points.spec` ×2,
`carte-editeur.spec`) et gardent leur assertion qui réessaie, l'attribut restant
unique. Le quatrième (`gps.spec`) lit les degrés d'un point pour y placer le GPS
du navigateur : son expression régulière se simplifie — plus de préfixe à sauter
—, et les degrés ne sont plus arrondis à quatre décimales avant d'être rendus au
GPS.

**La branche « grand écran » ne se teste pas en unitaire** : `isLargeScreen()`
lit une variable CSS que jsdom ne calcule pas, et les tests de l'écran ne voient
donc jamais que le petit écran. C'est l'e2e qui la couvre — `chromium`, `webkit`
et `firefox` tournent à 1280 px, `iphone` et `android` en dessous de 900 —, avec
le `test.skip(width >= 900, …)` que la suite emploie déjà.

## Exigences

- **GR-15 (nouvelle)** — La pastille d'un point amène la carte sur lui : sous
  900 px elle la met par-dessus le schéma. Témoins :
  `U TrajetEditorScreen.test.ts`, `U LeafletCarteDesPoints.test.ts`,
  `E e2e/points.spec.ts`.
- **GR-10 (réécrite)** — La coordonnée d'un point est une donnée de son repère,
  jamais affichée : ni en clair dans l'écran, ni en infobulle. Témoins :
  `U TrajetEditorScreen.test.ts`, `E e2e/points.spec.ts`.

## Écarté

- **Mettre le marqueur en évidence après le centrage.** Il est au centre, c'est
  déjà la désignation. Une mise en avant temporaire demanderait un état de plus
  au port et une minuterie, pour un témoin qu'on écrirait mal.
- **Rendre tout le trait cliquable.** Il traverse la page : il volerait tous les
  clics de placement, et le clic droit avec.
- **Un quatrième bouton dans `.point-actions`.** Deux 🗺️ côte à côte, l'un qui
  déplace, l'autre qui montre.
- **Recentrer sans toucher au zoom.** Depuis le cadrage d'ensemble, on n'aurait
  rien gagné en détail — voir « Le cadrage ».
- **Supprimer la coordonnée du document.** Elle n'est lue par aucun humain, mais
  elle est la seule chose que quatre scénarios e2e peuvent relire pour prouver
  qu'un point a bougé, et la seule source d'où le scénario GPS tire les degrés
  qu'il envoie au navigateur. Un attribut la garde sans la montrer.
- **Garder l'infobulle de coordonnée telle quelle.** Elle occupait le survol de
  la pastille, qui a désormais son action à annoncer.
