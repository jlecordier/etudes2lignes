# Ma position sur les cartes — conception

L'application sait où est l'utilisateur : c'est même tout son sujet, et le schéma
défile pour le lui dire. Mais ses deux cartes l'ignorent. Sur la carte de
l'éditeur comme sur celle qui sert à choisir une coordonnée, on voit les points
du trajet et rien d'autre — pas soi.

Se situer par rapport à la ligne demande donc de deviner. Les deux cartes
gagnent un marqueur : **où je suis, pendant que je regarde où sont les points.**

Le sujet est vierge. Aucune spec, aucun plan, aucun ADR ne l'avait envisagé ni
écarté : il n'y a ni précédent à respecter, ni décision à contredire.

## Décision

### Ce que « ma position » désigne

**La position qui pilote l'application** : le GPS réel, remplacé par la position
simulée dès que le mode simulation est actif. Une seule « ma position » dans
toute l'application — jamais deux vérités à l'écran, jamais un marqueur qui
raconte l'inverse du schéma qui défile juste à côté.

### Les deux cartes reçoivent un flux, et s'y abonnent elles-mêmes

`carte/` n'importe aujourd'hui que `trajets/domain/{Coordonnee,ids}` et
`shared/dom`. Elle continue : ce qu'elle reçoit est un type qu'elle s'écrit à
elle-même, où l'état d'une source de position n'apparaît jamais.

```ts
// src/carte/ports/CarteDesPointsPort.ts, à côté de DisplayedPoint,
// que les deux ports carte se partagent déjà.
export type DisplayedPosition =
    | { readonly kind: 'connue'; readonly coordonnee: Coordonnee }
    | {
          readonly kind: 'approximative';
          readonly coordonnee: Coordonnee;
          readonly imprecisionMetres: number;
          readonly message: string;
      }
    | { readonly kind: 'inconnue'; readonly message: string };
```

`message` est une phrase **déjà rédigée par l'écran**, avec le `sourceStatusText`
qui existe. La carte l'affiche sans jamais apprendre `SourceStatus` : la règle de
dépendance reste ce qu'elle est, et il n'y a toujours aucune arête
`carte/ → suivi/` dans ce dépôt.

```ts
interface CarteDesPoints {
    // Nouveau. Exige d'avoir été montée, comme toute méthode sauf `unmount` et
    // `cancelChoice` ; rappelée, elle referme l'abonnement précédent.
    showPosition(position$: Observable<DisplayedPosition>): void;
    // … le reste inchangé ; centerOn(coordonnee) existe déjà et sert au bouton
}

interface CoordonneeSelector {
    choose(
        initialCoordonnee: Coordonnee | null,
        reperes: readonly DisplayedPoint[],
        position$: Observable<DisplayedPosition>, // nouveau, exigé
    ): Promise<Coordonnee | null>;
}
```

`position$` est **exigé**, jamais facultatif — pour la raison que
`CoordonneeSelectorPort` écrit déjà à propos des repères : « les rendre
facultatifs a suffi à faire diverger cette carte de celle de l'éditeur ». Qui n'a
rien à montrer passe `EMPTY`.

L'abonnement meurt **structurellement**, et c'est ce qui décide de cette forme
plutôt que d'une consigne impérative : côté plein écran il pend au `Subject`
`choix`, celui-là même qui résout la promesse — le geste qui termine le choix
referme l'abonnement, il n'y en a pas deux à faire. Côté éditeur il meurt avec
`unmount()`. **Il n'y a pas de méthode de sortie à ne pas oublier**, ce que
l'[ADR 0009](../../adr/0009-flux-du-temps-en-rxjs.md) et le contrat de
`PositionSource` demandent tous deux mot pour mot.

### Une position trop imprécise pour caler la page reste bonne à montrer

`usableFix` écarte les fixes plus grossiers que 3 km, et son commentaire dit
pourquoi : « Ce fix est-il assez précis pour **caler la page** ? […] la valeur
doit rester en-deçà de `SEUIL_MINIMUM_METRES`, sinon l'imprécision d'un fix
accepté suffirait, à elle seule, à faire croire qu'on a quitté la ligne. »

