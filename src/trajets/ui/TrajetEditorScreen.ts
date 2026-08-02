import type { CarteDesPoints, DisplayedPoint } from '../../carte/ports/CarteDesPointsPort';
import type { CoordonneeSelector } from '../../carte/ports/CoordonneeSelectorPort';
import { query } from '../../shared/dom';
import { createButton, type Button } from '../../shared/elements';
import { createQueue } from '../../shared/queue';
import type { Run } from '../../shared/runner';
import { createSchemaPage } from '../../shared/SchemaPage';
import { defineScreen } from '../../shared/screen';
import type { Coordonnee } from '../domain/Coordonnee';
import { FractionVerticale } from '../domain/FractionVerticale';
import type { ImageDeTrajet, ImageFile, Point, Trajet } from '../domain/Trajet';
import type { ImageId, PointId, TrajetId } from '../domain/ids';
import type { TrajetRepository } from '../ports/TrajetRepository';
import html from './TrajetEditorScreen.html?raw';

export interface TrajetEditorDependencies {
    repository: TrajetRepository;
    coordonneeSelector: CoordonneeSelector;
    carteDesPoints: CarteDesPoints;
    run: Run;
    /** L'écran est fabriqué **pour** un trajet : il n'a pas de vie sans lui. */
    trajetId: TrajetId;
    onBack: () => void;
    onSuivi: () => void;
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

/**
 * Écran d'édition d'un trajet : ses images et ses points géo-référencés.
 *
 * L'écran vit le temps de son attachement au document. Le détachement avorte le
 * signal, ce qui retire tous les écouteurs et démonte la carte — laquelle ne
 * peut pas survivre à son conteneur.
 */
export const createTrajetEditorScreen = defineScreen<TrajetEditorDependencies>(
    'trajet-editor-screen',
    html,
    mount,
);

function mount(
    root: HTMLElement,
    dependencies: TrajetEditorDependencies,
    signal: AbortSignal,
): void {
    const { repository, coordonneeSelector, carteDesPoints, run, trajetId, onBack, onSuivi } =
        dependencies;
    const title = query('#trajet-title', HTMLHeadingElement, root);
    const pointsList = query('#points-list', HTMLOListElement, root);
    const hintBanner = query('#placement-hint', HTMLParagraphElement, root);
    const hintText = query('#hint-text', HTMLSpanElement, root);
    const addImagesButton = query('#add-images-button', HTMLButtonElement, root);
    const addPointButton = query('#add-point-button', HTMLButtonElement, root);
    // Même action que `addPointButton`, mais toujours à l'écran (position
    // fixe) : sur tactile, sans clic droit, c'est le seul moyen d'ajouter un
    // point sans remonter tout en haut de la page.
    const floatingAddPointButton = query('#floating-add-point-button', HTMLButtonElement, root);
    const fileInput = query('#input-images', HTMLInputElement, root);
    const pagesContainer = query('#images-stack', HTMLDivElement, root);

    let trajet: Trajet | null = null;
    let placementMode: PlacementMode = null;
    const saveQueue = createQueue();

    // La carte se monte sur le conteneur que cet écran vient de créer : elle ne
    // peut pas être mémorisée d'une visite à l'autre, son conteneur non plus.
    carteDesPoints.mount(query('#carte-points', HTMLElement, root));

    query('#back-to-list-button', HTMLButtonElement, root).addEventListener('click', onBack, {
        signal,
    });
    query('#suivre-button', HTMLButtonElement, root).addEventListener(
        'click',
        () => {
            if (trajet === null) {
                return;
            }
            onSuivi();
        },
        { signal },
    );
    addImagesButton.addEventListener(
        'click',
        () => {
            fileInput.click();
        },
        { signal },
    );
    fileInput.addEventListener(
        'change',
        () => {
            run(importFiles(), 'l’ajout des pages');
        },
        { signal },
    );
    addPointButton.addEventListener('click', startAddingPoint, { signal });
    floatingAddPointButton.addEventListener('click', startAddingPoint, { signal });
    query('#cancel-placement-button', HTMLButtonElement, root).addEventListener(
        'click',
        () => {
            changeMode(null);
            carteDesPoints.cancelChoice();
        },
        { signal },
    );

    /**
     * Quitter l'écran, c'est le détacher — et tout le rangement tient ici. Les
     * pages libèrent leurs URL d'objet toutes seules en partant avec lui ;
     * `unmount` abandonne au passage un choix de coordonnée encore armé.
     */
    signal.addEventListener('abort', () => {
        carteDesPoints.unmount();
    });

    run(charger(), 'l’ouverture du trajet');

    async function charger(): Promise<void> {
        const loaded = await repository.load(trajetId);
        if (signal.aborted) {
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
            if (signal.aborted) {
                return;
            }
            render();
        });
    }

    /** Reprend l'état réellement enregistré, après un échec d'écriture. */
    async function resynchroniser(): Promise<void> {
        try {
            const recharge = await repository.load(trajetId);
            if (signal.aborted) {
                return;
            }
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
                currentTrajet.addImagesInReadingOrder(pages);
            });
        } finally {
            // Sans cela, un fichier illisible laisse la sélection en place :
            // re-choisir les mêmes fichiers n'émettrait plus d'événement
            // « change », et l'import resterait mort jusqu'au rechargement.
            fileInput.value = '';
        }
    }

    async function preparePages(files: readonly File[]): Promise<ImageFile[]> {
        const pages: ImageFile[] = [];
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
        pagesContainer.replaceChildren(
            ...currentTrajet.imagesInReadingOrder().map((image) => imageFrame(image, numbers)),
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
        image: ImageDeTrajet,
        numbers: readonly { point: Point; number: number }[],
    ): HTMLElement {
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
        area.append(createSchemaPage(image));
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
