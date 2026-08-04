# Exporter depuis l'éditeur — conception

Un trajet ne s'exporte aujourd'hui que depuis la liste. Il faut donc quitter
l'éditeur pour envoyer à quelqu'un le trajet qu'on vient d'y géoréférencer, puis
y revenir. L'export part désormais **aussi** de l'écran d'édition.

## Constat

L'export existe et fonctionne : `exportTrajetToJson`
(`src/trajets/serialization/trajetJson.ts:33`) rend le fichier autonome, et
`TrajetsListScreen` le fait enregistrer par le navigateur. Mais tout ce qui
transforme cet export en **geste** est enfermé dans cet écran :

| Ce qui est privé dans `TrajetsListScreen.ts` | Ce qu'il fait                        |
| -------------------------------------------- | ------------------------------------ |
| `telecharger` (ligne 210)                    | ancre `download` + révocation à 60 s |
| `fileNameFrom` (ligne 224)                   | assainit le nom du trajet            |
| `REVOCATION_DELAY_MS` (ligne 207)            | le délai, et sa raison (Safari/iOS)  |

L'éditeur, lui, a déjà tout le reste : le `Trajet` complet en mémoire, un
lanceur (`run`) pour la frontière d'erreur, et une barre d'actions où poser un
bouton.

## Décision

**Le geste « faire enregistrer ce trajet par le navigateur » devient un module à
part, et l'éditeur gagne un troisième bouton dans sa barre d'actions.**

```
┌─────────────────────────────────────────────────┐
│ 🔙 Trajets      Paris → Bordeaux      🧭 Suivre  │
└─────────────────────────────────────────────────┘
  Les pages s'importent de haut en bas, …

┌──────────────────────┬─────────────────────┬─────────────┐
│ 🖼️ Ajouter des images │ 📍 Ajouter un point │ ⬇️ Exporter │
└──────────────────────┴─────────────────────┴─────────────┘
```

### `downloadTrajet` — le geste, en un appel

Nouveau module `src/trajets/ui/downloadTrajet.ts` :

```ts
export async function downloadTrajet(trajet: Trajet): Promise<void> {
    download(await exportTrajetToJson(trajet), `${fileNameFrom(trajet.nom.value)}.json`);
}
```

`download`, `fileNameFrom` et le délai de révocation y deviennent privés. Les
deux écrans appellent la même fonction avec un `Trajet` — la liste en charge
déjà un avant d'exporter (`TrajetsListScreen.ts:163`), elle n'a qu'à le passer.

Le nom du fichier vient désormais de l'agrégat (`trajet.nom.value`) et non plus
du résumé (`summary.nom`) : même valeur, une source de moins.