C'est une règle de **décision**, et une carte ne décide rien. Un fix à ± 8 km ne
peut pas choisir une page du schéma, mais il situe très bien sur une carte de
France. Sa coordonnée n'était pourtant jetée en chemin par personne
délibérément : `imprecisions$` n'en gardait que l'`accuracy`, parce qu'aucune
carte n'attendait le reste.

L'état la garde désormais :

```ts
| { kind: 'imprecise'; imprecisionMetres: number; position: Coordonnee }
```

Une coordonnée est une mesure comme les mètres et les millisecondes qui
l'accompagnent : l'état continue de ne rédiger aucune phrase. Le suivi, lui, ne
change pas d'un iota — il ne cale la page que sur un événement `position`, et un
fix grossier n'en produit toujours aucun.

La carte pose alors le marqueur **et le cercle d'incertitude à son vrai rayon**.
La mesure est là, autant la dire honnêtement : un halo décoratif laisserait croire
à une précision que personne n'a mesurée, alors qu'un disque de 8 km de rayon dit
exactement ce qu'il en est.

Le chien de garde répète cet état tant que le fix est frais, puis se tait — la
règle qui existe déjà, et sa raison aussi : « annoncer ± 1 km sur la foi d'un fix
vieux d'une minute reviendrait à l'inventer ». Le marqueur approximatif hérite de
cette péremption sans qu'on ait à l'écrire.

### Le cadrage englobe la position — mais seulement si elle est déjà connue

```ts
export function fitToPoints(
    carte: L.Map,
    points: readonly DisplayedPoint[],
    position: Coordonnee | null,
): void;
```

Les bornes couvrent les points **et** la position ; ni l'un ni l'autre, c'est la
vue France. Une seule règle pour les deux cartes — la raison d'être de
`fitting.ts`, écrit précisément parce que les deux adapters avaient divergé.

**Le cadrage n'utilise que ce qu'on sait à l'instant où il se calcule**, et ne se
refait jamais à l'arrivée d'une position. Un recadrage deux secondes après
l'ouverture serait un saut sous les doigts, pour une information que le bouton
donne à la demande. En pratique l'élargissement joue surtout là où il sert : la
carte plein écran ouverte depuis le suivi, où l'écran connaît déjà une position
et la rejoue à qui s'abonne.

Le centrage sur une `initialCoordonnee` reste ce qu'il est — on y arrive
d'ailleurs, il n'y a pas de cadrage à préserver. La position peut donc y tomber
hors champ, et c'est le bouton qui la rattrape.

### Le GPS ne tourne que tant qu'une carte est regardée

L'écran de suivi n'ouvre **aucune** seconde session : il rediffuse ce qu'il reçoit
déjà, dans un `BehaviorSubject<DisplayedPosition>` alimenté par l'abonnement
existant. Un second abonné à `events$` ouvrirait un second `watchPosition`, un
second chien de garde et un second throttle — le port l'annonce (« deux abonnés
ouvrent deux sessions qui s'ignorent ») et sa suite de contrat le vérifie.

Étant un `BehaviorSubject`, il rejoue sa dernière valeur **synchroniquement** à
qui s'abonne : c'est ce qui fait marcher le cadrage « si déjà connue » sans le
moindre test de nullité.

La menace est connue et porte un nom : c'est le bug que `resetSuivi` a déjà
corrigé une fois — une position simulée périmée relue comme la vraie —, et il
reviendrait ici sur une carte. Mais **cette mémoire-là n'a rien à effacer**, et
ce n'est pas un oubli : le contrat de `PositionSource` veut qu'une source
_commence toujours par un état_, avant la moindre position. La source qui arrive
annonce donc `attente`, ce qui écrase l'ancienne position d'elle-même, dans le
même tour synchrone que la bascule. Une remise à zéro écrite en plus serait un
mutant équivalent, et ce dépôt refuse d'en fabriquer. Ce qui protège la garantie
dont elle dépend, c'est `positionSourceContract.ts`.

L'écran d'édition, lui, gagne une dépendance `positionSource: PositionSource`,
câblée dans `main.ts` sur le `realSource` déjà instancié. La règle de niveau de
ce lot s'applique ici aussi : une lecture DOM brute (`classList.contains`) ne se
mélange pas à un drapeau applicatif (`fullscreenChoice`) dans une même
expression — chacun a son nom, et une troisième fonction compose les deux :

