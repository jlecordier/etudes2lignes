import type { SelecteurDeCoordonnee } from '../../carte/ports/SelecteurDeCoordonneePort';
import { FractionVerticale } from '../domain/FractionVerticale';
import type { Trajet, ImageDeTrajet, Point } from '../domain/Trajet';
import type { ImageId, PointId, TrajetId } from '../domain/ids';
import type { TrajetRepository } from '../ports/TrajetRepository';

export interface DependancesEditeurTrajet {
  repository: TrajetRepository;
  selecteurDeCoordonnee: SelecteurDeCoordonnee;
  surRetour: () => void;
}

type ModeDePlacement = { type: 'ajout' } | { type: 'deplacement'; pointId: PointId } | null;

/** Écran d'édition d'un trajet : ses images et ses points géo-référencés. */
export function creerEditeurTrajetScreen(dependances: DependancesEditeurTrajet): {
  afficher: (id: TrajetId) => Promise<void>;
} {
  const { repository, selecteurDeCoordonnee, surRetour } = dependances;
  const titre = document.querySelector<HTMLHeadingElement>('#titre-trajet')!;
  const pile = document.querySelector<HTMLDivElement>('#pile-images')!;
  const listePoints = document.querySelector<HTMLOListElement>('#liste-points')!;
  const consigne = document.querySelector<HTMLParagraphElement>('#consigne-placement')!;
  const boutonRetour = document.querySelector<HTMLButtonElement>('#bouton-retour-liste')!;
  const boutonAjouterImages =
    document.querySelector<HTMLButtonElement>('#bouton-ajouter-images')!;
  const boutonAjouterPoint = document.querySelector<HTMLButtonElement>('#bouton-ajouter-point')!;
  const boutonAnnulerPlacement =
    document.querySelector<HTMLButtonElement>('#bouton-annuler-placement')!;
  const champFichiers = document.querySelector<HTMLInputElement>('#input-images')!;

  let trajet: Trajet | null = null;
  let modeDePlacement: ModeDePlacement = null;
  let urlsARevoquer: string[] = [];

  boutonRetour.addEventListener('click', () => {
    revoquerLesUrls();
    changerDeMode(null);
    surRetour();
  });
  boutonAjouterImages.addEventListener('click', () => champFichiers.click());
  champFichiers.addEventListener('change', () => void importerLesFichiers());
  boutonAjouterPoint.addEventListener('click', () => changerDeMode({ type: 'ajout' }));
  boutonAnnulerPlacement.addEventListener('click', () => changerDeMode(null));

  async function afficher(id: TrajetId): Promise<void> {
    trajet = await repository.charger(id);
    changerDeMode(null);
    rendre();
  }

  // --- Images ---------------------------------------------------------------

  async function importerLesFichiers(): Promise<void> {
    if (trajet === null || champFichiers.files === null) {
      return;
    }
    for (const fichier of Array.from(champFichiers.files)) {
      const { largeur, hauteur } = await dimensionsDeLImage(fichier);
      trajet.ajouterImage({ nom: fichier.name, blob: fichier, largeur, hauteur });
    }
    champFichiers.value = '';
    await sauvegarderEtRendre();
  }

  async function supprimerImage(image: ImageDeTrajet): Promise<void> {
    const nombreDePoints = trajet!.points.filter((point) => point.imageId === image.id).length;
    const confirme = confirm(
      `Supprimer « ${image.nom} » ? ${nombreDePoints} point(s) seront supprimés avec elle.`,
    );
    if (!confirme) {
      return;
    }
    trajet!.supprimerImage(image.id);
    await sauvegarderEtRendre();
  }

  // --- Points ---------------------------------------------------------------

  async function surClicSurImage(image: ImageDeTrajet, evenement: MouseEvent): Promise<void> {
    if (trajet === null || modeDePlacement === null) {
      return;
    }
    const zone = evenement.currentTarget as HTMLElement;
    const cadre = zone.getBoundingClientRect();
    const fraction = FractionVerticale.creer(
      borner((evenement.clientY - cadre.top) / cadre.height, 0, 1),
    );

    if (modeDePlacement.type === 'deplacement') {
      trajet.deplacerPointSurImage(modeDePlacement.pointId, image.id, fraction);
      changerDeMode(null);
      await sauvegarderEtRendre();
      return;
    }

    changerDeMode(null);
    const coordonnee = await selecteurDeCoordonnee.choisir(null);
    if (coordonnee === null) {
      return;
    }
    trajet.ajouterPoint({ imageId: image.id, fraction, coordonnee });
    await sauvegarderEtRendre();
  }

  async function deplacerPointSurLaCarte(point: Point): Promise<void> {
    const coordonnee = await selecteurDeCoordonnee.choisir(point.coordonnee);
    if (coordonnee === null) {
      return;
    }
    trajet!.deplacerPointSurCarte(point.id, coordonnee);
    await sauvegarderEtRendre();
  }

  async function supprimerPoint(point: Point, numero: number): Promise<void> {
    if (!confirm(`Supprimer le point ${numero} ?`)) {
      return;
    }
    trajet!.supprimerPoint(point.id);
    await sauvegarderEtRendre();
  }

  function changerDeMode(mode: ModeDePlacement): void {
    modeDePlacement = mode;
    consigne.hidden = mode === null;
    pile.classList.toggle('placement-actif', mode !== null);
  }

  // --- Rendu ----------------------------------------------------------------

  async function sauvegarderEtRendre(): Promise<void> {
    await repository.sauvegarder(trajet!);
    rendre();
  }

  function rendre(): void {
    if (trajet === null) {
      return;
    }
    titre.textContent = trajet.nom.valeur;
    revoquerLesUrls();
    const numeros = numerosDesPoints(trajet);
    pile.replaceChildren(...trajet.images.map((image) => cadreDImage(image, numeros)));
    listePoints.replaceChildren(
      ...trajet.ordreVoyageDesPoints().map((point, index) => ligneDePoint(point, index + 1)),
    );
  }

  function cadreDImage(image: ImageDeTrajet, numeros: Map<PointId, number>): HTMLElement {
    const cadre = document.createElement('div');
    cadre.className = 'cadre-image';

    const barre = document.createElement('div');
    barre.className = 'barre-image';
    const nom = document.createElement('span');
    nom.className = 'nom-image';
    nom.textContent = image.nom;
    barre.append(
      nom,
      boutonDAction('▲', `Monter ${image.nom}`, () => void monter(image.id)),
      boutonDAction('▼', `Descendre ${image.nom}`, () => void descendre(image.id)),
      boutonDAction('Supprimer', `Supprimer ${image.nom}`, () => void supprimerImage(image)),
    );

    const zone = document.createElement('div');
    zone.className = 'zone-image';
    zone.append(elementImage(image));
    for (const point of trajet!.points.filter((point) => point.imageId === image.id)) {
      zone.append(marqueurDePoint(point, numeros.get(point.id)!));
    }
    zone.addEventListener('click', (evenement) => void surClicSurImage(image, evenement));

    cadre.append(barre, zone);
    return cadre;
  }

  async function monter(imageId: ImageId): Promise<void> {
    trajet!.monterImage(imageId);
    await sauvegarderEtRendre();
  }

  async function descendre(imageId: ImageId): Promise<void> {
    trajet!.descendreImage(imageId);
    await sauvegarderEtRendre();
  }

  function elementImage(image: ImageDeTrajet): HTMLImageElement {
    const url = URL.createObjectURL(image.blob);
    urlsARevoquer.push(url);
    const element = document.createElement('img');
    element.src = url;
    element.alt = image.nom;
    // Dimensions réservées : la mise en page est figée avant tout décodage,
    // les hauteurs restent stables même quand les images chargent en différé.
    element.width = image.largeur;
    element.height = image.hauteur;
    element.loading = 'lazy';
    element.decoding = 'async';
    return element;
  }

  function ligneDePoint(point: Point, numero: number): HTMLLIElement {
    const image = trajet!.images.find((image) => image.id === point.imageId)!;
    const ligne = document.createElement('li');
    ligne.className = 'ligne-point';

    const description = document.createElement('span');
    description.className = 'description-point';
    description.textContent =
      `Point ${numero} — ${image.nom} à ${Math.round(point.fraction.valeur * 100)} % — ` +
      `${point.coordonnee.latitude.toFixed(4)}, ${point.coordonnee.longitude.toFixed(4)}`;

    ligne.append(
      description,
      boutonDAction("Sur l'image", `Déplacer le point ${numero} sur l'image`, () =>
        changerDeMode({ type: 'deplacement', pointId: point.id }),
      ),
      boutonDAction('Sur la carte', `Déplacer le point ${numero} sur la carte`, () =>
        void deplacerPointSurLaCarte(point),
      ),
      boutonDAction('Supprimer', `Supprimer le point ${numero}`, () =>
        void supprimerPoint(point, numero),
      ),
    );
    return ligne;
  }

  function marqueurDePoint(point: Point, numero: number): HTMLElement {
    const marqueur = document.createElement('div');
    marqueur.className = 'marqueur-point';
    marqueur.style.top = `${point.fraction.valeur * 100}%`;
    const etiquette = document.createElement('span');
    etiquette.className = 'numero-point';
    etiquette.textContent = String(numero);
    marqueur.append(etiquette);
    return marqueur;
  }

  function revoquerLesUrls(): void {
    for (const url of urlsARevoquer) {
      URL.revokeObjectURL(url);
    }
    urlsARevoquer = [];
  }

  return { afficher };
}

function numerosDesPoints(trajet: Trajet): Map<PointId, number> {
  return new Map(trajet.ordreVoyageDesPoints().map((point, index) => [point.id, index + 1]));
}

function boutonDAction(texte: string, intitule: string, action: () => void): HTMLButtonElement {
  const bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.className = 'secondaire';
  bouton.textContent = texte;
  bouton.setAttribute('aria-label', intitule);
  bouton.addEventListener('click', action);
  return bouton;
}

async function dimensionsDeLImage(fichier: File): Promise<{ largeur: number; hauteur: number }> {
  const bitmap = await createImageBitmap(fichier);
  const dimensions = { largeur: bitmap.width, hauteur: bitmap.height };
  bitmap.close();
  return dimensions;
}

function borner(valeur: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, valeur));
}
