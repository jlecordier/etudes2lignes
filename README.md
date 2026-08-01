# Etudes2Lignes

Suivi géolocalisé de schémas de ligne ferroviaires — une PWA **entièrement hors
ligne** : vous importez les pages (images) de votre schéma de ligne, vous
géo-référencez quelques points, et pendant le voyage la page défile toute seule
pour suivre votre position GPS.

## Ce que fait l'application

- **Trajets** : créer, renommer, supprimer ; chaque trajet contient des images
  ordonnées (les pages du document, lues de bas en haut) réordonnables ▲/▼.
- **Géoréférencement** : « Ajouter un point » → toucher l'image à la hauteur
  voulue → choisir la coordonnée sur la carte. Raccourci souris : click droit
  directement sur l'image pour placer un point à cet endroit et passer aussitôt
  au choice de la coordonnée. Un button « Ajouter un point » flottant (bas de
  l'écran) reste accessible quel que soit le défilement — indispensable au
  tactile, où le click droit n'existe pas. Points modifiables (sur l'image, sur
  la carte, buttons flottants sur chaque marker) et supprimables.
- **Carte d'ensemble dans l'éditeur** : tous les points du trajet, numérotés
  et **déplaçables directement** au doigt ou à la souris. Côte à côte avec les
  images et épinglée pendant le défilement sur grand écran (iPad en paysage
  compris) ; au-dessus des images sur mobile et iPad en portrait. Sur grand
  écran, la coordonnée d'un nouveau point se choisit d'un click sur cette carte ;
  sur mobile, sur la carte plein écran (avec saisie lat/lon manuelle).
- **Suivi** : la position GPS est lue en continu (une position traitée toutes
  les ~10 s) et le document défile pour placer votre position au quart bas de
  l'écran — les trois quarts hauts montrent ce qui arrive. Défilement manuel →
  button « Reprendre le suivi ». L'écran reste allumé (wake lock).
- **Simulation** : choisissez une position fictive sur la carte pour vérifier
  votre géoréférencement sans bouger de chez vous.
- **Hors ligne** : après une première visite en ligne, tout fonctionne sans
  réseau (service worker + IndexedDB). Les tuiles de carte déjà affichées
  restent disponibles hors ligne.
- **Import / export** : « ⬇️ Exporter » enregistre un trajet complet (nom,
  images en base64, points) dans un file JSON autonome ; « ⬆️ Importer » le
  recharge sur un other appareil, créant à chaque fois un nouveau trajet. C'est
  le moyen de transférer un trajet d'un appareil à l'other sans réseau.

## Démarrage

```bash
pnpm install
pnpm dev        # serveur de développement
pnpm test       # tests unitaires (Vitest)
pnpm test:e2e   # tests de bout en bout (Playwright, 5 profils navigateur)
pnpm typecheck  # vérification TypeScript
pnpm build      # build de production (génère la PWA dans dist/)
pnpm preview    # sert le build — nécessaire pour essayer le service worker
pnpm quality    # tout en un : typecheck + lint + tests + audit fallow
pnpm mutation   # tests de mutation (lent, à la request — hors du gate)
```

## Préparer un trajet

1. **Convertir le PDF en images** (JPEG ou PNG), une image par page — par
   exemple avec un convertisseur en ligne ou `pdftoppm -jpeg -r 200 doc.pdf page`.
2. Créer le trajet, importer les images **dans l'ordre du document** : la
   première sélectionnée se place en haut de la pile, les suivantes dessous, et
   un second lot se pose sous le premier. Le document se lisant de bas en haut,
   c'est la **dernière** page qui ouvre le voyage, et tout le trajet se remonte
   d'un seul tenant, sans rupture aux changements de page. Si votre livret
   commence par sa page 1, sélectionnez les fichiers en ordre inverse — ou
   réordonnez ensuite avec ▲/▼.
3. Géo-référencer les points remarquables (gares, raccordements, PK connus).
   Conseils :
    - un point **près du départ et un près de l'arrivée** du trajet (au-delà du
      first et du last point, la page se borne dessus sans extrapoler) ;
    - plus les points sont denses, plus le défilement est fidèle entre eux —
      les frontières entre pages n'ont rien de spécial, l'interpolation les
      traverse comme n'importe quel endroit de la ligne.
4. Vérifier avec « Suivre » → « Simuler » avant le vrai voyage.

## Documentation

Point d'entrée complet : **[docs/INDEX.md](docs/INDEX.md)**.

- [Architecture (hexagone, DDD, BDD)](docs/ARCHITECTURE.md)
- [Glossaire (langage ubiquitaire)](docs/GLOSSAIRE.md)
- [Exigences ↔ tests](docs/EXIGENCES.md)
- [Décisions d'architecture (ADR)](docs/adr/README.md)
- [Déploiement sur GitHub Pages, pas à pas](docs/DEPLOIEMENT.md)
- [Spécification d'origine](docs/superpowers/specs/2026-07-10-suivi-schema-ligne-design.md)

Pour les IA / agents : [AGENTS.md](AGENTS.md) (guide canonique), [CLAUDE.md](CLAUDE.md), [llms.txt](llms.txt).

## Limitations assumées

- Écran éteint = pas de suivi (limite du web ; le wake lock garde l'écran allumé).
- Sur iOS, la permission de localisation est redemandée à chaque session (comportement d'iOS).
- Un document se lit de bas en haut ; dans le sens inverse du document, le suivi
  fonctionne mais l'ancrage au quart bas montre surtout du « déjà passé ».
- Les données restent locales à chaque appareil : pas de synchronisation
  automatique, mais l'import/export JSON permet de transférer un trajet à la
  request d'un appareil à l'other.
