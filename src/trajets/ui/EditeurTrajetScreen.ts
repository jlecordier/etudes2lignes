import type { CarteDesPoints, PointAffiche } from '../../carte/ports/CarteDesPointsPort';
import type { SelecteurDeCoordonnee } from '../../carte/ports/SelecteurDeCoordonneePort';
import { requete } from '../../commun/dom';
import { creerBouton, type Bouton } from '../../commun/elements';
import { creerFileDAttente } from '../../commun/file';
import type { Lancer } from '../../commun/lancement';
import { creerPileDePages, type PageAAfficher } from '../../commun/pileDePages';
import type { Coordonnee } from '../domain/Coordonnee';
import { FractionVerticale } from '../domain/FractionVerticale';
import type { ImageDeTrajet, Point, Trajet } from '../domain/Trajet';
import type { ImageId, PointId, TrajetId } from '../domain/ids';
import type { TrajetRepository } from '../ports/TrajetRepository';

export interface DependancesEditeurTrajet {
    repository: TrajetRepository;
    selecteurDeCoordonnee: SelecteurDeCoordonnee;
    carteDesPoints: CarteDesPoints;
    lancer: Lancer;
    surRetour: () => void;
    surSuivi: (id: TrajetId) => void;
}

type ModeDePlacement = { type: 'ajout' } | { type: 'deplacement'; pointId: PointId } | null;

/**
 * Le seuil du grand écran (iPad paysage oui, iPad portrait non) est défini par
 * la feuille de style, seule, qui l'expose par ce drapeau : la valeur était
 * recopiée ici et dans les tests, où elle pouvait diverger en silence.
 */
function surGrandEcran(): boolean {
    return (
        getComputedStyle(document.documentElement).getPropertyValue('--grand-ecran').trim() === '1'
    );
}