**`telecharger` devient `download`.** `télécharger` n'est pas dans la liste close
des mots métier du [Lexique](../../GLOSSAIRE.md#lexique), il passe donc à
l'anglais ([ADR 0007](../../adr/0007-langue-du-code-metier-francais-technique-anglais.md)).
Le nom actuel est non conforme ; l'extraction est le moment de le corriger.
Une ligne `télécharger → download` entre au lexique pour fermer la discussion.

### Ce que l'éditeur exporte : l'agrégat qu'il a en mémoire

Sans rien recharger. Toute écriture passe par `applyToTrajetAndSave`, et une
écriture refusée fait repartir l'écran de ce qui est réellement stocké
(`TrajetEditorScreen.ts:215-252`, exigence TR-9). La mémoire **est** le
stockage — et c'est aussi ce que l'utilisateur a sous les yeux.

```ts
query('#export-trajet-button', HTMLButtonElement, root).addEventListener(
    'click',
    () => {
        const currentTrajet = trajet;
        if (currentTrajet === null) {
            return;
        }
        run(downloadTrajet(currentTrajet), 'l’export du trajet');
    },
    { signal },
);
```

La garde `null` est celle de `#suivre-button` (ligne 89) : un clic pendant le
chargement ne fait rien. Les échecs passent par `run`, donc par la même
frontière d'erreur et le même intitulé que la liste.

### Sous 560 px, la barre se réduit à ses pictogrammes

Trois libellés entiers n'entrent pas : sur 375 px de large l'écran laisse 343 px
utiles et chacun des deux boutons actuels en fait déjà ~190, donc **ils passent
déjà sur deux lignes aujourd'hui**. Un troisième en ferait trois.

Chaque bouton de la barre porte donc son nom accessible, et son libellé visible
devient un `<span>` masquable :

```html
<button id="add-images-button" type="button" aria-label="Ajouter des images">
    🖼️<span class="button-label">Ajouter des images</span>
</button>
```

```css
.action-bar button {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
}
.button-label {
    display: none;
}
@media (min-width: 560px) {
    .button-label {
        display: inline;
    }
}
```

Trois choses valent d'être dites :

- **`inline-flex` + `gap` plutôt qu'une espace** entre le pictogramme et le
  `<span>` : une espace masquée laisse ~4 px de traîne à droite de chaque bouton,
  et Prettier reformate ces `.html` — l'espacement du gabarit n'est pas un appui
  fiable. Aucun effet sur la liste des trajets, dont les boutons n'ont qu'un
  seul nœud de texte, donc un seul élément flex.
- **Le nom accessible est ce qui casse en premier.** Sans `aria-label`, le bouton
  s'annonce « 🖼️ », et `e2e/points.spec.ts:20` comme `e2e/helpers.ts:144`, qui le
  désignent par son nom, tombent.
- **Cette régression est déjà couverte par construction** : les projets
  Playwright `iphone` (390 px) et `android` (412 px) sont tous deux sous le
  seuil, donc _toute_ la suite e2e joue le mode pictogrammes.

Mobile d'abord, comme le reste de la feuille (`src/style.css:1`). Le seuil est
propre à la barre d'actions : `--large-screen` (900 px) est celui de la carte, et
le réutiliser afficherait trois pictogrammes minuscules sur un iPad en portrait.

## Ce que les tests prouvent

| Fichier                         | Ce qu'il prouve                                                                                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `downloadTrajet.test.ts` (neuf) | Le nom du fichier est celui du trajet, caractères interdits remplacés ; le contenu est l'export JSON. Règle aujourd'hui sans témoin.                              |
| `TrajetEditorScreen.test.ts`    | Cliquer « Exporter » propose au téléchargement le trajet affiché ; un clic pendant le chargement ne propose rien ; chaque bouton de la barre a un nom accessible. |
| `e2e/import-export.spec.ts`     | Exporter depuis l'éditeur sans repasser par la liste, sur les cinq navigateurs — dont les deux mobiles, en pictogrammes.                                          |

L'e2e assère le contenu et `/\.json$/`, **pas** le nom exact du fichier : `→`
peut être ré-encodé différemment d'un navigateur à l'autre. La règle du nom est
vérifiée en unitaire, où elle est déterministe.

Le test unitaire de l'écran fausse `HTMLAnchorElement.prototype.click` pour
relever `{ download, href }`, et enrichit le stub `URL.createObjectURL` déjà
présent (`TrajetEditorScreen.test.ts:148`) pour garder le `Blob`. On assère donc
sur des **valeurs produites**, jamais sur des appels reçus.

Le test « chaque bouton de la barre a un nom accessible » n'est pas un doublon de
l'e2e mobile : il échoue en une phrase (« ce bouton n'a pas de nom accessible »)
là où l'e2e échoue en expiration de délai, et c'est le seul garde-fou entre un
futur quatrième bouton et un pictogramme muet.

## Écarté

- **Un port `FileDownloader` injecté par `main.ts`.** Les écrans sont des adapters
  entrants : ils touchent déjà `confirm`, `prompt`, `alert` et
  `URL.createObjectURL` en direct. Un port pour dix lignes serait une cérémonie
  qu'on n'applique nulle part ailleurs.
- **Faire passer l'export par `saveQueue`** pour attendre une écriture en vol : le
  contenu du fichier serait identique. La file change _quand_ le stockage
  rattrape, pas ce que l'agrégat contient.
- **Recharger le trajet depuis le dépôt avant d'exporter** : un chemin d'échec de
  plus, pour une valeur qu'on a déjà.
- **Masquer aussi les libellés de la barre de la liste des trajets** : hors
  périmètre. « 🆕 » seul serait moins parlant que « ⬇️ », et ses deux boutons
  tiennent sur une ligne.
- **Un ADR.** Rien d'architectural n'est décidé ni renversé, et le dépôt retire
  justement des ADR ce qu'aucun test ne vérifie.

## Fichiers touchés

| Fichier                                     | Nature                                                             |
| ------------------------------------------- | ------------------------------------------------------------------ |
| `src/trajets/ui/downloadTrajet.ts`          | neuf — le geste extrait                                            |
| `src/trajets/ui/downloadTrajet.test.ts`     | neuf                                                               |
| `src/trajets/ui/TrajetsListScreen.ts`       | perd les trois helpers, appelle `downloadTrajet`                   |
| `src/trajets/ui/TrajetEditorScreen.ts`      | écoute le nouveau bouton                                           |
| `src/trajets/ui/TrajetEditorScreen.html`    | troisième bouton, `aria-label` + `<span class="button-label">` × 3 |
| `src/trajets/ui/TrajetEditorScreen.test.ts` | trois tests                                                        |
| `src/style.css`                             | `inline-flex` + le seuil de 560 px                                 |
| `e2e/import-export.spec.ts`                 | un test                                                            |
| `docs/EXIGENCES.md`                         | exigence IE-5                                                      |
| `docs/GLOSSAIRE.md`                         | `télécharger → download`                                           |
| `README.md`                                 | l'export part aussi de l'éditeur                                   |
