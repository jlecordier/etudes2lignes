import type { CarteDesPoints, DisplayedPoint } from '../../carte/ports/CarteDesPointsPort';
import type { CoordonneeSelector } from '../../carte/ports/CoordonneeSelectorPort';
import { query } from '../../shared/dom';
import { createButton, type Button } from '../../shared/elements';
import { createQueue } from '../../shared/queue';
import type { Run } from '../../shared/runner';
import { createPageStack, type DisplayablePage } from '../../shared/pageStack';
import type { Coordonnee } from '../domain/Coordonnee';
import { FractionVerticale } from '../domain/FractionVerticale';
import type { ImageDeTrajet, Point, Trajet } from '../domain/Trajet';
import type { ImageId, PointId, TrajetId } from '../domain/ids';
import type { TrajetRepository } from '../ports/TrajetRepository';

export interface TrajetEditorDependencies {
    repository: TrajetRepository;
    coordonneeSelector: CoordonneeSelector;
    carteDesPoints: CarteDesPoints;
    run: Run;
    onBack: () => void;
    onSuivi: (id: TrajetId) => void;
}

type PlacementMode = { type: 'ajout' } | { type: 'deplacement'; pointId: PointId } | null;

/**
 * Le seuil du grand écran (iPad paysage oui, iPad portrait non) est défini par
 * la feuille de style, seule, qui l'expose par ce drapeau : la valeur était
 * recopiée ici et dans les tests, où elle pouvait diverger en silence.
 */
function isLargeScreen(): boolean {
    return (
        getComputedStyle(document.documentElement).getPropertyValue('--large-screen').trim() === '1'
    );
}