/** Écran d'édition d'un trajet : ses images et ses points géo-référencés. */
export function creerEditeurTrajetScreen(dependances: DependancesEditeurTrajet): {
    afficher: (id: TrajetId) => Promise<void>;
} {
    const { repository, selecteurDeCoordonnee, carteDesPoints, lancer, surRetour, surSuivi } =
        dependances;
    const titre = requete('#titre-trajet', HTMLHeadingElement);
    const listePoints = requete('#liste-points', HTMLOListElement);
    const consigne = requete('#consigne-placement', HTMLParagraphElement);
    const texteConsigne = requete('#texte-consigne', HTMLSpanElement);
    const boutonAjouterImages = requete('#bouton-ajouter-images', HTMLButtonElement);
    const boutonAjouterPoint = requete('#bouton-ajouter-point', HTMLButtonElement);
    // Même action que `boutonAjouterPoint`, mais toujours à l'écran (position
    // fixe) : sur tactile, sans clic droit, c'est le seul moyen d'ajouter un
    // point sans remonter tout en haut de la page.
    const boutonAjouterPointFlottant = requete('#bouton-ajouter-point-flottant', HTMLButtonElement);
    const champFichiers = requete('#input-images', HTMLInputElement);
    const conteneurDesPages = requete('#pile-images', HTMLDivElement);
    const pile = creerPileDePages(conteneurDesPages);

    let trajet: Trajet | null = null;
    let idAffiche: TrajetId | null = null;
    // Incrémenté à chaque affichage et à chaque sortie : un chargement dont le
    // jeton est périmé (autre trajet ouvert entre-temps) n'écrase plus l'écran.
    let jetonDAffichage = 0;
    let modeDePlacement: ModeDePlacement = null;
    const enFileDEnregistrement = creerFileDAttente();

    requete('#bouton-retour-liste', HTMLButtonElement).addEventListener('click', () => {
        quitterLEcran();
        surRetour();
    });
    requete('#bouton-suivre', HTMLButtonElement).addEventListener('click', () => {
        if (trajet === null) {
            return;
        }
        const id = trajet.id;
        quitterLEcran();
        surSuivi(id);
    });
    boutonAjouterImages.addEventListener('click', () => {
        champFichiers.click();
    });
    champFichiers.addEventListener('change', () => {
        lancer(importerLesFichiers(), 'l’ajout des pages');
    });
    boutonAjouterPoint.addEventListener('click', commencerLAjoutDUnPoint);
    boutonAjouterPointFlottant.addEventListener('click', commencerLAjoutDUnPoint);
    requete('#bouton-annuler-placement', HTMLButtonElement).addEventListener('click', () => {
        changerDeMode(null);
        carteDesPoints.annulerLeChoix();
    });

    function quitterLEcran(): void {
        jetonDAffichage++;
        pile.detruire();
        changerDeMode(null);
        carteDesPoints.annulerLeChoix();
        trajet = null;
        idAffiche = null;
    }

    async function afficher(id: TrajetId): Promise<void> {
        idAffiche = id;
        const jeton = ++jetonDAffichage;
        const charge = await repository.charger(id);
        if (jeton !== jetonDAffichage) {
            return;
        }
        // Trajet supprimé entre-temps (ex. restauration d'un identifiant périmé).
        if (charge === null) {
            surRetour();
            return;
        }
        trajet = charge;
        changerDeMode(null);
        rendre();
    }

    // --- Le seul chemin d'écriture ---------------------------------------------

    /**
     * Applique une modification à l'agrégat, l'enregistre, puis réaffiche.
     *
     * C'est le seul endroit qui écrit, et donc le seul qui porte le chemin
     * d'échec : si l'enregistrement échoue, l'écran repart de ce qui est
     * réellement stocké. Sans cette resynchronisation, la mémoire, le stockage
     * et l'affichage diraient trois choses différentes — et un second geste sur
     * un objet déjà retiré en mémoire ferait lever le domaine.
     *
     * Les modifications sont mises en file : deux gestes rapprochés (un marqueur
     * glissé pendant qu'une suppression s'écrit) lançaient deux transactions
     * concurrentes, dont le dépôt ne peut pas garantir l'ordre.
     */
    function appliquerAuTrajetEtEnregistrer(modification: (trajet: Trajet) => void): Promise<void> {
        return enFileDEnregistrement(async () => {
            const trajetCourant = trajet;
            if (trajetCourant === null) {
                return;
            }
            modification(trajetCourant);
            try {
                await repository.sauvegarder(trajetCourant);
            } catch (erreur) {
                await resynchroniser();
                throw erreur;
            }
            rendre();
        });
    }

    /** Reprend l'état réellement enregistré, après un échec d'écriture. */
    async function resynchroniser(): Promise<void> {
        if (idAffiche === null) {
            return;
        }
        try {
            const recharge = await repository.charger(idAffiche);
            if (recharge === null) {
                surRetour();
                return;
            }
            trajet = recharge;
            rendre();
        } catch {
            // Le dépôt est hors service : l'échec d'origine est déjà signalé, il
            // ne sert à rien d'en signaler un second pour la même panne.
        }
    }

    // --- Images ---------------------------------------------------------------

    /**
     * Toutes les pages sont préparées **avant** de toucher à l'agrégat : un
     * fichier illisible au milieu d'une sélection n'en laisse alors aucune
     * moitié importée.
     */
    async function importerLesFichiers(): Promise<void> {
        const fichiers = champFichiers.files;
        if (fichiers === null || fichiers.length === 0) {
            return;
        }
        try {
            const pages = await preparerLesPages(Array.from(fichiers));
            await appliquerAuTrajetEtEnregistrer((trajetCourant) => {
                for (const page of pages) {
                    trajetCourant.ajouterImage(page);
                }
            });
        } finally {
            // Sans cela, un fichier illisible laisse la sélection en place :
            // re-choisir les mêmes fichiers n'émettrait plus d'événement
            // « change », et l'import resterait mort jusqu'au rechargement.
            champFichiers.value = '';
        }
    }

    async function preparerLesPages(
        fichiers: readonly File[],
    ): Promise<{ nom: string; blob: Blob; largeur: number; hauteur: number }[]> {
        const pages = [];
        for (const fichier of fichiers) {
            const { largeur, hauteur } = await dimensionsDeLImage(fichier);
            pages.push({ nom: fichier.name, blob: fichier, largeur, hauteur });
        }
        return pages;
    }

    function supprimerImage(image: ImageDeTrajet): void {
        if (trajet === null) {
            return;
        }
        const nombreDePoints = trajet.pointsDeLImage(image.id).length;
        const confirme = confirm(
            `Supprimer « ${image.nom} » ? ${String(nombreDePoints)} point(s) seront supprimés avec elle.`,
        );
        if (!confirme) {
            return;
        }
        lancer(
            appliquerAuTrajetEtEnregistrer((trajetCourant) => {
                trajetCourant.supprimerImage(image.id);
            }),
            'la suppression de la page',
        );
    }

    // --- Points ---------------------------------------------------------------

    async function surClicSurImage(
        image: ImageDeTrajet,
        zone: HTMLElement,
        clientY: number,
    ): Promise<void> {
        if (modeDePlacement === null) {
            return;
        }
        const fraction = fractionDepuisPosition(zone, clientY);
        const mode = modeDePlacement;
        changerDeMode(null);

        if (mode.type === 'deplacement') {
            await appliquerAuTrajetEtEnregistrer((trajetCourant) => {
                trajetCourant.deplacerPointSurImage(mode.pointId, image.id, fraction);
            });
            return;
        }
        await ajouterPointALaFraction(image, fraction);
    }

    // Clic droit : raccourci qui place directement un point à l'emplacement
    // visé (sans passer par le bouton « Ajouter un point ») et enchaîne
    // aussitôt sur le choix de la coordonnée.
    async function surClicDroitSurImage(
        image: ImageDeTrajet,
        zone: HTMLElement,
        clientY: number,
    ): Promise<void> {
        const fraction = fractionDepuisPosition(zone, clientY);
        changerDeMode(null);
        await ajouterPointALaFraction(image, fraction);
    }

    async function ajouterPointALaFraction(
        image: ImageDeTrajet,
        fraction: FractionVerticale,
    ): Promise<void> {
        const coordonnee = await choisirUneCoordonnee(null);
        if (coordonnee === null) {
            return;
        }
        await appliquerAuTrajetEtEnregistrer((trajetCourant) => {
            trajetCourant.ajouterPoint({ imageId: image.id, fraction, coordonnee });
        });
    }

    /**
     * Sur grand écran (iPad paysage compris), la coordonnée se choisit d'un
     * clic sur la carte intégrée ; sur mobile, sur la carte plein écran. Les
     * deux honorent la coordonnée de départ : déplacer un point rouvre la carte
     * là où il se trouve, quelle que soit la taille de l'écran.
     */
    async function choisirUneCoordonnee(initiale: Coordonnee | null): Promise<Coordonnee | null> {
        const reperes = pointsPourLaCarte(
            trajet === null ? [] : trajet.pointsNumerotesDansLOrdreDuVoyage(),
        );
        if (!surGrandEcran()) {
            return selecteurDeCoordonnee.choisir(initiale, reperes);
        }
        texteConsigne.textContent = 'Cliquez la coordonnée sur la carte…';
        consigne.hidden = false;
        try {
            return await carteDesPoints.choisirUneCoordonnee(initiale);
        } finally {
            consigne.hidden = modeDePlacement === null;
        }
    }

    function fractionDepuisPosition(zone: HTMLElement, clientY: number): FractionVerticale {
        const cadre = zone.getBoundingClientRect();
        return FractionVerticale.depuisHauteur(clientY - cadre.top, cadre.height);
    }

    async function deplacerPointSurLaCarte(point: Point): Promise<void> {
        const coordonnee = await choisirUneCoordonnee(point.coordonnee);
        if (coordonnee === null) {
            return;
        }
        await appliquerAuTrajetEtEnregistrer((trajetCourant) => {
            trajetCourant.deplacerPointSurCarte(point.id, coordonnee);
        });
    }

    function supprimerPoint(point: Point, numero: number): void {
        if (!confirm(`Supprimer le point ${String(numero)} ?`)) {
            return;
        }
        lancer(
            appliquerAuTrajetEtEnregistrer((trajetCourant) => {
                trajetCourant.supprimerPoint(point.id);
            }),
            'la suppression du point',
        );
    }

    function commencerLAjoutDUnPoint(): void {
        changerDeMode({ type: 'ajout' });
    }

    function changerDeMode(mode: ModeDePlacement): void {
        modeDePlacement = mode;
        if (mode !== null) {
            texteConsigne.textContent = "Touchez l'image à la hauteur voulue…";
        }
        consigne.hidden = mode === null;
        conteneurDesPages.classList.toggle('placement-actif', mode !== null);
    }

    // --- Rendu ----------------------------------------------------------------

    function rendre(): void {
        const trajetCourant = trajet;
        if (trajetCourant === null) {
            return;
        }
        titre.textContent = trajetCourant.nom.valeur;
        const numeros = trajetCourant.pointsNumerotesDansLOrdreDuVoyage();

        // La pile s'affiche comme le document se lit (de bas en haut) : la
        // première page du voyage tout en bas, la dernière tout en haut.
        pile.rendre(trajetCourant.imagesDansLOrdreDeLecture(), (page, element) =>
            cadreDImage(trajetCourant, page, element, numeros),
        );

        listePoints.replaceChildren(
            ...numeros.map(({ point, numero }) => ligneDePoint(trajetCourant, point, numero)),
        );

        carteDesPoints.afficher(pointsPourLaCarte(numeros), (pointId, coordonnee) => {
            // Ce callback se déclenche plus tard (glisser d'un marqueur) : le
            // trajet courant a pu changer entre-temps, la file s'en assure.
            lancer(
                appliquerAuTrajetEtEnregistrer((aModifier) => {
                    aModifier.deplacerPointSurCarte(pointId, coordonnee);
                }),
                'le déplacement du point',
            );
        });
    }

    function cadreDImage(
        trajetCourant: Trajet,
        page: PageAAfficher,
        element: HTMLImageElement,
        numeros: readonly { point: Point; numero: number }[],
    ): HTMLElement {
        const image = imageDuTrajet(trajetCourant, page.id);
        const cadre = document.createElement('div');
        cadre.className = 'cadre-image';

        const barre = document.createElement('div');
        barre.className = 'barre-image';
        const nom = document.createElement('span');
        nom.className = 'nom-image';
        nom.textContent = image.nom;
        barre.append(nom, ...boutonsDeLaPage(image).map(creerBouton));

        const zone = document.createElement('div');
        zone.className = 'zone-image';
        zone.append(element);
        for (const { point, numero } of numeros) {
            if (point.imageId === image.id) {
                zone.append(marqueurDePoint(point, numero));
            }
        }
        zone.addEventListener('click', (evenement) => {
            lancer(surClicSurImage(image, zone, evenement.clientY), 'le placement du point');
        });
        // Le menu contextuel natif du navigateur est remplacé par l'ajout direct du point.
        zone.addEventListener('contextmenu', (evenement) => {
            evenement.preventDefault();
            lancer(surClicDroitSurImage(image, zone, evenement.clientY), 'l’ajout du point');
        });

        cadre.append(barre, zone);
        return cadre;
    }

    /**
     * La pile étant affichée dans l'ordre inverse du voyage (première page en
     * bas), monter une page à l'écran la fait **avancer** dans le voyage. Les
     * méthodes de l'agrégat portent le nom du voyage, les intitulés celui de
     * l'écran : l'équivalence est écrite ici, une fois.
     */
    function boutonsDeLaPage(image: ImageDeTrajet): Bouton[] {
        return [
            {
                texte: '🔼',
                intitule: `Monter ${image.nom}`,
                action: () => {
                    deplacerLaPage(image.id, 'avancer');
                },
            },
            {
                texte: '🔽',
                intitule: `Descendre ${image.nom}`,
                action: () => {
                    deplacerLaPage(image.id, 'reculer');
                },
            },
            {
                texte: '🗑️ Supprimer',
                intitule: `Supprimer ${image.nom}`,
                action: () => {
                    supprimerImage(image);
                },
                danger: true,
            },
        ];
    }

    function deplacerLaPage(imageId: ImageId, sens: 'avancer' | 'reculer'): void {
        lancer(
            appliquerAuTrajetEtEnregistrer((trajetCourant) => {
                if (sens === 'avancer') {
                    trajetCourant.avancerImageDansLeVoyage(imageId);
                } else {
                    trajetCourant.reculerImageDansLeVoyage(imageId);
                }
            }),
            'le déplacement de la page',
        );
    }

    function ligneDePoint(trajetCourant: Trajet, point: Point, numero: number): HTMLLIElement {
        const image = imageDuTrajet(trajetCourant, point.imageId);
        const ligne = document.createElement('li');
        ligne.className = 'ligne-point';

        const description = document.createElement('span');
        description.className = 'description-point';
        description.textContent =
            `Point ${String(numero)} — ${image.nom} à ${String(Math.round(point.fraction.valeur * 100))} % — ` +
            `${point.coordonnee.latitude.toFixed(4)}, ${point.coordonnee.longitude.toFixed(4)}`;

        ligne.append(description, ...actionsDuPoint(point, numero).map(creerBouton));
        return ligne;
    }

    function marqueurDePoint(point: Point, numero: number): HTMLElement {
        const marqueur = document.createElement('div');
        marqueur.className = 'marqueur-point';
        marqueur.style.top = `${String(point.fraction.valeur * 100)}%`;

        const etiquette = document.createElement('span');
        etiquette.className = 'numero-point';
        etiquette.textContent = String(numero);

        // Boutons flottants : les mêmes actions que la liste, mais directement sur
        // l'image, pour ne pas avoir à remonter en haut de la page à chaque point.
        const actions = document.createElement('div');
        actions.className = 'actions-point';
        actions.append(
            ...actionsDuPoint(point, numero).map((action) =>
                creerBouton({ ...action, variante: 'flottant' }),
            ),
        );

        marqueur.append(etiquette, actions);
        return marqueur;
    }

    /** Les trois actions possibles sur un point, partagées entre la liste et les boutons flottants. */
    function actionsDuPoint(point: Point, numero: number): Bouton[] {
        return [
            {
                texte: "🖼️ Sur l'image",
                intitule: `Déplacer le point ${String(numero)} sur l'image`,
                action: () => {
                    changerDeMode({ type: 'deplacement', pointId: point.id });
                },
            },
            {
                texte: '🗺️ Sur la carte',
                intitule: `Déplacer le point ${String(numero)} sur la carte`,
                action: () => {
                    lancer(deplacerPointSurLaCarte(point), 'le déplacement du point');
                },
            },
            {
                texte: '🗑️ Supprimer',
                intitule: `Supprimer le point ${String(numero)}`,
                action: () => {
                    supprimerPoint(point, numero);
                },
                danger: true,
            },
        ];
    }

    return { afficher };
}

