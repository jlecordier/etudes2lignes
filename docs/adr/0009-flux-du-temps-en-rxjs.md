# ADR 0009 — Les flux du temps en RxJS

- **Statut** : Acceptée (2026-08-06)

## Contexte

Le suivi est une application **du temps**. Presque toutes ses règles parlent de
cadence, de fraîcheur ou de concurrence, et aucune ne parle d'affichage :

- au plus une position traitée toutes les 10 s (le GPS en émet une par seconde) ;
- au-delà de 30 s sans fix, l'état devient « perdue », et il **mesure** l'âge ;
- un chien de garde bat toutes les 15 s pour s'en apercevoir ;
- un retour au premier plan relance l'acquisition, mais pas deux fois en 5 s ;
- les écritures dans IndexedDB s'exécutent l'une après l'autre, jamais en
  parallèle ;
- une demande de verrou d'écran en vol est partagée par tous ceux qui réclament
  en même temps.

Écrites à la main, ces règles se sont dites en **horodatages et champs
mutables** : `lastHandledMs`, `lastFixMs`, `lastSignalMs`, `lastRestartMs`,
`lastSignalMs`, `inFlightAcquisition`, plus une horloge `now()` injectée pour
les rendre testables. Six champs sur un seul objet `ActiveWatch` — et la
correction de chaque règle ne se lit nulle part : elle est répartie entre le
moment où l'on écrit un horodatage et celui où on l'en retranche un autre.

Deux symptômes le disaient déjà. D'abord l'objet `ActiveWatch`, dont la raison
d'être est de garantir que **rien d'une session ne survit à la suivante** —
c'est-à-dire de refaire à la main ce qu'un désabonnement fait tout seul.
Ensuite l'`AbortController` des écrans, qui est exactement un `takeUntil`
écrit à la main.

## Décision

**RxJS entre dans le projet, et dans toutes les couches — le domaine compris.**

Un `Observable` est une structure de données, comme un `Array` ou une `Map` :
une valeur qui arrive plus tard, éventuellement plusieurs fois. Ce n'est pas
un framework, il n'impose ni cycle de vie, ni rendu, ni conteneur. C'est la
raison pour laquelle il peut traverser la règle de dépendance sans la trahir :
le domaine qui en dépend ne dépend toujours de rien de technique, et il reste
testable sans navigateur.

C'est aussi la raison pour laquelle il n'y a pas d'alternative à peser. Le
choix n'est pas « RxJS ou une autre bibliothèque » : il n'existe pas d'autre
manière d'écrire ces règles-là que de les réécrire soi-même, ce qui est
précisément ce que faisait le code — mal, parce que chaque règle y était
recopiée à sa façon.

En conséquence :

- les ports qui livrent des valeurs au fil de l'eau les exposent en
  `Observable`, pas en rappels (`positions$`, `status$`,
  `returnToForeground$`) ;
- **s'abonner remplace `demarrer`, se désabonner remplace `arreter`.** Les
  sources n'ont plus de méthode d'arrêt : la souscription est la session ;
- le temps ne se mesure plus par soustraction d'horodatages. Un âge est porté
  par le flux qui l'a produit (`timer` redémarré par `switchMap`), et non
  recalculé après coup ;
- l'horloge injectée (`now()`) et l'ordonnanceur maison (`Scheduler`)
  disparaissent : le `TestScheduler` de RxJS pilote le temps virtuel des
  tests, ce qui est le même besoin, mais fourni.

L'[ADR 0001](0001-hexagone-sans-framework.md) n'est pas amendée : elle interdit
un **framework UI**, et le rendu reste explicitement écrit en DOM natif.

## Conséquences

- ➕ Chaque règle de temps se lit en un endroit, sous son propre nom :
  `throttleTime(10 s)`, `debounceTime`, `concatMap`, `exhaustMap`,
  `switchMap`. Elle ne se déduit plus de l'ordre dans lequel des champs sont
  écrits.
- ➕ Le rangement cesse d'être une discipline. Une session qui s'arrête coupe
  ses minuteries, ses écouteurs et ses abonnements parce qu'elle s'est
  désabonnée, non parce qu'on a pensé à écrire un `arreter` complet.
- ➕ Les tests décrivent le temps au lieu de le simuler : un diagramme marble
  dit à la fois l'entrée, l'instant et la sortie attendue.
- ➖ Une dépendance runtime de plus (~ 34 kB min+gzip, tree-shakée à ce qui est
  importé) dans un projet qui en comptait deux.
- ➖ RxJS a une courbe d'apprentissage réelle, et un opérateur mal choisi se
  trompe en silence (`switchMap` là où `concatMap` était voulu annule au lieu
  de mettre en file). Le remède est le même que partout ailleurs ici : la règle
  n'est acquise que quand un test la casse pour de bon
  ([ADR 0006](0006-tests-de-mutation-stryker.md)).
- ➖ Le lint type-aware ([ADR 0002](0002-lint-type-aware-strict.md)) ne voit
  pas dans un `pipe` ce qu'il voit dans une suite d'instructions : un flux
  jamais souscrit ne fait rien, et ne se dénonce pas. Tout `subscribe` d'un
  écran passe donc par le signal de son écran (`takeUntil`), comme les
  écouteurs.
