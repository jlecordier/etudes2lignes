# ADR 0007 — Langue du code : métier en français, technique en anglais

- **Statut** : Acceptée (2026-07-31)
- **Remplace** la règle « tout en français » de [AGENTS.md](../../AGENTS.md) et
  du [glossaire](../GLOSSAIRE.md).

## Contexte

La règle initiale disait « tout est en français — identifiants, commentaires,
chaînes d'interface, docs ». Elle visait le **langage ubiquitaire** : que le mot
du conducteur et le mot du code soient le même mot, pour qu'une conversation
métier se relise telle quelle dans l'agrégat.

Appliquée à la lettre, elle a débordé sur du code qui ne dit rien du métier. Un
audit du dépôt en a relevé **607 identifiants français distincts**, dont une
majorité sans aucune contrepartie ferroviaire : `elementA`, `borner`,
`creerFileDAttente`, `requete`, `creerBouton`, `VarianteDeBouton`, `evenement`,
`banc`, `cadenceur`, `avancerLeTemps`, `conteneur`, `resultat`…

Ce français-là ne rapproche personne du métier. Il coûte trois choses :

- **Il noie le signal.** Quand tout est en français, la langue ne distingue plus
  ce qui est un invariant du domaine de ce qui est de la tuyauterie. Le
  glossaire cesse d'être une frontière et devient une liste parmi d'autres.
- **Il fabrique des faux amis.** `src/commun/file.ts` implémentait une file
  d'attente, dans un projet qui importe des **fichiers** image. Le nom mentait à
  qui lit vite.
- **Il s'éloigne de la plateforme.** `requete`/`selecteur` enveloppent
  `querySelector`, `surveillance` enveloppe `watchPosition`, `maintenir`
  enveloppe le wake lock. Traduire l'API rend l'enveloppe plus difficile à
  relier à ce qu'elle enveloppe — le glossaire écrit d'ailleurs déjà
  « Wake lock », en anglais, dans sa section Plateforme.

## Décision

**Un identifiant se traduit mot à mot.** Chaque mot qui le compose reste en
français s'il désigne un concept du [glossaire](../GLOSSAIRE.md), passe à
l'anglais s'il n'en désigne aucun.

```
marqueurDuPoint   ->  pointMarker      (« point » est au glossaire)
cadreImage        ->  imageFrame       (« image » est au glossaire)
creerFileDAttente ->  createQueue      (aucun mot métier)
Trajet.creer      ->  Trajet.create    (le métier est porté par le type)
```

Le glossaire porte désormais le **lexique de partage** (§ Lexique) : la liste
close des mots français réputés métier, et la traduction retenue pour les mots
techniques récurrents. Un mot absent du lexique est technique par défaut.

Trois exceptions, chacune pour une raison précise :

1. **La prose reste française** — commentaires, JSDoc, titres de tests
   `Étant donné / Quand / Alors`, messages destinés à l'utilisateur. Elle relève
   du même statut que `docs/` et les ADR. On ne traduit pas une explication qui
   est déjà juste.
2. **Les pas de scénario e2e restent français** — `ouvrirUnTrajetVierge`,
   `ajouterUnPoint`, `cliquerSurLImage`. Ce ne sont pas des identifiants
   ordinaires : ce sont les phrases du scénario prolongées en code. L'échafaudage
   technique du même fichier, lui, suit la règle (`cadenceur` → `scheduler`).
3. **Les clés persistées sont gelées** — noms de magasins et d'index IndexedDB,
   clés du JSON exporté v1, clé `localStorage`. Ce sont des **données déjà
   écrites sur les appareils**, pas des identifiants. Le nom TypeScript
   s'anglicise, la clé stockée ne bouge pas, et la correspondance devient
   explicite à la frontière de l'adapter.

## Conséquences

- ➕ La langue redevient un signal : lire un mot français dans le code, c'est
  savoir qu'on touche au domaine.
- ➕ Le glossaire redevient une frontière vérifiable — un mot y est, ou il n'y
  est pas.
- ➖ Un chantier de renommage de plus de **400 identifiants** sur ~115 fichiers,
  mené d'un bloc. `src/commun/` est devenu `src/shared/`, `serialisation/` est
  devenu `serialization/`, et 28 fichiers ont changé de nom.
- ⚠️ **Ce que le typecheck ne voit pas.** La moitié du chantier ne tenait qu'à
  des **chaînes de caractères**. Quatre pièges, tous rencontrés, tous à relire
  avant le prochain renommage :
    - `src/navigation.ts` fabrique l'id de l'écran par gabarit
      (`` `screen-${name}` ``) à partir des littéraux de `ScreenName`. Renommer
      l'un sans l'autre éteint les trois écrans **sans une seule erreur**.
    - `src/shared/elements.ts` compose les classes CSS en dur à partir des
      littéraux de `ButtonVariant`, et quatre tests unitaires les assèrent au
      caractère près.
    - `--large-screen` est relue par chaîne depuis le TypeScript **et** depuis
      les e2e : désynchronisées, les e2e ne rougissent pas, elles testent l'autre
      branche.
    - les globs de `stryker.config.mjs` désignent les dossiers renommés. Un glob
      vide n'échoue pas : le périmètre de mutation se serait vidé en silence, et
      les négations cessant de matcher, la suite de contrat et les fakes se
      seraient mis à être mutés — l'inverse de ce que dit l'[ADR 0006](0006-tests-de-mutation-stryker.md).
      Vérifier qu'**aucun glob ne matche zéro fichier** fait partie du geste.
- ➖ Une frontière de plus à tenir : `precisionDuFix` (métier) côtoie `accuracy`
  (valeur de l'API). Faux ami de métrologie, à commenter à la jonction.
- ➖ Le dépôt reste bilingue par construction : c'est le but, pas un défaut.
  L'incohérence à traquer n'est plus « du français ici, de l'anglais là », mais
  « le même concept nommé dans deux langues ».