/**
 * Les points numérotés du trajet, tels que la carte les attend. La conversion
 * vers le port appartient à l'adaptateur entrant : c'est une ligne, et la
 * partager entre deux capacités obligeait l'écran de suivi à emprunter un module
 * à l'interface des trajets.
 */
function pointsPourLaCarte(numeros: readonly { point: Point; numero: number }[]): PointAffiche[] {
    return numeros.map(({ point, numero }) => ({
        id: point.id,
        numero,
        coordonnee: point.coordonnee,
    }));
}

/**
 * L'agrégat garantit que toute page affichée est une de ses images : l'absence
 * ne peut pas arriver, mais elle se dit plutôt que de se taire.
 */
function imageDuTrajet(trajet: Trajet, imageId: string): ImageDeTrajet {
    const image = trajet.images.find((candidate) => candidate.id === imageId);
    if (image === undefined) {
        throw new Error(`Incohérence : la page ${imageId} n'appartient pas au trajet.`);
    }
    return image;
}

async function dimensionsDeLImage(fichier: File): Promise<{ largeur: number; hauteur: number }> {
    let bitmap: ImageBitmap;
    try {
        bitmap = await createImageBitmap(fichier);
    } catch {
        throw new Error(`« ${fichier.name} » n’est pas une image lisible.`);
    }
    try {
        return { largeur: bitmap.width, hauteur: bitmap.height };
    } finally {
        bitmap.close();
    }
}
