# GrosseMadame — Suivi géolocalisé de schémas de ligne ferroviaires (PWA hors ligne)

## Contexte

L'utilisateur voyage en train avec des « schémas de ligne » (documents type conducteur, ex. `PMP-BX (ERTMS).pdf`, Paris→Bordeaux LGV SEA). Ces documents se lisent **de bas en haut** : le train « remonte » chaque page (PK croissants vers le haut), puis on passe au **bas** de la page suivante. Il veut une application web **100 % hors ligne** qui fait défiler automatiquement le document en fonction de sa position GPS réelle, après avoir géo-référencé des points du document sur une carte de France.

Le dossier contient déjà un exemple : `PMP-BX (ERTMS).pdf` (13 Mo, 6 pages) et `pmpbxenjpeg.zip` (les 6 pages converties en JPEG 2481×3508). Le projet part de zéro (pas de dépôt git, pas de code).

## Décisions validées avec l'utilisateur (questions fermées)

| Sujet | Décision |
|---|---|
| Format des documents | **Images uniquement** (JPEG/PNG) ; les PDF sont convertis en amont par l'utilisateur. Pas de pdf.js. |
| Appareils | iPhone (Safari), Android (Chrome), tablette, ordinateur — tous. |
| Installation | **Site hébergé + PWA** (GitHub Pages), ouvert une fois en ligne puis 100 % hors ligne (service worker, HTTPS). |
| Carte | **Leaflet** (confirmé face à OpenLayers) + tuiles OSM avec cache des tuiles vues (utilisables hors ligne ensuite). Leaflet embarqué dans le repo, pas de CDN. |
| Sens de lecture | **Bas → haut, toujours** (pas de réglage). |
| Défilement | **Interpolation linéaire** entre les deux points encadrants. |
| Ancrage à l'écran | Position courante à **1/4 du bas** de l'écran (les 3/4 supérieurs = trajet à venir). |
| Fréquence GPS | Une position traitée toutes les **~10 s**. |
| Hors trajet | Bandeau « hors trajet » sans défilement, seuil **adaptatif** : `max(5 km, 20 % de la longueur du segment le plus proche)` (un seuil fixe de 5 km serait dépassé à tort entre deux points éloignés). |
| GPS muet (tunnel, refus) | On garde la dernière position connue + texte « dernière position il y a X min ». Reprise automatique au retour du signal. |
| Affichage des points | **Marqueurs superposés sur les images + liste** récapitulative. |
| Édition d'un point | Redéplacer sur l'image, redéplacer sur la carte, ou supprimer. |
| Confirmations | **`confirm()` natif partout** : suppression de trajet, d'image et de point. |
| Réordonner les images | **Boutons ▲/▼** (pas de glisser-déposer). |
| Simulation | **Carte + saisie manuelle lat/lon** ; bandeau visible tant que la simulation est active. |
| Transfert entre appareils | **Non** — données locales à chaque appareil (pas d'export/import en v1). |
| Zoom sur les images | **Non** — pleine largeur, défilement vertical uniquement. |
| Nom du trajet | **Saisi à la création, renommable** ensuite. |
| Contraintes code | **Aucun framework UI** (pas de React) mais les bibliothèques sont permises (offline, stockage, carte). **TypeScript**, build **pnpm + Vite**, tests **Vitest** (« tester tout ce qui peut l'être »). Fonctions courtes à responsabilité unique, code lisible par n'importe qui, UI en français. |
| Architecture | **Hexagonale (ports/adapters)** + **screaming architecture** : dossiers par capacité métier (`trajets/`, `suivi/`, `carte/`), dépendances externes (GPS, IndexedDB, Leaflet, Wake Lock, horloge) derrière des ports, injection manuelle dans `main.ts` (composition root — pas de framework DI). |
| Nommage | **Mixte** : concepts métier en français (trajets, suivi, carte, point), suffixes techniques standards en anglais (Repository, Port, Adapter). |
| Modèle du domaine | **DDD avec value objects** : `Coordonnee`, `FractionVerticale`, `NomDeTrajet`, IDs typés ; agrégat `Trajet` qui protège les invariants (un point référence toujours une image du trajet, cascade de suppression = règle du domaine). |
| Démarche de test | **BDD dans Vitest et Playwright** : comportements spécifiés d'abord, tests nommés Étant donné / Quand / Alors, use-cases testés avec des fakes de ports. Pas de Cucumber/Gherkin (couche de glue inutile ici). |
| Tests E2E | **Playwright** sur **Chromium + WebKit + Firefox** (+ viewports mobiles émulés), contre le build de prod (`pnpm preview`) pour tester le service worker, avec géolocalisation mockée (`context.setGeolocation`) et mode hors ligne (`context.setOffline`). |
| Documentation | **Tout documenter** : README, `docs/ARCHITECTURE.md`, et surtout `docs/DEPLOIEMENT.md` (GitHub Pages pas à pas). TSDoc sur les ports et le domaine. |

## Approche retenue

PWA en **TypeScript sans framework UI**, construite avec **pnpm + Vite**. Stack validée avec l'utilisateur :

- **vite-plugin-pwa** (Workbox) : génère le service worker — precache automatique de l'app shell (liste de fichiers et versionnement gérés par le build, plus de 404 qui casse `cache.addAll`) + règle de cache runtime pour les tuiles OSM.
- **idb** (~1 Ko) : IndexedDB en async/await, transactions multi-stores propres.
- **leaflet 1.9.4** (npm) : la carte. Piège connu avec les bundlers : les icônes par défaut de Leaflet ne se résolvent pas — importer explicitement les images du marqueur (ou n'utiliser que des marqueurs personnalisés).
- **Vitest** (+ **fake-indexeddb**, jsdom au besoin) : tests unitaires de tout ce qui est testable.

Alternatives écartées : PDF natif ou pdf.js (complexité inutile, l'utilisateur convertit déjà ses PDF), OpenLayers (~3-4× plus lourd, API verbeuse, aucun besoin couvert en plus), Dexie (surdimensionné pour 3 stores), service worker écrit à la main (liste de precache manuelle = source classique de bugs hors ligne), JavaScript+JSDoc (TypeScript choisi par l'utilisateur).

### Architecture hexagonale + screaming (demande explicite, et justifiée)

Les deux portes d'escalade vers l'hexagonale sont présentes (référentiel Codeartify) : **isolation de dépendances externes nombreuses** (GPS navigateur, IndexedDB, Leaflet, Wake Lock, horloge, DOM) et **exigence forte de testabilité** sans navigateur (Vitest). Principes :

- **Le domaine ne dépend de rien** : fonctions et types purs (`Trajet`, points, projection géo, cible de scroll). Ni DOM, ni idb, ni Leaflet, ni `navigator.*`.
- **Les ports** sont des interfaces TypeScript définies par le métier : `TrajetRepository`, `PositionSource`, `EcranAllumePort` (wake lock), `HorlogePort`, `SelecteurDeCoordonneePort` (carte).
- **Les adapters** implémentent les ports en bordure : `IdbTrajetRepository`, `GeolocationPositionSource`, **`SimulationPositionSource` (la simulation n'est qu'un second adapter du même port — le mode test tombe gratuitement de l'architecture)**, `NavigateurEcranAllume`, `LeafletSelecteurDeCoordonnee`. L'UI (écrans DOM) est l'adapter entrant.
- **Composition root** : `main.ts` instancie les adapters et les injecte à la main (constructeurs/fonctions d'usine). Pas de framework d'injection.
- **Screaming architecture** : le premier niveau de `src/` crie le métier — `trajets/`, `suivi/`, `carte/` — chaque capacité contenant son `domain/`, ses `ports/`, ses `adapters/` et son `ui/`.

Le design a été passé en revue par un agent architecte ; ses corrections (toutes minimales) sont intégrées ci-dessous.

## Modèle du domaine (DDD) et persistance

### Agrégat et value objects (`src/trajets/domain/`)

- **Value objects** (validation à la construction, égalité par valeur, immuables) : `Coordonnee` (lat ∈ [−90, 90], lon ∈ [−180, 180]), `FractionVerticale` (∈ [0, 1] ; 0 = haut de l'image, 1 = bas), `NomDeTrajet` (non vide, sans espaces superflus). IDs typés légers (`TrajetId`, `ImageId`, `PointId`).
- **Agrégat `Trajet`** (racine) : images ordonnées (l'ordre du tableau = ordre du voyage, 1ʳᵉ image = début) + points géo-référencés. Méthodes d'intention, pas de setters : `renommer`, `ajouterImage`, `monterImage`/`descendreImage`, `supprimerImage`, `ajouterPoint`, `deplacerPointSurImage`, `deplacerPointSurCarte`, `supprimerPoint`, `ordreVoyageDesPoints()`.
- **Invariants protégés par l'agrégat** : un point référence toujours une image du trajet ; `supprimerImage` supprime ses points (**la cascade est une règle du domaine, pas un détail de base de données**) ; l'ordre voyage des points est calculé, jamais stocké : tri par (index de l'image ASC, puis `FractionVerticale` DESC — découle de la lecture bas→haut), aucun réordonnancement manuel des points.

### Persistance (IndexedDB via idb, adapter `src/trajets/adapters/IdbTrajetRepository.ts`)

Le port `TrajetRepository` est simple parce que l'agrégat porte les règles : `listerResumes()`, `charger(TrajetId)`, `sauvegarder(Trajet)` (**atomique : une seule transaction multi-stores**), `supprimer(TrajetId)`. Trois stores :

- `trips` : `{id, name, createdAt, imageIds: [id…]}`
- `images` : `{id, tripId, name, blob, width, height}` — `name` = nom du fichier importé (coût nul, ouvre la porte à un futur export des points).
- `waypoints` : `{id, tripId, imageId, yFraction, lat, lon}`

L'adapter mappe agrégat ↔ enregistrements des stores ; le domaine et le port ne connaissent pas IndexedDB.
- `lastTripId` en `localStorage` : si iOS tue la PWA, on rouvre directement le dernier trajet.
- `navigator.storage.persist()` au démarrage (une ligne, best effort contre l'éviction).

## Écrans (SPA, bascule de sections par show/hide, pas de routeur)

1. **Liste des trajets** : créer (saisie du nom), renommer, supprimer (confirmation), ouvrir.
2. **Édition d'un trajet** : ajouter des images (`<input type="file" multiple accept="image/jpeg,image/png">` — HEIC exclu volontairement), réordonner ▲/▼, supprimer une image (confirmation, cascade sur ses points) ; images empilées avec marqueurs superposés + liste des points ; ajout d'un point : « Ajouter un point » → tap sur l'image à la hauteur voulue → carte plein écran → tap sur la carte (ou saisie lat/lon) → enregistrer. Un texte d'aide recommande : « placez un point près du bas ET du haut de chaque page (même lieu à la jonction de deux pages) ». Édition d'un point : redéplacer sur l'image, redéplacer sur la carte, supprimer (confirmation).
3. **Suivi** : images empilées pleine largeur, défilement automatique, ligne repère fixe à 75 % de la hauteur du viewport, bouton flottant « Reprendre le suivi » dès qu'un défilement manuel est détecté, bandeau simulation, ligne d'état GPS (« dernière position il y a X min », « hors trajet », « pas assez de points »).
4. **Sélecteur de carte** (Leaflet plein écran, réutilisé pour : choisir un point, déplacer un point, simuler la position ; champ lat/lon manuel en secours).

### Rendu des images et des marqueurs (corrections de la revue)

- Chaque `<img>` reçoit ses attributs `width`/`height` (stockés à l'import) + CSS `width:100%; height:auto` : la mise en page est **figée avant tout décodage**, les offsets sont stables dès la construction du DOM, le tap de placement marche même image non chargée.
- `loading="lazy" decoding="async"` sur les images empilées (2481×3508 décodé ≈ 35 Mo/page — indispensable pour les documents longs sur iOS). Les object URLs sont révoquées en quittant un écran.
- Un waypoint n'a pas de position horizontale → marqueur = **ligne horizontale pleine largeur + étiquette**, positionnée en CSS pourcentage (`top: yFraction*100%`) dans un wrapper `position:relative` par image : responsive gratuit, zéro JS de repositionnement.
- Le tap de placement lit `getBoundingClientRect()` de l'image au moment du tap (jamais de dimensions mémorisées).

## Algorithme géo → scroll (`src/suivi/domain/projection.ts`, fonctions pures)

1. Waypoints en ordre voyage → offsets document en px : `offsetTop` de l'image rendue + `yFraction` × hauteur rendue. **Offsets relus à chaque tick GPS, jamais mis en cache** (immunité au resize/rotation, coût nul toutes les 10 s).
2. Position P : projection sur chaque segment `[Wi, Wi+1]` (approximation équirectangulaire, suffisante à l'échelle France), on garde le segment le plus proche, `t` = paramètre borné [0,1], `scrollCible = lerp(offset_i, offset_{i+1}, t)`, placée à 75 % du viewport, **bornée à `[0, scrollHeight − viewport]`**.
3. **Garde-fou segment de longueur nulle** (point de jonction dupliqué entre deux pages) : si `|AB|² < ε`, traiter le segment comme un point (`t = 0`) — sinon division par zéro.
4. **Adhérence de segment (anti-oscillation)** : mémoriser l'index du dernier segment retenu ; si un autre segment n'est pas nettement plus proche (< ~200 m d'écart), garder le segment courant ou son voisin immédiat. Sans ça, le bruit GPS ferait sauter le scroll entre le haut d'une page et le bas de la suivante à chaque tick.
5. Cas limites : < 2 points → bandeau « pas assez de points » ; distance min > seuil adaptatif `max(5 km, 0.2 × longueur du segment)` → bandeau « hors trajet » sans défilement ; avant le premier / après le dernier point → borné au premier/dernier.
6. Non-monotonie assumée : les offsets font des dents de scie aux changements de page (lecture bas→haut, pages empilées haut→bas). La projection « segment le plus proche » + le point dupliqué à la jonction gèrent ça.
7. **Détection du scroll manuel : `touchstart` + `wheel` uniquement** (intention humaine sans ambiguïté). On n'écoute pas `scroll` et il n'y a aucun drapeau « scroll programmé » — le smooth scroll rend cette approche par drapeau non fiable (événements tardifs, `scrollend` capricieux sur iOS).

## GPS et cycle de vie (`src/suivi/` : port `PositionSource` + adapters — là où se concentrent les pièges plateforme)

- **`watchPosition` throttlé** (au plus une position traitée toutes les ~10 s), et non `setInterval` + `getCurrentPosition` : pas de chevauchement de requêtes, puce GPS maintenue chaude, fixes plus rapides.
- **Rejet des fixes imprécis** : `coords.accuracy > 500 m` → ignoré.
- **Wake lock** (`navigator.wakeLock.request('screen')`) pendant le suivi : aucune web app ne reçoit le GPS écran éteint ou en arrière-plan (JS gelé sur iOS) — garder l'écran allumé est la seule réponse web. Ré-acquisition sur `visibilitychange` (le verrou est libéré quand la page est masquée). **Toujours dans un try/catch, échec non bloquant** : en PWA installée iOS, le wake lock n'est fiable que depuis iOS 18.4 (bug WebKit #254545 corrigé en mars 2025).
- Au retour au premier plan : demande de position immédiate + ré-acquisition du wake lock, sans attendre le prochain tick. Déclencheurs : `visibilitychange → visible` en principal, `pageshow` et `focus` en filet de sécurité iOS.
- **Permission géoloc sur iOS en PWA installée : redemandée à chaque session** (comportement iOS normal, pas un bug — à ne pas « corriger »). Ne pas se fier à `permissions.query` (renvoie `prompt` même après refus) : appeler directement `watchPosition` avec callback d'erreur + `timeout`, et afficher un message clair si l'utilisateur a mis Safari sur « Jamais » dans les réglages Localisation.
- Port minimal : `demarrer(onPosition, onErreur)` / `arreter()` — `SuiviScreen` ne voit rien des pièges plateforme.
- La simulation est un **second adapter du même port** (`SimulationPositionSource`) : on bascule la source injectée, l'écran de suivi ne change pas d'une ligne.

## Hors ligne

- **Service worker généré par vite-plugin-pwa** (Workbox, `generateSW`) : precache de l'app shell automatique (fichiers hashés listés par le build — versionnement et purge gérés), `registerType: 'autoUpdate'`. La règle runtime pour les tuiles : `CacheFirst` sur `tile.openstreetmap.org`.
- **GitHub Pages sert sous `https://<user>.github.io/<repo>/`** : configurer `base: '/<repo>/'` dans `vite.config.ts` (Vite et le plugin PWA en déduisent `start_url`, `scope` et les chemins de precache). Déploiement par GitHub Actions (workflow standard build → Pages).
- **Tuiles OSM** : cache runtime dédié, cache-first ; le handler `catch` proprement hors ligne (carte grise sans erreurs sur les zones jamais vues — acceptable, la carte ne sert qu'à l'édition/simulation). Conformité à la Tile Usage Policy OSMF : attribution « © OpenStreetMap contributors » visible sur la carte (Leaflet le fait par défaut), **aucun pré-téléchargement de tuiles non affichées** (seules les tuiles réellement vues sont mises en cache), usage personnel léger.
- **Indicateur « Disponible hors ligne »** affiché sur `navigator.serviceWorker.ready` (couvre le cas : première visite fermée avant la fin de l'installation).
- **Images des trajets** : blobs en IndexedDB (pas dans le cache SW).

## Faits plateformes vérifiés (juillet 2026, sources officielles)

- Géoloc en PWA standalone iOS : fonctionne, mais **permission redemandée à chaque session** (iOS 18/26 inclus).
- Stockage d'une PWA installée sur iOS : **exempté de l'éviction ITP 7 jours** (doc WebKit) ; quota ~60 % du disque depuis Safari 17 ; `storage.persist()` accordé sans prompt en web app installée.
- Wake Lock : Safari/iOS ≥ 16.4 et Chrome Android OK, mais fiable en PWA standalone iOS **seulement depuis iOS 18.4**.
- Écran verrouillé / arrière-plan : page suspendue sur iOS, géoloc coupée sur Chrome Android → reprise via `visibilitychange` (+ `pageshow`/`focus` sur iOS).
- **Leaflet stable = 1.9.4** (via npm ; la 2.0 est encore alpha — ne pas la prendre).
- `window.scrollTo({behavior:'smooth'})` : OK depuis iOS 15.4.
- Service worker sur GitHub Pages sous `/repo/` : OK, à condition de **tout référencer en chemins relatifs** (`register('./sw.js')`, precache `'./index.html'`, manifest `"start_url": "./"`, `"scope": "./"`).

## Limitations assumées (documentées, pas corrigées en v1)

- **Sens inverse** (Bordeaux→Paris sur un document Paris→Bordeaux) : le suivi fonctionne, mais l'ancre à 75 % montre alors surtout du « déjà passé ». Pas de toggle en v1.
- **Écran éteint = pas de suivi** : limite de la plateforme web ; le wake lock garde l'écran allumé pendant le suivi.
- **Premier lancement hors ligne** sur un appareil jamais venu : impossible par nature.

## Fichiers (screaming architecture, hexagone par capacité métier)

```
package.json / pnpm-lock.yaml / tsconfig.json
vite.config.ts                    — base '/<repo>/', vite-plugin-pwa (manifest + precache + cache tuiles OSM)
index.html                        — les 4 écrans (sections), UI en français
public/icons/                     — icônes PWA
README.md                         — vision, usage, démarrage (pnpm), structure
docs/ARCHITECTURE.md              — l'hexagone : schéma, ports/adapters, règles de dépendance
docs/DEPLOIEMENT.md               — GitHub Pages pas à pas (voir section Documentation)
.github/workflows/deploy.yml      — build + déploiement GitHub Pages

src/main.ts                       — composition root : instancie les adapters, injecte, démarre
src/style.css                     — simple, mobile d'abord

src/trajets/                      — capacité : gérer les trajets et leurs points
  domain/Trajet.ts                —   agrégat : images ordonnées + points, méthodes d'intention, invariants (cascade)
  domain/Coordonnee.ts            —   value object (lat/lon validées)
  domain/FractionVerticale.ts     —   value object (∈ [0,1])
  domain/NomDeTrajet.ts           —   value object (non vide)
  domain/ids.ts                   —   TrajetId, ImageId, PointId (types marqués)
  ports/TrajetRepository.ts       —   interface : listerResumes / charger / sauvegarder (atomique) / supprimer
  adapters/IdbTrajetRepository.ts —   idb : mapping agrégat ↔ stores trips/images/waypoints, une transaction par sauvegarde
  ui/ListeTrajetsScreen.ts        —   créer/renommer/supprimer/ouvrir
  ui/EditeurTrajetScreen.ts       —   import d'images, ▲/▼, points (marqueurs-lignes en % + liste)

src/suivi/                        — capacité : faire défiler le document selon la position
  domain/projection.ts            —   pur : équirectangulaire, projection segment (garde-fou longueur nulle),
                                        adhérence anti-oscillation, seuil adaptatif, lerp, clamp, cible de scroll
  ports/PositionSource.ts         —   interface : demarrer(onPosition, onErreur) / arreter()
  ports/EcranAllumePort.ts        —   interface wake lock (best effort)
  ports/HorlogePort.ts            —   interface : maintenant() + minuterie (testable aux fake timers)
  adapters/GeolocationPositionSource.ts — watchPosition throttlé ~10 s, filtre accuracy > 500 m,
                                        visibilitychange/pageshow/focus, erreurs explicites
  adapters/SimulationPositionSource.ts  — second adapter du même port : position choisie sur la carte ou saisie
  adapters/NavigateurEcranAllume.ts     — navigator.wakeLock, try/catch, ré-acquisition, no-op si échec
  ui/SuiviScreen.ts               —   scroll auto, ligne 75 %, « Reprendre le suivi », bandeaux d'état

src/carte/                        — capacité : choisir une coordonnée sur la carte de France
  ports/SelecteurDeCoordonneePort.ts    — interface : choisir(coordInitiale?) → Promise<Coordonnee | null>
  adapters/LeafletSelecteurDeCoordonnee.ts — Leaflet plein écran + champ lat/lon manuel

src/**/*.test.ts                  — tests Vitest à côté des modules (style BDD)

e2e/                              — tests Playwright (scénarios BDD Étant donné/Quand/Alors)
e2e/fixtures/                     — petites images de test générées (pas les vrais JPEG de 1,7 Mo)
playwright.config.ts              — projets chromium/webkit/firefox + viewports mobiles, webServer = pnpm preview
```

Règle de dépendance : `domain` ne dépend de rien ; `ports` ne dépendent que du domaine ; `adapters` et `ui` dépendent des ports et du domaine ; seul `main.ts` connaît les adapters concrets.

## Tests (BDD : Vitest en unitaire, Playwright en E2E)

« Tester tout ce qui peut l'être », comportement d'abord : chaque comportement est spécifié **avant** son implémentation, en français, nommé **Étant donné / Quand / Alors** (`describe`/`it`). L'hexagone rend ça naturel : le domaine se teste pur, les use-cases se testent avec des **fakes de ports** (un `FauxTrajetRepository` en mémoire, une `FauxPositionSource` pilotée à la main), sans navigateur.

### Unitaire (Vitest)

- `suivi/domain/projection.test.ts` — le cœur, exhaustif : projection sur segment (dont garde-fou longueur nulle), choix du segment le plus proche, adhérence anti-oscillation (positions bruitées autour d'une jonction de pages → pas de bascule intempestive), seuil adaptatif, lerp des offsets, clamp du scroll, cas < 2 points, positions avant/après les extrémités. Coordonnées réelles de la ligne (Massy, Vendôme, Poitiers, Angoulême) comme données de test.
- `trajets/domain/*.test.ts` — value objects (constructions invalides rejetées) et agrégat `Trajet` : « Étant donné un trajet de 3 images, quand je supprime la 2ᵉ, alors ses points disparaissent et l'ordre est préservé » ; ordre voyage (image ASC, `FractionVerticale` DESC) ; point vers image inexistante → refusé.
- `trajets/adapters/IdbTrajetRepository.test.ts` — avec **fake-indexeddb** : aller-retour agrégat ↔ stores, atomicité de `sauvegarder`, `supprimer` purge les trois stores.
- `suivi/adapters/GeolocationPositionSource.test.ts` — avec les fake timers de Vitest et un faux `navigator.geolocation` : throttle ~10 s, rejet des fixes `accuracy > 500 m`, reprise sur retour au premier plan.
- Logique de `SuiviScreen` extraite en fonctions pures testables (cible de scroll à partir des offsets + viewport ; machine d'état auto/manuel ; bandeaux à afficher).

### E2E (Playwright — Chromium + WebKit + Firefox, viewports mobiles émulés)

Contre le **build de prod** (`webServer: pnpm preview`) pour exercer le vrai service worker. Scénarios BDD :

- Étant donné une appli vierge, quand je crée un trajet et importe des images, alors elles s'affichent dans l'ordre (puis ▲/▼ le modifie).
- Étant donné un trajet géo-référencé, quand j'active la simulation entre deux points, alors le document défile pour placer l'endroit interpolé à 75 % du viewport.
- Étant donné le suivi actif, quand je scrolle manuellement, alors le suivi se coupe et « Reprendre le suivi » apparaît ; quand je le tape, ça se recale.
- Étant donné une géolocalisation mockée (`context.setGeolocation` + permission accordée), quand j'ouvre le suivi, alors la page se cale sur ma position ; quand la position change, la page suit.
- Étant donné l'appli visitée une fois, quand je passe hors ligne (`context.setOffline(true)`) et recharge, alors l'appli fonctionne (app shell servie par le service worker).
- Étant donné un trajet, quand je supprime une image contenant des points, alors la confirmation s'affiche et les points disparaissent avec elle.

Le vrai GPS dans un vrai train et les comportements PWA propres à iOS (permission redemandée, wake lock) restent en checklist manuelle.

## Documentation (« tout documenter »)

- **README.md** : à quoi sert l'appli, captures, démarrage (`pnpm install`, `pnpm dev`, `pnpm test`, `pnpm build`), comment préparer un trajet (conversion PDF→JPEG, conseils de placement des points), structure du projet en un coup d'œil.
- **docs/ARCHITECTURE.md** : schéma de l'hexagone (domaine / ports / adapters / composition root), règle de dépendance, comment ajouter un adapter (ex. une autre source de position), pourquoi la simulation est un adapter ; le modèle DDD (agrégat `Trajet`, value objects, invariants) et la démarche BDD (où vivent les comportements, comment en ajouter un).
- **docs/DEPLOIEMENT.md** (le plus soigné, demande explicite) : pas à pas GitHub Pages — création du dépôt, `base: '/<repo>/'` dans `vite.config.ts`, workflow Actions (`actions/upload-pages-artifact` + `actions/deploy-pages`), activation de Pages (Settings → Pages → GitHub Actions), première visite et installation PWA sur iPhone/Android, comment se déploie une mise à jour (`registerType: 'autoUpdate'`), pièges connus (chemins sous `/<repo>/`, cache navigateur).
- **docs/superpowers/specs/2026-07-10-suivi-schema-ligne-design.md** : la spec (contenu de ce plan), commitée au premier commit.
- **TSDoc** sur chaque port (contrat, erreurs possibles) et sur les fonctions du domaine (unités : mètres, fractions, px).

## Étapes d'implémentation (chacune livre quelque chose de testable)

Démarche BDD à chaque étape : les tests (Étant donné/Quand/Alors) sont écrits **avant** le code qu'ils spécifient ; les scénarios Playwright d'une fonctionnalité sont ajoutés à l'étape qui la livre.

1. Échafaudage : pnpm + Vite + TypeScript + Vitest + Playwright (3 navigateurs), arborescence hexagonale, `index.html`/`style.css`/`main.ts` (bascule de vues), spec commitée dans `docs/superpowers/specs/`.
2. `trajets/domain/` : value objects + agrégat `Trajet` (tests d'abord), port `TrajetRepository`, adapter idb + tests fake-indexeddb, écran liste des trajets complet (+ scénario E2E création/suppression).
3. Éditeur : import d'images, empilement avec dimensions réservées, ▲/▼, suppression en cascade (+ scénario E2E images/cascade).
4. `carte/` : port `SelecteurDeCoordonneePort` + adapter Leaflet ; flux d'ajout/édition de points + marqueurs-lignes en %.
5. `suivi/domain/projection.ts` pur + tests exhaustifs (coordonnées réelles de la ligne).
6. `SuiviScreen` piloté par la **`SimulationPositionSource` d'abord** (tout le scroll, la ligne 75 %, la coupure manuelle et « Reprendre le suivi » se valident sans GPS) (+ scénarios E2E simulation/scroll manuel).
7. `GeolocationPositionSource` + `NavigateurEcranAllume` + tests (throttle, précision, visibilité) ; bandeaux « dernière position il y a X min », « hors trajet » (+ scénario E2E géolocalisation mockée).
8. PWA + déploiement : config vite-plugin-pwa (manifest, precache, cache tuiles), restauration `lastTripId` (+ scénario E2E hors ligne), workflow GitHub Actions (tests unitaires + E2E + build + déploiement Pages), test sur GitHub Pages réel. Rédaction finale de README/ARCHITECTURE/DEPLOIEMENT (démarrés dès l'étape 1, complétés au fil de l'eau).

## Vérification de bout en bout

Automatique : `pnpm test` (Vitest) à chaque étape ; `pnpm test:e2e` (Playwright, 3 navigateurs, contre le build de prod) ; `pnpm build && pnpm preview` pour valider la PWA générée (le service worker ne tourne qu'en build, pas en dev).

Checklist manuelle :

- [ ] Importer les 6 pages PMP-BX, réordonner, rotation portrait/paysage → marqueurs toujours alignés.
- [ ] Simulation : point au milieu d'un segment → la ligne 75 % tombe au bon endroit sur l'image.
- [ ] Simulation : position exactement au PK de jonction de deux pages → une seule bascule de page, **aucune oscillation** en répétant la position à ±100 m.
- [ ] Simulation : position à 6 km d'un segment court → « hors trajet » ; même écart sur un segment de 100 km → pas d'alerte (seuil adaptatif).
- [ ] Trajet à 1 point → « pas assez de points ».
- [ ] Scroll manuel pendant le suivi → suivi coupé, bouton apparaît ; tap → recentrage ; le tap du bouton ne re-coupe pas le suivi.
- [ ] GPS réel (marche/voiture) : premier fix, verrouiller/déverrouiller l'écran → reprise immédiate ; l'écran reste allumé pendant le suivi (wake lock).
- [ ] Mode avion après une visite en ligne : app démarre, suivi simulé OK, carte grise sans erreur sur zones non visitées, tuiles déjà vues visibles.
- [ ] Installer sur l'écran d'accueil iOS, tuer l'app, relancer → dernier trajet restauré, images toujours en IndexedDB.
- [ ] Supprimer une image → ses points disparaissent (devtools > IndexedDB) ; supprimer le trajet → stores vides.
- [ ] Incrémenter la version du cache SW, recharger deux fois → nouvelle version servie, ancienne purgée.

## Statut

- [x] Exploration du contexte (PDF + JPEG examinés)
- [x] 26 questions fermées posées et répondues (toutes les décisions confirmées par l'utilisateur)
- [x] Revue d'architecture (agent) — corrections intégrées
- [x] Vérification des faits plateformes (agent, sources officielles) — intégrée
- [x] Stack précisée après retour utilisateur : TypeScript, pnpm + Vite + vite-plugin-pwa, idb, Leaflet, Vitest
- [x] Architecture précisée après retour utilisateur : hexagonale (ports/adapters), screaming architecture, nommage mixte, documentation complète (dont déploiement GitHub Pages)
- [x] Démarche précisée après retour utilisateur : DDD (value objects + agrégat `Trajet`), BDD (Étant donné/Quand/Alors dans Vitest et Playwright), E2E Playwright sur Chromium + WebKit + Firefox
