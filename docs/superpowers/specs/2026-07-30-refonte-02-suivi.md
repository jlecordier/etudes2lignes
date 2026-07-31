# Lot 02 — Suivi : port, politique, adapters

**Périmètre strict** : `src/suivi/domain/**`, `src/suivi/ports/**`,
`src/suivi/adapters/**` (+ leurs tests). **Pas `src/suivi/ui/**`.**

Règles communes : [index](2026-07-30-refonte-00-index.md#règles-communes-à-tous-les-lots).

## Constat général

C'est le lot au diagnostic le plus lourd : **quatre angles de relecture sur huit
l'ont trouvé indépendamment**. Le port `PositionSource` transporte des phrases
d'interface au lieu d'un état, ce qui a fait glisser la politique métier dans
l'infrastructure et la présentation dans un adapter sortant.

Ce lot **casse volontairement** `src/suivi/ui/SuiviScreen.ts`, que le lot 05
réparera. C'est attendu : ne pas y toucher, ne pas lancer `pnpm typecheck`.

## Correctifs

### 1. Le port transporte un état, pas une phrase

`PositionSource.ts:13` déclare `surErreur: (message: string) => void`. Résultat :
`GeolocationPositionSource` rédige cinq phrases destinées à l'utilisateur
(`:85`, `:147`, `:175`, `:181`, `:185`) et décide leurs arrondis (km à `:173`,
minutes à `:184`), alors que `suivi/domain/presentation.ts` est déjà le rédacteur
du texte d'état pour le même widget.

Remplacer le second rappel par un état typé du domaine, par exemple dans
`src/suivi/domain/etatDeLaSource.ts` :

```
type EtatDeLaSource =
  | { etat: 'attente' }
  | { etat: 'imprecise'; imprecisionMetres: number }
  | { etat: 'perdue'; ancienneteMs: number }
  | { etat: 'permission-refusee' }
  | { etat: 'indisponible' };
```

L'adapter **mesure** (mètres, millisecondes) ; `presentation.ts` **rédige**. Y
déplacer les cinq formulations à l'identique, à côté de `texteDEtatDuSuivi`, et
les tester purement (elles sont aujourd'hui assertées dans 342 lignes de jsdom :
`GeolocationPositionSource.test.ts:138,152,178,202,213,223`).

- Étant donné un état « imprécise » à 2 400 m, quand je rédige le texte d'état,
  alors j'obtiens « Position approximative (± 2 km) — trop imprécise pour caler
  la page. » (les libellés actuels sont conservés au caractère près).

### 2. La politique « ce fix est-il utilisable ? » remonte dans le domaine

`PRECISION_MAXIMALE_METRES = 3000` (`GeolocationPositionSource.ts:28`) est une
règle métier, parente du `SEUIL_MINIMUM_METRES = 5000` de `projection.ts:29`, et
rien ne lie les deux. Elle est aussi invisible pour le second adapter.

Déplacer le seuil et la décision dans `src/suivi/domain/`, en fonction pure
testable, avec un test qui **exprime le lien** entre les deux seuils (un fix
utilisable doit rester en-deçà du seuil « hors trajet »).

### 3. `SimulationPositionSource` doit honorer le contrat

`SimulationPositionSource.ts:15` reçoit `_surErreur` et l'ignore, alors que le
port le déclare obligatoire : en simulation, la ligne d'état conserve le dernier
message du GPS. Émettre l'état pertinent (au minimum `{ etat: 'attente' }` avant
la première position simulée).

### 4. Tests de contrat de port joués contre les deux adapters

Le port dit `arreter()` « coupe tout ; redémarrable » (`PositionSource.ts:8`)
mais rien ne le vérifie, et les deux adapters ont divergé. Écrire une **suite de
contrat** partagée, exécutée contre `GeolocationPositionSource` **et**
`SimulationPositionSource` :

- Étant donné une source démarrée puis arrêtée, quand la plateforme émet encore
  une position, alors aucun rappel n'est reçu.
