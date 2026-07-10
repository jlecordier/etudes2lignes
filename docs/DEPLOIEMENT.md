# Déploiement sur GitHub Pages, pas à pas

L'application est un site statique : GitHub Pages (gratuit, HTTPS d'office) est
parfait. Le HTTPS est **obligatoire** — la géolocalisation et le service worker
ne fonctionnent pas sans lui.

## 1. Créer le dépôt et pousser le code

```bash
# dans le dossier du projet
git remote add origin git@github.com:<votre-compte>/<nom-du-depot>.git
git push -u origin main
```

Le nom du dépôt n'a pas d'importance : Vite est configuré avec `base: './'`
(chemins relatifs), l'application fonctionne sous n'importe quel sous-chemin
`https://<compte>.github.io/<depot>/`.

## 2. Activer GitHub Pages

Sur GitHub : **Settings → Pages → Build and deployment → Source :
« GitHub Actions »**. C'est tout — pas de branche `gh-pages` à gérer.

## 3. Le workflow fait le reste

`.github/workflows/deploy.yml` s'exécute à chaque poussée sur `main` :

1. **Job `tests`** : installation (pnpm), `typecheck`, tests unitaires Vitest,
   installation des navigateurs Playwright, tests E2E sur les 5 profils.
2. **Job `deploiement`** (seulement si les tests passent) : `pnpm build`
   (génère `dist/` avec le service worker et le manifest), puis publication
   via `actions/upload-pages-artifact` + `actions/deploy-pages`.

L'URL publiée apparaît dans l'onglet **Actions**, sur le job de déploiement
(environnement `github-pages`). Première publication : compter 2-3 minutes.

## 4. Installer l'application sur le téléphone

Ouvrir l'URL **une fois avec internet**, attendre le petit message
« ✓ Application disponible hors ligne », puis :

- **iPhone / iPad (Safari)** : bouton Partager → **« Sur l'écran d'accueil »**.
  Important : c'est cette installation qui protège le stockage de l'éviction
  automatique de Safari (règle des 7 jours sans visite).
- **Android (Chrome)** : menu ⋮ → **« Installer l'application »** (ou la
  bannière d'installation).

Ensuite l'application se lance depuis son icône et fonctionne sans réseau.

## 5. La localisation

Au premier suivi, le navigateur demande l'autorisation de localisation.

- **iOS** : la permission est **redemandée à chaque session** de la PWA — c'est
  le comportement normal d'iOS, pas un bug. Vérifier aussi Réglages →
  Confidentialité → Service de localisation → Safari : « Lorsque l'app est
  active ».
- L'écran reste allumé pendant le suivi (wake lock) ; sur iOS c'est fiable à
  partir d'**iOS 18.4** en PWA installée. À défaut, désactiver le verrouillage
  automatique le temps du voyage (Réglages → Luminosité et affichage).

## 6. Mettre à jour l'application

Pousser sur `main` suffit. Le service worker est en `autoUpdate` : à l'ouverture
suivante de l'application (avec réseau), la nouvelle version se télécharge et
s'active toute seule. En cas de doute, fermer complètement l'app et la rouvrir.

## 7. Tester le build en local

Le service worker ne tourne **pas** en mode dev. Pour l'essayer :

```bash
pnpm build && pnpm preview
# ouvrir http://localhost:4173, attendre « disponible hors ligne »,
# couper le réseau (mode avion), recharger : l'appli doit démarrer.
```

## 8. Pièges connus

| Piège | Réponse |
|---|---|
| Page blanche sous `https://compte.github.io/depot/` | Vérifier que `vite.config.ts` a bien `base: './'` (chemins relatifs). |
| « Ça ne se met pas à jour » | Le SW sert l'ancienne version pendant qu'il télécharge la nouvelle : rouvrir l'app. Vider les données du site en dernier recours. |
| Hors ligne cassé à la première visite | La première visite doit rester ouverte quelques secondes (installation du SW) : attendre le message « disponible hors ligne ». |
| Stockage disparu sur iPhone | L'app doit être installée sur l'écran d'accueil (voir §4) ; l'app demande aussi `storage.persist()` au démarrage. |
| La carte est grise hors ligne | Normal sur les zones jamais affichées : seules les tuiles déjà vues sont en cache (politique OSM — pas de pré-téléchargement). |
| Les tests E2E échouent en CI mais pas en local | Regarder le rapport Playwright dans les artefacts du job `tests`. |