/** Écran d'édition d'un trajet : ses images et ses points géo-référencés. */
export function createTrajetEditorScreen(dependencies: TrajetEditorDependencies): {
    show: (id: TrajetId) => Promise<void>;
} {
    const { repository, coordonneeSelector, carteDesPoints, run, onBack, onSuivi } = dependencies;
    const title = query('#trajet-title', HTMLHeadingElement);
    const pointsList = query('#points-list', HTMLOListElement);
    const hintBanner = query('#placement-hint', HTMLParagraphElement);
    const hintText = query('#hint-text', HTMLSpanElement);
    const addImagesButton = query('#add-images-button', HTMLButtonElement);
    const addPointButton = query('#add-point-button', HTMLButtonElement);
    // Même action que `addPointButton`, mais toujours à l'écran (position
    // fixe) : sur tactile, sans clic droit, c'est le seul moyen d'ajouter un
    // point sans remonter tout en haut de la page.
    const floatingAddPointButton = query('#floating-add-point-button', HTMLButtonElement);
    const fileInput = query('#input-images', HTMLInputElement);
    const pagesContainer = query('#images-stack', HTMLDivElement);
    const stack = createPageStack(pagesContainer);

    let trajet: Trajet | null = null;
    let displayedId: TrajetId | null = null;
    // Incrémenté à chaque affichage et à chaque sortie : un chargement dont le
    // jeton est périmé (autre trajet ouvert entre-temps) n'écrase plus l'écran.
    let displayToken = 0;
    let placementMode: PlacementMode = null;
    const saveQueue = createQueue();

    query('#back-to-list-button', HTMLButtonElement).addEventListener('click', () => {
        leaveScreen();
        onBack();
    });
    query('#suivre-button', HTMLButtonElement).addEventListener('click', () => {
        if (trajet === null) {
            return;
        }
        const id = trajet.id;
        leaveScreen();
        onSuivi(id);
    });
    addImagesButton.addEventListener('click', () => {
        fileInput.click();
    });
    fileInput.addEventListener('change', () => {
        run(importFiles(), 'l’ajout des pages');
    });
    addPointButton.addEventListener('click', startAddingPoint);
    floatingAddPointButton.addEventListener('click', startAddingPoint);
    query('#cancel-placement-button', HTMLButtonElement).addEventListener('click', () => {
        changeMode(null);
        carteDesPoints.cancelChoice();
    });

    function leaveScreen(): void {
        displayToken++;
        stack.destroy();
        changeMode(null);
        carteDesPoints.cancelChoice();
        trajet = null;
        displayedId = null;
    }

    async function show(id: TrajetId): Promise<void> {
        displayedId = id;
        const jeton = ++displayToken;
        const loaded = await repository.load(id);
        if (jeton !== displayToken) {
            return;
        }
        // Trajet supprimé entre-temps (ex. restauration d'un identifiant périmé).
        if (loaded === null) {
            onBack();
            return;
        }
        trajet = loaded;
        changeMode(null);
        render();
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
    function applyToTrajetAndSave(modification: (trajet: Trajet) => void): Promise<void> {
        return saveQueue(async () => {
            const currentTrajet = trajet;
            if (currentTrajet === null) {
                return;
            }
            modification(currentTrajet);
            try {
                await repository.save(currentTrajet);
            } catch (error) {
                await resynchroniser();
                throw error;
            }
            render();
        });
    }

    /** Reprend l'état réellement enregistré, après un échec d'écriture. */
    async function resynchroniser(): Promise<void> {
        if (displayedId === null) {
            return;
        }
        try {
            const recharge = await repository.load(displayedId);
            if (recharge === null) {
                onBack();
                return;
            }
            trajet = recharge;
            render();
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
    async function importFiles(): Promise<void> {
        const files = fileInput.files;
        if (files === null || files.length === 0) {
            return;
        }
        try {
            const pages = await preparePages(Array.from(files));
            await applyToTrajetAndSave((currentTrajet) => {
                for (const page of pages) {
                    currentTrajet.addImage(page);
                }
            });
        } finally {
            // Sans cela, un fichier illisible laisse la sélection en place :
            // re-choisir les mêmes fichiers n'émettrait plus d'événement
            // « change », et l'import resterait mort jusqu'au rechargement.
            fileInput.value = '';
        }
    }

    async function preparePages(
        files: readonly File[],
    ): Promise<{ nom: string; blob: Blob; largeur: number; hauteur: number }[]> {
        const pages = [];
        for (const file of files) {
            const { largeur, hauteur } = await imageDimensions(file);
            pages.push({ nom: file.name, blob: file, largeur, hauteur });
        }
        return pages;
    }

    function deleteImage(image: ImageDeTrajet): void {
        if (trajet === null) {
            return;
        }
        const pointCount = trajet.pointsOfImage(image.id).length;
        const confirme = confirm(
            `Supprimer « ${image.nom} » ? ${String(pointCount)} point(s) seront supprimés avec elle.`,
        );
        if (!confirme) {
            return;
        }
        run(
            applyToTrajetAndSave((currentTrajet) => {
                currentTrajet.deleteImage(image.id);
            }),
            'la suppression de la page',
        );
    }

    // --- Points ---------------------------------------------------------------

    async function onImageClick(
        image: ImageDeTrajet,
        area: HTMLElement,
        clientY: number,
    ): Promise<void> {
        if (placementMode === null) {
            return;
        }
        const fraction = fractionFromPosition(area, clientY);
        const mode = placementMode;
        changeMode(null);

        if (mode.type === 'deplacement') {
            await applyToTrajetAndSave((currentTrajet) => {
                currentTrajet.movePointOnImage(mode.pointId, image.id, fraction);
            });
            return;
        }
        await addPointAtFraction(image, fraction);
    }

    // Clic droit : raccourci qui place directement un point à l'emplacement
    // visé (sans passer par le bouton « Ajouter un point ») et enchaîne
    // aussitôt sur le choix de la coordonnée.
    async function onImageRightClick(
        image: ImageDeTrajet,
        area: HTMLElement,
        clientY: number,
    ): Promise<void> {
        const fraction = fractionFromPosition(area, clientY);
        changeMode(null);
        await addPointAtFraction(image, fraction);
    }

    async function addPointAtFraction(
        image: ImageDeTrajet,
        fraction: FractionVerticale,
    ): Promise<void> {
        const coordonnee = await chooseCoordonnee(null);
        if (coordonnee === null) {
            return;
        }
        await applyToTrajetAndSave((currentTrajet) => {
            currentTrajet.addPoint({ imageId: image.id, fraction, coordonnee });
        });
    }

    /**
     * Sur grand écran (iPad paysage compris), la coordonnée se choisit d'un
     * clic sur la carte intégrée ; sur mobile, sur la carte plein écran. Les
     * deux honorent la coordonnée de départ : déplacer un point rouvre la carte
     * là où il se trouve, quelle que soit la taille de l'écran.
     */
    async function chooseCoordonnee(initial: Coordonnee | null): Promise<Coordonnee | null> {
        const reperes = pointsForCarte(
            trajet === null ? [] : trajet.numberedPointsInOrdreDuVoyage(),
        );
        if (!isLargeScreen()) {
            return coordonneeSelector.choose(initial, reperes);
        }
        hintText.textContent = 'Cliquez la coordonnée sur la carte…';
        hintBanner.hidden = false;
        try {
            return await carteDesPoints.chooseCoordonnee(initial);
        } finally {
            hintBanner.hidden = placementMode === null;
        }
    }

    function fractionFromPosition(area: HTMLElement, clientY: number): FractionVerticale {
        const frame = area.getBoundingClientRect();
        return FractionVerticale.fromHeight(clientY - frame.top, frame.height);
    }

    async function movePointOnCarte(point: Point): Promise<void> {
        const coordonnee = await chooseCoordonnee(point.coordonnee);
        if (coordonnee === null) {
            return;
        }
        await applyToTrajetAndSave((currentTrajet) => {
            currentTrajet.movePointOnCarte(point.id, coordonnee);
        });
    }

    function deletePoint(point: Point, number: number): void {
        if (!confirm(`Supprimer le point ${String(number)} ?`)) {
            return;
        }
        run(
            applyToTrajetAndSave((currentTrajet) => {
                currentTrajet.deletePoint(point.id);
            }),
            'la suppression du point',
        );
    }

    function startAddingPoint(): void {
        changeMode({ type: 'ajout' });
    }

    function changeMode(mode: PlacementMode): void {
        placementMode = mode;
        if (mode !== null) {
            hintText.textContent = "Touchez l'image à la hauteur voulue…";
        }
        hintBanner.hidden = mode === null;
        pagesContainer.classList.toggle('placement-active', mode !== null);
    }

    // --- Rendu ----------------------------------------------------------------

    function render(): void {
        const currentTrajet = trajet;
        if (currentTrajet === null) {
            return;
        }
        title.textContent = currentTrajet.nom.value;
        const numbers = currentTrajet.numberedPointsInOrdreDuVoyage();

        // La pile s'affiche comme le document se lit (de bas en haut) : la
        // première page du voyage tout en bas, la dernière tout en haut.
        stack.render(currentTrajet.imagesInReadingOrder(), (page, element) =>
            imageFrame(currentTrajet, page, element, numbers),
        );

        pointsList.replaceChildren(
            ...numbers.map(({ point, number }) => pointRow(currentTrajet, point, number)),
        );

        carteDesPoints.show(pointsForCarte(numbers), (pointId, coordonnee) => {
            // Ce callback se déclenche plus tard (glisser d'un marqueur) : le
            // trajet courant a pu changer entre-temps, la file s'en assure.
            run(
                applyToTrajetAndSave((trajetToUpdate) => {
                    trajetToUpdate.movePointOnCarte(pointId, coordonnee);
                }),
                'le déplacement du point',
            );
        });
    }

    function imageFrame(
        currentTrajet: Trajet,
        page: DisplayablePage,
        element: HTMLImageElement,
        numbers: readonly { point: Point; number: number }[],
    ): HTMLElement {
        const image = trajetImage(currentTrajet, page.id);
        const frame = document.createElement('div');
        frame.className = 'image-frame';

        const bar = document.createElement('div');
        bar.className = 'image-bar';
        const nom = document.createElement('span');
        nom.className = 'image-name';
        nom.textContent = image.nom;
        bar.append(nom, ...pageButtons(image).map(createButton));

        const area = document.createElement('div');
        area.className = 'image-area';
        area.append(element);
        for (const { point, number } of numbers) {
            if (point.imageId === image.id) {
                area.append(pointMarker(point, number));
            }
        }
        area.addEventListener('click', (event) => {
            run(onImageClick(image, area, event.clientY), 'le placement du point');
        });
        // Le menu contextuel natif du navigateur est remplacé par l'ajout direct du point.
        area.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            run(onImageRightClick(image, area, event.clientY), 'l’ajout du point');
        });

        frame.append(bar, area);
        return frame;
    }

    /**
     * La pile étant affichée dans l'ordre inverse du voyage (première page en
     * bas), monter une page à l'écran la fait **avancer** dans le voyage. Les
     * méthodes de l'agrégat portent le nom du voyage, les intitulés celui de
     * l'écran : l'équivalence est écrite ici, une fois.
     */
    function pageButtons(image: ImageDeTrajet): Button[] {
        return [
            {
                text: '🔼',
                ariaLabel: `Monter ${image.nom}`,
                action: () => {
                    movePage(image.id, 'avancer');
                },
            },
            {
                text: '🔽',
                ariaLabel: `Descendre ${image.nom}`,
                action: () => {
                    movePage(image.id, 'reculer');
                },
            },
            {
                text: '🗑️ Supprimer',
                ariaLabel: `Supprimer ${image.nom}`,
                action: () => {
                    deleteImage(image);
                },
                danger: true,
            },
        ];
    }

    function movePage(imageId: ImageId, sens: 'avancer' | 'reculer'): void {
        run(
            applyToTrajetAndSave((currentTrajet) => {
                if (sens === 'avancer') {
                    currentTrajet.moveImageForwardInVoyage(imageId);
                } else {
                    currentTrajet.moveImageBackwardInVoyage(imageId);
                }
            }),
            'le déplacement de la page',
        );
    }

    function pointRow(currentTrajet: Trajet, point: Point, number: number): HTMLLIElement {
        const image = trajetImage(currentTrajet, point.imageId);
        const row = document.createElement('li');
        row.className = 'point-row';

        const description = document.createElement('span');
        description.className = 'point-description';
        description.textContent =
            `Point ${String(number)} — ${image.nom} à ${String(Math.round(point.fraction.value * 100))} % — ` +
            `${point.coordonnee.latitude.toFixed(4)}, ${point.coordonnee.longitude.toFixed(4)}`;

        row.append(description, ...pointActions(point, number).map(createButton));
        return row;
    }

    function pointMarker(point: Point, number: number): HTMLElement {
        const marker = document.createElement('div');
        marker.className = 'point-marker';
        marker.style.top = `${String(point.fraction.value * 100)}%`;

        const etiquette = document.createElement('span');
        etiquette.className = 'point-number';
        etiquette.textContent = String(number);

        // Boutons flottants : les mêmes actions que la liste, mais directement sur
        // l'image, pour ne pas avoir à remonter en haut de la page à chaque point.
        const actions = document.createElement('div');
        actions.className = 'point-actions';
        actions.append(
            ...pointActions(point, number).map((action) =>
                createButton({ ...action, variant: 'floating' }),
            ),
        );

        marker.append(etiquette, actions);
        return marker;
    }

    /** Les trois actions possibles sur un point, partagées entre la liste et les boutons flottants. */
    function pointActions(point: Point, number: number): Button[] {
        return [
            {
                text: "🖼️ Sur l'image",
                ariaLabel: `Déplacer le point ${String(number)} sur l'image`,
                action: () => {
                    changeMode({ type: 'deplacement', pointId: point.id });
                },
            },
            {
                text: '🗺️ Sur la carte',
                ariaLabel: `Déplacer le point ${String(number)} sur la carte`,
                action: () => {
                    run(movePointOnCarte(point), 'le déplacement du point');
                },
            },
            {
                text: '🗑️ Supprimer',
                ariaLabel: `Supprimer le point ${String(number)}`,
                action: () => {
                    deletePoint(point, number);
                },
                danger: true,
            },
        ];
    }

    return { show };
}

/**
 * Les points numérotés du trajet, tels que la carte les attend. La conversion
 * vers le port appartient à l'adaptateur entrant : c'est une ligne, et la
 * partager entre deux capacités obligeait l'écran de suivi à emprunter un module
 * à l'interface des trajets.
 */
function pointsForCarte(numbers: readonly { point: Point; number: number }[]): DisplayedPoint[] {
    return numbers.map(({ point, number }) => ({
        id: point.id,
        number,
        coordonnee: point.coordonnee,
    }));
}

/**
 * L'agrégat garantit que toute page affichée est une de ses images : l'absence
 * ne peut pas arriver, mais elle se dit plutôt que de se taire.
 */
function trajetImage(trajet: Trajet, imageId: string): ImageDeTrajet {
    const image = trajet.images.find((candidate) => candidate.id === imageId);
    if (image === undefined) {
        throw new Error(`Incohérence : la page ${imageId} n'appartient pas au trajet.`);
    }
    return image;
}

async function imageDimensions(file: File): Promise<{ largeur: number; hauteur: number }> {
    let bitmap: ImageBitmap;
    try {
        bitmap = await createImageBitmap(file);
    } catch {
        throw new Error(`« ${file.name} » n’est pas une image lisible.`);
    }
    try {
        return { largeur: bitmap.width, hauteur: bitmap.height };
    } finally {
        bitmap.close();
    }
}