- Étant donné une source arrêtée, quand je la redémarre, alors elle émet à
  nouveau.
- Étant donné une source déjà démarrée, quand je la démarre une seconde fois,
  alors il n'y a ni double abonnement ni minuterie orpheline.

### 5. `demarrer()` idempotent, `arreter()` complet

Un second `demarrer` écrase `annulerLeChienDeGarde` (`:89`) — la minuterie
précédente tourne alors **pour toujours** — et perd `idDeSurveillance` (`:101`),
fuitant un `watchPosition`. Et `arreter()` (`:112-124`) abandonne les rappels et
les poignées sans abandonner les cinq horodatages de la session (`:53-58`) : le
premier fix d'une nouvelle session peut être avalé par le throttle de la session
morte, et le chien de garde peut annoncer un silence hérité.

Introduire un **objet de session explicite** remplaçant les neuf champs mutables :

```
type Surveillance =
  | { readonly type: 'arretee' }
  | { readonly type: 'enCours'; /* rappels, poignées, horodatages de CETTE session */ };
```

`demarrer` crée la session (en fermant proprement une session en cours),
`arreter` l'abandonne d'un bloc.

### 6. Le « retour au premier plan » devient une couture injectée

Le concept est implémenté deux fois avec des jeux d'événements divergents :
`GeolocationPositionSource.ts:92-94` (trois écouteurs) et
`NavigateurEcranAllume.ts:15-23` (un seul). Et il n'est pas injecté, alors que la
géolocalisation, l'horloge et le cadenceur le sont — d'où le `jsdom` obligatoire
dans le test, et la branche « page masquée » jamais exercée.

Créer `src/suivi/ports/PremierPlan.ts` :

```
interface PremierPlan {
  surRetourAuPremierPlan(action: () => void): () => void; // rend le désabonnement
  estAuPremierPlan(): boolean;
}
```

Un unique adapter `NavigateurPremierPlan` (les trois écouteurs et
`visibilityState` en un seul endroit), injecté dans les deux adapters comme
dépendance optionnelle avec repli par défaut, sur le modèle exact de
`Cadenceur`. Ajouter un test de la branche « page masquée » avec un faux
premier plan écrit à la main.

### 7. `indexSegment` est cérémoniel : le retirer

`ResultatDeSuivi` (`projection.ts:20`) et `AncragePrecedent` (`:22-26`) portent
`indexSegment`, **jamais lu** : l'adhérence se décide sur l'écart de cible
(`:167-176`), pas sur l'index. Le modèle décrit un mécanisme qui n'existe pas.

Le retirer des deux types ; `AncragePrecedent` devient exactement ce qu'il est
(la cible retenue au tick précédent). Mettre à jour les tests concernés.

### 8. Le seuil de « longueur nulle » dit autre chose que son commentaire

`projection.ts:120` teste `longueurCarree < 1` — soit un mètre — sous un
commentaire qui parle de « segment de longueur nulle ». Nommer la constante
(`LONGUEUR_MINIMALE_DE_SEGMENT_METRES = 1`) et corriger le commentaire.

### 9. Utiliser le `borner` commun

Le lot 01 crée `src/commun/nombre.ts`. Remplacer la copie locale de
`projection.ts:202-204` par un import. **Vérifier que le fichier existe** avant :
si le lot 01 n'a pas encore fini, le signaler dans le rapport et laisser en place.

## Définition de terminé

- `pnpm exec vitest run src/suivi` est vert.
- La politique et les libellés sont testés **purement** ; le test d'adapter
  n'assère plus de phrase française.
- La suite de contrat passe contre les deux adapters.
- Aucun fichier de `src/suivi/ui/` ni hors périmètre modifié.
- Rapport final : nouvelle signature exacte du port, et la liste de ce que
  `SuiviScreen.ts` devra changer (le lot 05 s'en servira comme consigne).