```ts
function isCarteOverSchema(): boolean {
    return root.classList.contains('carte-ouverte');
}

function isEmbeddedCarteVisible(): boolean {
    return isLargeScreen() || isCarteOverSchema();
}

/** Une carte est-elle sous les yeux ? Le GPS ne tourne que dans ce cas. */
function isAnyCarteVisible(): boolean {
    return isEmbeddedCarteVisible() || fullscreenChoice;
}
```

poussée dans un `BehaviorSubject` (`carteVisible$`) par trois déclencheurs — la
bascule carte/schéma, un redimensionnement de fenêtre qui traverse le seuil des
900 px (nouvel écouteur, sous `takeUntil(parti$)`), et le `try`/`finally` qui
encadre le choix sur la carte plein écran. Puis :

```ts
switchMap((visible) => (visible ? positionSource.events$ : EMPTY));
```

la forme même que `SuiviScreen` emploie déjà pour changer de source. Replier la
carte referme la session ; la déplier en rouvre une, qui annonce `attente` avant
toute position et efface donc d'elle-même le marqueur périmé.

Le flux est partagé (`shareReplay`) entre la carte intégrée et le bandeau de
l'écran : deux abonnés, une seule session.

**La traduction `SourceEvent → DisplayedPosition` est écrite deux fois**, une par
écran. C'est le choix que ce dépôt a déjà fait et documenté pour
`pointsForCarte` : « la conversion vers le port appartient à l'adaptateur
entrant : c'est une ligne, et la partager entre deux capacités obligeait l'écran
de suivi à emprunter un module à l'interface des trajets ». La mutualiser
demanderait ici de faire dépendre `suivi/domain` d'un port de `carte/`.

### En simulation, la carte ne répète pas

Ouvrir la carte plein écran depuis le suivi **en simulation**, c'est venir
déplacer la position simulée — que `choose(simulation.lastPosition, …)` pose déjà
comme marqueur de sélection. Y ajouter « ma position » au même endroit
dessinerait deux symboles sur une seule coordonnée, dont l'un n'apprendrait rien.

L'écran passe donc `EMPTY` dans ce seul cas. Ce qui demande à l'écran de suivi de
retenir son mode dans un local, écrit par le `tap` qui pilote déjà `resetSuivi` —
la bascule reste gouvernée par le flux, seul son dernier état est relu.

Attention au faux raccourci : `initialCoordonnee !== null` **ne dit pas** qu'on
est en simulation. Après avoir quitté la simulation, `simulation.lastPosition`
survit, et rouvrir la carte en mode GPS doit bien montrer le GPS.

### Le marqueur, le cercle, le bouton, le message

- **Le marqueur** est un `DivIcon` de classe `carte-position-marker`, avec
  `iconSize: undefined` et **toute sa géométrie dans `style.css`** — la règle que
  `numberedIcon` a payée pour établir (« une taille écrite deux fois finit par
  donner deux pastilles différentes »), centrage par marge négative et non par
  `iconAnchor`. Sélecteurs scopés sous `.carte-points` et `#carte-container` :
  `leaflet.css` arrive après dans le bundle, et son
  `.leaflet-marker-icon { display: block }` écraserait un sélecteur de même
  poids. Un disque bleu cerclé de blanc — ni la pastille rouge numérotée d'un
  point, ni l'épingle bleue du marqueur de sélection.
- **`interactive: false`**, comme les repères et pour la raison que le port écrit
  déjà : « cliquer dessus revient à cliquer la carte à cet endroit ». Un marqueur
  qui avale le clic saboterait la seule raison d'être de cette carte.
- **Le cercle** est un `L.circle` de rayon `imprecisionMetres`, non interactif,
  habillé par une classe CSS. Il n'apparaît que sur une position
  `approximative` : une position acceptée ne transporte aucune incertitude, et
  n'en inventera pas.
- **Le bouton « ma position » et le message vont chacun à leur place naturelle**,
  quitte à être écrits deux fois. Sur la carte plein écran, dans la `.carte-bar`
  qui existe. Dans l'éditeur, dans une barre attachée à la colonne de la carte —
  laquelle doit suivre la carte quand elle passe par-dessus le schéma sous
  900 px, ce qui déplace la règle `.carte-ouverte` de `.carte-points` vers la
  colonne qui l'enveloppe. Des contrôles posés en `L.Control` par-dessus les
  tuiles auraient évité la duplication ; ils auraient aussi mis un bandeau de
  texte sur la carte de l'éditeur, qui est étroite.
