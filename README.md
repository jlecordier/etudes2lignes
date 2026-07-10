# Etudes2Lignes

Suivi géolocalisé de schémas de ligne ferroviaires — une PWA **entièrement hors
ligne** : vous importez les pages (images) de votre schéma de ligne, vous
géo-référencez quelques points, et pendant le voyage la page défile toute seule
pour suivre votre position GPS.

## Ce que fait l'application

- **Trajets** : créer, renommer, supprimer ; chaque trajet contient des images
  ordonnées (les pages du document, lues de bas en haut) réordonnables ▲/▼.
- **Géoréférencement** : « Ajouter un point » → toucher l'image à la hauteur
  voulue → choisir la coordonnée sur une carte de France (OpenStreetMap), ou la
  saisir à la main. Points modifiables (sur l'image, sur la carte) et supprimables.
- **Suivi** : la position GPS est lue en continu (une position traitée toutes
  les ~10 s) et le document défile pour placer votre position au quart bas de
  l'écran — les trois quarts hauts montrent ce qui arrive. Défilement manuel →
  bouton « Reprendre le suivi ». L'écran reste allumé (wake lock).
- **Simulation** : choisissez une position fictive sur la carte pour vérifier
  votre géoréférencement sans bouger de chez vous.
- **Hors ligne** : après une première visite en ligne, tout fonctionne sans
  réseau (service worker + IndexedDB). Les tuiles de carte déjà affichées
  restent disponibles hors ligne.

## Démarrage

```bash
pnpm install
pnpm dev        # serveur de développement
pnpm test       # tests unitaires (Vitest)
pnpm test:e2e   # tests de bout en bout (Playwright, 5 profils navigateur)
pnpm typecheck  # vérification TypeScript
pnpm build      # build de production (génère la PWA dans dist/)
pnpm preview    # sert le build — nécessaire pour essayer le service worker
```

## Préparer un trajet

1. **Convertir le PDF en images** (JPEG ou PNG), une image par page — par
   exemple avec un convertisseur en ligne ou `pdftoppm -jpeg -r 200 doc.pdf page`.
2. Créer le trajet, importer les images **dans l'ordre du voyage** (la première
   image = le début du trajet ; chaque page se lit de bas en haut).
3. Géo-référencer les points remarquables (gares, raccordements, PK connus).
   Conseils :
    - placez un point **près du bas et du haut de chaque page** ;
    - à la jonction de deux pages, placez **le même lieu** en haut de la page N
      et en bas de la page N+1 (les documents répètent souvent le PK de jonction) ;
    - plus les points sont denses, plus le défilement est fidèle entre eux.
4. Vérifier avec « Suivre » → « Simuler » avant le vrai voyage.

## Documentation

- [Architecture (hexagone, DDD, BDD)](docs/ARCHITECTURE.md)
- [Déploiement sur GitHub Pages, pas à pas](docs/DEPLOIEMENT.md)
- [Spécification d'origine](docs/superpowers/specs/2026-07-10-suivi-schema-ligne-design.md)

## Limitations assumées

- Écran éteint = pas de suivi (limite du web ; le wake lock garde l'écran allumé).
- Sur iOS, la permission de localisation est redemandée à chaque session (comportement d'iOS).
- Un document se lit de bas en haut ; dans le sens inverse du document, le suivi
  fonctionne mais l'ancrage au quart bas montre surtout du « déjà passé ».
- Les données restent locales à chaque appareil (pas de synchronisation).
