import { requete } from '../../commun/dom';
import type { CarteDesPoints } from '../../carte/ports/CarteDesPointsPort';
import type { SelecteurDeCoordonnee } from '../../carte/ports/SelecteurDeCoordonneePort';
import type { Coordonnee } from '../domain/Coordonnee';
import { FractionVerticale } from '../domain/FractionVerticale';
import type { Trajet, ImageDeTrajet, Point } from '../domain/Trajet';
import type { ImageId, PointId, TrajetId } from '../domain/ids';
import type { TrajetRepository } from '../ports/TrajetRepository';
import { elementImagePleineLargeur, revoquerLesUrls } from './elementsDImage';
import { pointsAffiches } from './pointsAffiches';

export interface DependancesEditeurTrajet {
    repository: TrajetRepository;
    selecteurDeCoordonnee: SelecteurDeCoordonnee;
    carteDesPoints: CarteDesPoints;
    surRetour: () => void;
    surSuivi: (id: TrajetId) => void;
}

type ModeDePlacement = { type: 'ajout' } | { type: 'deplacement'; pointId: PointId } | null;

/** Même seuil que le CSS : iPad paysage = grand écran, iPad portrait = mobile. */
const GRAND_ECRAN = '(min-width: 900px)';

/** Écran d'édition d'un trajet : ses images et ses points géo-référencés. */
export function creerEditeurTrajetScreen(dependances: DependancesEditeurTrajet): {
    afficher: (id: TrajetId) => Promise<void>;
} {
    const { repository, selecteurDeCoordonnee, carteDesPoints, surRetour, surSuivi } = dependances;
    const titre = requete('#titre-trajet', HTMLHeadingElement);
    const pile = requete('#pile-images', HTMLDivElement);
    const listePoints = requete('#liste-points', HTMLOListElement);
    const consigne = requete('#consigne-placement', HTMLParagraphElement);
    const texteConsigne = requete('#texte-consigne', HTMLSpanElement);
    const boutonRetour = requete('#bouton-retour-liste', HTMLButtonElement);
    const boutonAjouterImages = requete('#bouton-ajouter-images', HTMLButtonElement);
    const boutonAjouterPoint = requete('#bouton-ajouter-point', HTMLButtonElement);
    // Même action que `boutonAjouterPoint`, mais toujours à l'écran (position
    // fixe) : sur tactile, sans clic droit, c'est le seul moyen d'ajouter un
    // point sans remonter tout en haut de la page.
    const boutonAjouterPointFlottant = requete('#bouton-ajouter-point-flottant', HTMLButtonElement);
    const boutonAnnulerPlacement = requete('#bouton-annuler-placement', HTMLButtonElement);
    const champFichiers = requete('#input-images', HTMLInputElement);

    let trajet: Trajet | null = null;
    let modeDePlacement: ModeDePlacement = null;
    const urlsARevoquer: string[] = [];

    boutonRetour.addEventListener('click', () => {
        quitterLEcran();
        surRetour();
    });
    requete('#bouton-suivre', HTMLButtonElement).addEventListener('click', () => {
        if (trajet === null) {
            return;
        }
        quitterLEcran();
        surSuivi(trajet.id);
    });
    boutonAjouterImages.addEventListener('click', () => {
        champFichiers.click();
    });
    champFichiers.addEventListener('change', () => void importerLesFichiers());
    boutonAjouterPoint.addEventListener('click', commencerLAjoutDUnPoint);
    boutonAjouterPointFlottant.addEventListener('click', commencerLAjoutDUnPoint);
    boutonAnnulerPlacement.addEventListener('click', () => {
        changerDeMode(null);
        carteDesPoints.annulerLeChoix();
    });

    function quitterLEcran(): void {
        revoquerLesUrls(urlsARevoquer);
        changerDeMode(null);
        carteDesPoints.annulerLeChoix();
    }

    async function afficher(id: TrajetId): Promise<void> {
        trajet = await repository.charger(id);
        // Trajet supprimé entre-temps (ex. restauration d'un identifiant périmé).
        if (trajet === null) {
            surRetour();
            return;
        }
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
        if (trajet === null) {
            return;
        }
        const nombreDePoints = trajet.points.filter((point) => point.imageId === image.id).length;
        const confirme = confirm(
            `Supprimer « ${image.nom} » ? ${nombreDePoints} point(s) seront supprimés avec elle.`,
        );
        if (!confirme) {
            return;
        }
        trajet.supprimerImage(image.id);
        await sauvegarderEtRendre();
    }

    // --- Points ---------------------------------------------------------------

    async function surClicSurImage(
        image: ImageDeTrajet,
        zone: HTMLElement,
        clientY: number,
    ): Promise<void> {
        if (trajet === null || modeDePlacement === null) {
            return;
        }
        const fraction = fractionDepuisPosition(zone, clientY);

        if (modeDePlacement.type === 'deplacement') {
            trajet.deplacerPointSurImage(modeDePlacement.pointId, image.id, fraction);
            changerDeMode(null);
            await sauvegarderEtRendre();
            return;
        }

        changerDeMode(null);
        await ajouterPointALaFraction(trajet, image, fraction);
    }

    // Clic droit : raccourci qui place directement un point à l'emplacement
    // visé (sans passer par le bouton « Ajouter un point ») et enchaîne
    // aussitôt sur le choix de la coordonnée.
    async function surClicDroitSurImage(
        image: ImageDeTrajet,
        zone: HTMLElement,
        clientY: number,
    ): Promise<void> {
        if (trajet === null) {
            return;
        }
        const fraction = fractionDepuisPosition(zone, clientY);
        changerDeMode(null);
        await ajouterPointALaFraction(trajet, image, fraction);
    }

    async function ajouterPointALaFraction(
        trajet: Trajet,
        image: ImageDeTrajet,
        fraction: FractionVerticale,
    ): Promise<void> {
        const coordonnee = await choisirUneCoordonnee(null);
        if (coordonnee === null) {
            return;
        }
        trajet.ajouterPoint({ imageId: image.id, fraction, coordonnee });
        await sauvegarderEtRendre();
    }

    /**
     * Sur grand écran (iPad paysage compris), la coordonnée se choisit d'un
     * clic sur la carte intégrée ; sur mobile, sur la carte plein écran.
     */
    async function choisirUneCoordonnee(initiale: Coordonnee | null): Promise<Coordonnee | null> {
        if (!window.matchMedia(GRAND_ECRAN).matches) {
            const reperes = trajet === null ? [] : pointsAffiches(trajet);
            return selecteurDeCoordonnee.choisir(initiale, reperes);
        }
        texteConsigne.textContent = 'Cliquez la coordonnée sur la carte…';
        consigne.hidden = false;
        try {
            return await carteDesPoints.choisirUneCoordonnee();
        } finally {
            consigne.hidden = modeDePlacement === null;
        }
    }

    function fractionDepuisPosition(zone: HTMLElement, clientY: number): FractionVerticale {
        const cadre = zone.getBoundingClientRect();
        return FractionVerticale.creer(borner((clientY - cadre.top) / cadre.height, 0, 1));
    }

    async function deplacerPointSurLaCarte(point: Point): Promise<void> {
        const coordonnee = await choisirUneCoordonnee(point.coordonnee);
        if (coordonnee === null) {
            return;
        }
        if (trajet === null) {
            return;
        }
        trajet.deplacerPointSurCarte(point.id, coordonnee);
        await sauvegarderEtRendre();
    }

    async function supprimerPoint(point: Point, numero: number): Promise<void> {
        if (!confirm(`Supprimer le point ${numero} ?`)) {
            return;
        }
        if (trajet === null) {
            return;
        }
        trajet.supprimerPoint(point.id);
        await sauvegarderEtRendre();
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
        pile.classList.toggle('placement-actif', mode !== null);
    }

    // --- Rendu ----------------------------------------------------------------

    async function sauvegarderEtRendre(): Promise<void> {
        if (trajet === null) {
            return;
        }
        await repository.sauvegarder(trajet);
        rendre();
    }

    function rendre(): void {
        if (trajet === null) {
            return;
        }
        // Capture le trajet non-null : les closures ci-dessous (map, callback)
        // perdraient sinon le narrowing de la garde ci-dessus.
        const trajetCourant = trajet;
        titre.textContent = trajetCourant.nom.valeur;
        revoquerLesUrls(urlsARevoquer);
        const numeros = numerosDesPoints(trajetCourant);
        // La pile s'affiche comme le document se lit (de bas en haut) : la
        // première page du voyage tout en bas, la dernière tout en haut.
        const imagesDeHautEnBas = [...trajetCourant.images].reverse();
        pile.replaceChildren(
            ...imagesDeHautEnBas.map((image) => cadreDImage(trajetCourant, image, numeros)),
        );
        listePoints.replaceChildren(
            ...trajetCourant
                .ordreVoyageDesPoints()
                .map((point, index) => ligneDePoint(trajetCourant, point, index + 1)),
        );
        carteDesPoints.afficher(pointsAffiches(trajetCourant), (pointId, coordonnee) => {
            // Ce callback se déclenche plus tard (glisser d'un marqueur) : on
            // revérifie le trajet courant du module, qui a pu changer entre-temps.
            if (trajet === null) {
                return;
            }
            trajet.deplacerPointSurCarte(pointId, coordonnee);
            void sauvegarderEtRendre();
        });
    }

    function cadreDImage(
        trajet: Trajet,
        image: ImageDeTrajet,
        numeros: Map<PointId, number>,
    ): HTMLElement {
        const cadre = document.createElement('div');
        cadre.className = 'cadre-image';

        const barre = document.createElement('div');
        barre.className = 'barre-image';
        const nom = document.createElement('span');
        nom.className = 'nom-image';
        nom.textContent = image.nom;
        barre.append(
            nom,
            boutonDAction('🔼', `Monter ${image.nom}`, () => void monterVisuellement(image.id)),
            boutonDAction(
                '🔽',
                `Descendre ${image.nom}`,
                () => void descendreVisuellement(image.id),
            ),
            boutonDAction(
                '🗑️ Supprimer',
                `Supprimer ${image.nom}`,
                () => void supprimerImage(image),
                true,
            ),
        );

        const zone = document.createElement('div');
        zone.className = 'zone-image';
        zone.append(elementImagePleineLargeur(image, urlsARevoquer));
        for (const point of trajet.points.filter((point) => point.imageId === image.id)) {
            const numero = numeros.get(point.id);
            // Tout point du trajet est numéroté : l'absence ne peut pas arriver.
            if (numero === undefined) {
                continue;
            }
            zone.append(marqueurDePoint(point, numero));
        }
        zone.addEventListener(
            'click',
            (evenement) => void surClicSurImage(image, zone, evenement.clientY),
        );
        // Le menu contextuel natif du navigateur est remplacé par l'ajout direct du point.
        zone.addEventListener('contextmenu', (evenement) => {
            evenement.preventDefault();
            void surClicDroitSurImage(image, zone, evenement.clientY);
        });

        cadre.append(barre, zone);
        return cadre;
    }

    // La pile étant affichée dans l'ordre inverse du voyage (première page en
    // bas), monter une image à l'écran = la faire avancer dans le voyage.
    async function monterVisuellement(imageId: ImageId): Promise<void> {
        if (trajet === null) {
            return;
        }
        trajet.descendreImage(imageId);
        await sauvegarderEtRendre();
    }

    async function descendreVisuellement(imageId: ImageId): Promise<void> {
        if (trajet === null) {
            return;
        }
        trajet.monterImage(imageId);
        await sauvegarderEtRendre();
    }

    function ligneDePoint(trajet: Trajet, point: Point, numero: number): HTMLLIElement {
        const image = trajet.images.find((image) => image.id === point.imageId);
        if (image === undefined) {
            throw new Error('Incohérence : un point référence une image absente du trajet.');
        }
        const ligne = document.createElement('li');
        ligne.className = 'ligne-point';

        const description = document.createElement('span');
        description.className = 'description-point';
        description.textContent =
            `Point ${numero} — ${image.nom} à ${Math.round(point.fraction.valeur * 100)} % — ` +
            `${point.coordonnee.latitude.toFixed(4)}, ${point.coordonnee.longitude.toFixed(4)}`;

        ligne.append(
            description,
            ...actionsDuPoint(point, numero).map(({ texte, intitule, declencher, dangereux }) =>
                boutonDAction(texte, intitule, declencher, dangereux),
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

        // Boutons flottants : les mêmes actions que la liste, mais directement sur
        // l'image, pour ne pas avoir à remonter en haut de la page à chaque point.
        const actions = document.createElement('div');
        actions.className = 'actions-point';
        actions.append(
            ...actionsDuPoint(point, numero).map(({ texte, intitule, declencher, dangereux }) =>
                boutonFlottant(texte, intitule, declencher, dangereux),
            ),
        );

        marqueur.append(etiquette, actions);
        return marqueur;
    }

    /** Les trois actions possibles sur un point, partagées entre la liste et les boutons flottants. */
    function actionsDuPoint(
        point: Point,
        numero: number,
    ): { texte: string; intitule: string; declencher: () => void; dangereux?: boolean }[] {
        return [
            {
                texte: "🖼️ Sur l'image",
                intitule: `Déplacer le point ${numero} sur l'image`,
                declencher: () => {
                    changerDeMode({ type: 'deplacement', pointId: point.id });
                },
            },
            {
                texte: '🗺️ Sur la carte',
                intitule: `Déplacer le point ${numero} sur la carte`,
                declencher: () => void deplacerPointSurLaCarte(point),
            },
            {
                texte: '🗑️ Supprimer',
                intitule: `Supprimer le point ${numero}`,
                declencher: () => void supprimerPoint(point, numero),
                dangereux: true,
            },
        ];
    }

    return { afficher };
}

function numerosDesPoints(trajet: Trajet): Map<PointId, number> {
    return new Map(trajet.ordreVoyageDesPoints().map((point, index) => [point.id, index + 1]));
}

function boutonDAction(
    texte: string,
    intitule: string,
    action: () => void,
    dangereux = false,
): HTMLButtonElement {
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = dangereux ? 'secondaire danger' : 'secondaire';
    bouton.textContent = texte;
    bouton.setAttribute('aria-label', intitule);
    bouton.addEventListener('click', action);
    return bouton;
}

/** Bouton compact posé sur l'image (voir `.actions-point`) : mêmes actions que `boutonDAction`. */
function boutonFlottant(
    texte: string,
    intitule: string,
    action: () => void,
    dangereux = false,
): HTMLButtonElement {
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className =
        dangereux ? 'secondaire bouton-flottant danger' : 'secondaire bouton-flottant';
    bouton.textContent = texte;
    bouton.setAttribute('aria-label', intitule);
    bouton.title = intitule;
    bouton.addEventListener('click', (evenement) => {
        // Empêche le clic de remonter jusqu'à la zone, qui ajouterait/déplacerait un point.
        evenement.stopPropagation();
        action();
    });
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