- **Le bouton est inerte tant que la position est inconnue.** Il s'écrit
  « 🎯 Ma position » — le pictogramme est libre, `📍` servant déjà à placer et
  `🧭` à suivre — et porte son `aria-label` : sous 560 px les libellés visibles
  disparaissent, et un bouton qui l'oublie s'annonce « 🎯 » (QA-5). Il amène la
  carte sur la position au zoom d'un point unique — `centerOn`, déjà au port,
  déjà employé par « aller au point ».
- **`'inconnue'` avec un `message` vide** ⇒ ni marqueur, ni cercle, ni phrase.
  C'est ce que dit un écran qui ne sait encore rien.
- `LeafletCarteDesPoints` **n'affiche pas le `message`** : la carte de l'éditeur
  n'a pas de barre à elle, et c'est l'écran qui le rend dans la sienne. Le champ
  n'est pas mort pour autant — la carte plein écran le lit. Le jour où la carte
  intégrée aura sa propre barre, elle le lira aussi.

## Ce qui bouge

| Fichier                                                | Nature                                                                                        |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `src/carte/ports/CarteDesPointsPort.ts`                | `DisplayedPosition` ; `showPosition(position$)` au port                                       |
| `src/carte/ports/CoordonneeSelectorPort.ts`            | `choose` gagne `position$`, exigé ; au passage `choisir` → `choose` dans le contrat rédigé    |
| `src/carte/adapters/fitting.ts` + test                 | `fitToPoints` gagne la position                                                               |
| `src/carte/adapters/positionLayers.ts` (nouveau)       | les couches de la position — disque et cercle —, posées par un seul code pour les deux cartes |
| `src/carte/adapters/LeafletCarteDesPoints.ts` + test   | `showPosition` ; marqueur, cercle ; l'abonnement meurt avec `unmount`                         |
| `src/carte/adapters/LeafletCoordonneeSelector.ts` + t. | idem ; l'abonnement pend au `choix` ; barre et bouton câblés au constructeur                  |
| `src/suivi/domain/sourceStatus.ts`                     | `imprecise` porte la coordonnée qu'elle a mesurée                                             |
| `src/suivi/adapters/GeolocationPositionSource.ts` + t. | `imprecisions$` garde le fix entier ; le chien de garde répète sa coordonnée                  |
| `src/suivi/ui/SuiviScreen.ts` + test                   | `maPosition$` rediffusé ; mode retenu ; `EMPTY` en simulation ; remise à zéro                 |
| `src/trajets/ui/TrajetEditorScreen.ts` + test          | `positionSource` injecté ; `carteVisible$` ; barre de position ; écouteur `resize`            |
| `src/trajets/ui/TrajetEditorScreen.html`               | la colonne de la carte et sa barre (message + bouton)                                         |
| `src/main.ts`                                          | `realSource` injecté aussi dans l'éditeur                                                     |
| `index.html`                                           | `.carte-bar` gagne le message et le bouton                                                    |
| `src/style.css`                                        | marqueur, cercle, barre de position ; `.carte-ouverte` remonte sur la colonne                 |
| `docs/EXIGENCES.md`                                    | GR-17 à GR-23, CV-8                                                                           |
| `docs/GLOSSAIRE.md`                                    | une ligne dans la table **Métier**, et rien d'autre (voir ci-dessous)                         |
| `e2e/helpers.ts`, `e2e/gps.spec.ts`                    | la géolocalisation accordée, le marqueur relu                                                 |

**Piège de commit** : `LeafletCoordonneeSelector` fait ses `query` dans son
constructeur, sur des éléments de `index.html`. Le fragment DOM de
`LeafletCoordonneeSelector.test.ts` doit gagner le message et le bouton **dans le
même commit**, sinon la construction lève et les cas de ce fichier tombent tous.

**La liste close du Lexique ne bouge pas.** « Ma position » gagne une ligne dans
la table _Métier_ du glossaire, qui définit des concepts ; le
[Lexique](../../GLOSSAIRE.md#lexique), lui, est une liste close dont l'extension
« se discute, ça ne se décide pas en écrivant un identifiant ». `position` en est
absent, donc technique par défaut — sans conséquence, l'orthographe étant la même
dans les deux langues. `marqueur` reste traduit en `marker`, `coordonnée` et
`carte` restent français.

**`positionSourceContract.ts` ne bouge pas** : la suite de contrat n'assère nulle
part la forme de l'état `imprecise`. Seul `GeolocationPositionSource.test.ts` la
lit.

## Ce que les tests prouvent

| Fichier                             | Ce qu'il prouve                                                                                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fitting.test.ts`                   | Le cadrage englobe la position ; une position seule la centre ; ni points ni position ⇒ France.                                                                                                   |
| `LeafletCarteDesPoints.test.ts`     | `connue` pose un marqueur non interactif à la coordonnée ; `approximative` y ajoute un cercle du rayon mesuré ; `inconnue` retire les deux. Une position qui arrive **ne recadre pas**.           |
| `LeafletCoordonneeSelector.test.ts` | Les mêmes, plus : le cadrage d'ouverture englobe une position déjà connue ; le message atteint la barre ; le bouton reste inerte tant que la position est inconnue ; le choix résolu retire tout. |
| `GeolocationPositionSource.test.ts` | Un fix trop grossier annonce désormais **où** il l'était, et le chien de garde répète cette coordonnée tant qu'elle est fraîche — puis se tait.                                                   |
| `SuiviScreen.test.ts`               | En GPS le flux passé au sélecteur porte la position ; en simulation il ne porte rien ; changer de mode le remet à « inconnue ».                                                                   |
| `TrajetEditorScreen.test.ts`        | Le message atteint le bandeau ; le bouton porte son nom accessible et amène la carte sur la position.                                                                                             |
| `e2e/gps.spec.ts`                   | Sur les cinq navigateurs, géolocalisation accordée : le marqueur apparaît sur les deux cartes.                                                                                                    |

**Le désabonnement se constate par un état, jamais par un espion** : après
`unmount()`, et après un choix résolu, le `Subject` qu'on a passé répond
`observed === false`. C'est la même mesure que `LeafletCarteDesPoints` emploie
déjà en interne sur son `choix`.

**Que le GPS ne tourne pas carte repliée se prouve de même** : une fausse source
qui compte ses sessions ouvertes **dans son état** — comme `heldResources()` de
la suite de contrat, qui existe pour cela. Aucune session carte repliée, une
seule carte dépliée, zéro à la sortie de l'écran.

Deux angles morts connus, et déjà admis ailleurs. `isLargeScreen()` lit une
variable CSS que jsdom ne calcule pas : **la branche grand écran n'a pas de
témoin unitaire**, seule l'e2e la couvre. Et le mock de géolocalisation de
Playwright ne pousse qu'au changement, poussée qui peut tomber dans le throttle
de 10 s : on reprend le contournement de `gps.spec.ts` — rejouer
`visibilitychange`, le chemin « réveil du téléphone », qui remet le throttle à
zéro — plutôt que d'en inventer un autre. Un seul fichier e2e accorde la
géolocalisation aujourd'hui ; c'est là que le scénario va, ou dans un fichier qui
la déclare pareillement.

## Exigences

- **GR-17 (nouvelle)** — Les deux cartes montrent la position qui pilote
  l'application : le GPS réel, ou la position simulée quand la simulation est
  active. Témoins : `U SuiviScreen.test.ts`, `U TrajetEditorScreen.test.ts`,
  `E e2e/gps.spec.ts`.
- **GR-18 (nouvelle)** — Une position trop imprécise pour caler la page s'affiche
  quand même, cerclée de son incertitude mesurée. Témoins :
  `U GeolocationPositionSource.test.ts`, `U LeafletCarteDesPoints.test.ts`,
  `U LeafletCoordonneeSelector.test.ts`.
- **GR-19 (nouvelle)** — Sans position, aucun marqueur — et l'écran dit pourquoi,
  avec le texte d'état de la source. Témoins : `U TrajetEditorScreen.test.ts`,
  `U LeafletCoordonneeSelector.test.ts`.
- **GR-20 (nouvelle)** — Le cadrage englobe la position quand elle est déjà
  connue, et ne se refait jamais à l'arrivée d'une position. Témoins :
  `U fitting.test.ts`, `U LeafletCarteDesPoints.test.ts`,
  `U LeafletCoordonneeSelector.test.ts`.
- **GR-21 (nouvelle)** — « Ma position » amène la carte sur elle, au zoom d'un
  point unique, et reste inerte tant que la position est inconnue. Témoins :
  `U TrajetEditorScreen.test.ts`, `U LeafletCoordonneeSelector.test.ts`,
  `E e2e/gps.spec.ts`.
- **GR-22 (nouvelle)** — Le GPS ne tourne que tant qu'une carte est regardée :
  replier la carte referme la session, la déplier en rouvre une. Témoins :
  `U TrajetEditorScreen.test.ts`.
- **GR-23 (nouvelle)** — En simulation, la carte plein écran n'ajoute pas un
  second marqueur là où celui de la sélection porte déjà la position. Témoin :
  `U SuiviScreen.test.ts`.
- **CV-8 (nouvelle)** — Quitter l'éditeur, ou refermer la carte plein écran,
  referme l'abonnement à la position et retire son marqueur. Témoins :
  `U LeafletCarteDesPoints.test.ts`, `U LeafletCoordonneeSelector.test.ts`.

## Limites assumées

- **Le marqueur saute, il ne glisse pas.** Le suivi traite au plus une position
  toutes les dix secondes, et le marqueur en hérite. Le lisser demanderait une
  cadence propre à la carte, donc une seconde vérité sur où l'on est.
- **« trop imprécise pour caler la page » se lira aussi dans l'éditeur**, qui ne
  cale aucune page. Une seule plume rédige les états d'une source — c'est la
  règle, et dupliquer un rédacteur coûterait plus que cette approximation.
- **Un cadrage déclenché par l'ajout d'un point englobe lui aussi la position.**
  Ajouter un point depuis chez soi dézoomera donc sur la distance qui sépare de
  la ligne. C'est le prix d'une règle de cadrage unique, et `fitting.ts` existe
  parce que deux règles avaient déjà divergé une fois.

## Écarté

- **Que la carte reçoive `PositionSource` et s'abonne seule.** Première arête
  `carte/ → suivi/` du dépôt, arbitrage réel/simulé dans une couche qui ignore le
  mode, et une seconde session GPS ouverte en parallèle.
- **Une consigne impérative `showPosition(position)`**, dans le style de `show`
  et `centerOn`. L'écran devrait penser à effacer — et la `L.Map` du plein écran
  n'étant jamais détruite, un marqueur oublié survivrait à toute l'application.
  C'est la classe de bug que ce dépôt a éliminée en remplaçant un `resolve`
  mémorisé par un `Subject`.
- **Remonter le plafond de `usableFix`.** Il empêche le suivi de caler la page
  sur un fix plus vague que le seuil « hors trajet », et
  `PRECISION_MAXIMALE_METRES < SEUIL_MINIMUM_METRES` est asserté pour cela. Ce
  qu'il fallait, c'était laisser passer la coordonnée — pas relever le seuil.
- **Recadrer à l'arrivée du premier fix.** Un saut deux secondes après
  l'ouverture, pour une information que le bouton donne à la demande.
- **Recadrer tant que l'utilisateur n'a rien touché.** La carte bougerait sous
  les doigts au rythme du GPS, et volerait le cadrage réglé à la main.
- **Deux `L.Control` posés dans les coins des deux cartes.** Deux cartes
  identiques sans effort et `index.html` intact — mais des contrôles par-dessus
  les tuiles, et un bandeau de texte long dans le coin d'une carte étroite.
- **Un marqueur cliquable.** Il volerait le clic qui désigne une coordonnée,
  seule raison d'être de la carte plein écran. Le port l'écrit déjà pour les
  repères.
- **« Me placer ici » : choisir sa propre position comme coordonnée.** Utile, et
  c'est une autre fonctionnalité — elle change ce que « Valider » veut dire.
- **Une section « Ma position » à part dans les exigences.** Les deux cartes
  vivent déjà entièrement sous `GR` (GR-8, GR-11 à GR-13, GR-15) ; `SI-2` n'y
  couvre que le choix d'une position simulée.
- **Deux marqueurs en simulation, « moi » et « la position simulée ».** Deux
  symboles de plus à distinguer des pastilles numérotées, pour un écart que la
  ligne d'état dit déjà.
