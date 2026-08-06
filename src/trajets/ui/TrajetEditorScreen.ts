import type { CarteDesPoints, DisplayedPoint } from '../../carte/ports/CarteDesPointsPort';
import type { CoordonneeSelector } from '../../carte/ports/CoordonneeSelectorPort';
import { query, queryAll } from '../../shared/dom';
import { createQueue } from '../../shared/queue';
import type { Run } from '../../shared/runner';
import { SchemaPageElement, createSchemaPage } from '../../shared/SchemaPage';
import { defineScreen } from '../../shared/screen';
import type { Coordonnee } from '../domain/Coordonnee';
import type { FractionVerticale } from '../domain/FractionVerticale';
import { pointCoordonneeText, pointDescriptionText } from '../domain/presentation';
import type { ImageDeTrajet, ImageFile, Point, Trajet } from '../domain/Trajet';
import type { ImageId, PointId, TrajetId } from '../domain/ids';
import type { TrajetRepository } from '../ports/TrajetRepository';
import { downloadTrajet } from './downloadTrajet';
import { createImageFrame } from './ImageFrame';
import type { PageAimIntent } from './intents';
import { PointMarkerElement } from './PointMarker';
import { createPointRow } from './PointRow';
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
    const pointsList = query('#points-list', HTMLDivElement, root);
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
    // L'export part de l'agrégat que l'écran a en mémoire, sans repasser par le
    // dépôt : toute écriture passe par `applyToTrajetAndSave`, qui resynchronise
    // sur échec — ce qui est affiché est donc ce qui est stocké.
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
    query('#cancel-placement-button', HTMLButtonElement, root).addEventListener(
        'click',
        () => {
            changeMode(null);
            carteDesPoints.cancelChoice();
        },
        { signal },
    );

    // Les fragments de l'écran annoncent, l'écran décide. Un seul jeu
    // d'écouteurs, posé sur la racine : les intentions y remontent, quel que
    // soit le nombre de pages et de points affichés.
    root.addEventListener(
        'click-page',
        (event) => {
            run(onImageClick(event.detail), 'le placement du point');
        },
        { signal },
    );
    root.addEventListener(
        'right-click-page',
        (event) => {
            run(onImageRightClick(event.detail), 'l’ajout du point');
        },
        { signal },
    );
    root.addEventListener(
        'move-image',
        (event) => {
            movePage(event.detail.imageId, event.detail.direction);
        },
        { signal },
    );
    root.addEventListener(
        'delete-image',
        (event) => {
            deleteImage(event.detail.imageId);
        },
        { signal },
    );
    root.addEventListener(
        'move-point-on-image',
        (event) => {
            changeMode({ type: 'deplacement', pointId: event.detail.pointId });
        },
        { signal },
    );
    root.addEventListener(
        'move-point-on-carte',
        (event) => {
            run(movePointOnCarte(event.detail.pointId), 'le déplacement du point');
        },
        { signal },
    );
    root.addEventListener(
        'show-point-on-image',
        (event) => {
            showPointOnImage(event.detail.pointId);
        },
        { signal },
    );
    root.addEventListener(
        'delete-point',
        (event) => {
            deletePoint(event.detail.pointId, event.detail.number);
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

    function deleteImage(imageId: ImageId): void {
        const currentTrajet = trajet;
        if (currentTrajet === null) {
            return;
        }
        const image = trajetImage(currentTrajet, imageId);
        const pointCount = currentTrajet.pointsOfImage(imageId).length;
        const confirme = confirm(
            `Supprimer « ${image.nom} » ? ${String(pointCount)} point(s) seront supprimés avec elle.`,
        );
        if (!confirme) {
            return;
        }
        run(
            applyToTrajetAndSave((trajetToUpdate) => {
                trajetToUpdate.deleteImage(imageId);
            }),
            'la suppression de la page',
        );
    }

    // --- Points ---------------------------------------------------------------

    async function onImageClick({ imageId, fraction }: PageAimIntent): Promise<void> {
        if (placementMode === null) {
            return;
        }
        const mode = placementMode;
        changeMode(null);

        if (mode.type === 'deplacement') {
            await applyToTrajetAndSave((currentTrajet) => {
                currentTrajet.movePointOnImage(mode.pointId, imageId, fraction);
            });
            return;
        }
        await addPointAtFraction(imageId, fraction);
    }

    // Clic droit : raccourci qui place directement un point à l'emplacement
    // visé (sans passer par le bouton « Ajouter un point ») et enchaîne
    // aussitôt sur le choix de la coordonnée.
    async function onImageRightClick({ imageId, fraction }: PageAimIntent): Promise<void> {
        changeMode(null);
        await addPointAtFraction(imageId, fraction);
    }

    async function addPointAtFraction(
        imageId: ImageId,
        fraction: FractionVerticale,
    ): Promise<void> {
        const coordonnee = await chooseCoordonnee(null);
        if (coordonnee === null) {
            return;
        }
        await applyToTrajetAndSave((currentTrajet) => {
            currentTrajet.addPoint({ imageId, fraction, coordonnee });
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

    async function movePointOnCarte(pointId: PointId): Promise<void> {
        const currentTrajet = trajet;
        if (currentTrajet === null) {
            return;
        }
        const coordonnee = await chooseCoordonnee(trajetPoint(currentTrajet, pointId).coordonnee);
        if (coordonnee === null) {
            return;
        }
        await applyToTrajetAndSave((trajetToUpdate) => {
            trajetToUpdate.movePointOnCarte(pointId, coordonnee);
        });
    }

    function deletePoint(pointId: PointId, number: number): void {
        if (!confirm(`Supprimer le point ${String(number)} ?`)) {
            return;
        }
        run(
            applyToTrajetAndSave((currentTrajet) => {
                currentTrajet.deletePoint(pointId);
            }),
            'la suppression du point',
        );
    }

    /**
     * Amène le repère du point au centre de l'écran.
     *
     * C'est le document affiché qui dit où le point se trouve, pas un calcul : le
     * repère est là, à sa hauteur, et le navigateur sait l'amener — y compris
     * quand la pile a été réordonnée depuis. Le centre, et non les trois quarts
     * hauts du suivi : cette fraction existe pour laisser voir ce qui arrive quand
     * on avance ; ici on ne suit rien, on vient regarder.
     */
    function showPointOnImage(pointId: PointId): void {
        // Le type des repères est annoté, et pas seulement déduit de `queryAll` :
        // sans cette annotation, fallow n'attribue pas la lecture de `pointId` à
        // la classe et déclare le membre inutilisé (vérifié dans les deux sens).
        const markers: readonly PointMarkerElement[] = queryAll(
            'point-marker',
            PointMarkerElement,
            pagesContainer,
        );
        const marker = markers.find((candidate) => candidate.pointId === pointId);
        marker?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

        // Les pages déjà montées sont **reprises**, pas refaites : chaque écriture
        // reconstruit les cadres et les repères, mais une image inchangée garde
        // son élément, donc son URL d'objet, donc son décodage. Sans cela,
        // déplacer un marqueur faisait redécoder tout le schéma.
        const montees = displayedPages();

        // La pile s'affiche comme le document se lit (de bas en haut) : la
        // première page du voyage tout en bas, la dernière tout en haut.
        pagesContainer.replaceChildren(
            ...currentTrajet.numberedImagesInReadingOrder().map(({ image, number: pageNumber }) =>
                createImageFrame({
                    schemaPage: montees.get(image.id) ?? createSchemaPage(image),
                    imageId: image.id,
                    nom: image.nom,
                    pageNumber,
                    markers: numbers
                        .filter(({ point }) => point.imageId === image.id)
                        .map(({ point, number }) => ({
                            pointId: point.id,
                            number,
                            fraction: point.fraction.value,
                        })),
                }),
            ),
        );

        pointsList.replaceChildren(
            ...numbers.map(({ point, number }) =>
                createPointRow({
                    pointId: point.id,
                    number,
                    // L'avancement et le numéro de page viennent de l'agrégat :
                    // lui seul connaît l'ordre du voyage et les proportions des
                    // pages, et il est le seul à numéroter ce que l'œil compte.
                    description: pointDescriptionText(
                        currentTrajet.progressOfPoint(point.id),
                        currentTrajet.pageNumberOfPoint(point.id),
                    ),
                    coordonnee: pointCoordonneeText(
                        point.coordonnee.latitude,
                        point.coordonnee.longitude,
                    ),
                }),
            ),
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

    /**
     * Les pages actuellement montées, par identifiant. Relues du DOM à chaque
     * rendu : c'est le document qui dit ce qui est affiché, jamais un cache
     * tenu à côté et qui pourrait mentir.
     */
    function displayedPages(): Map<string, SchemaPageElement> {
        return new Map(
            queryAll('schema-page', SchemaPageElement, pagesContainer).map((page) => [
                page.pageId,
                page,
            ]),
        );
    }

    /**
     * La pile étant affichée dans l'ordre inverse du voyage (première page en
     * bas), monter une page à l'écran la fait **avancer** dans le voyage. Les
     * intitulés parlent de l'écran, l'agrégat parle du voyage : `<image-frame>`
     * traduit l'un en l'autre, et il ne reste ici que l'intention.
     */
    function movePage(imageId: ImageId, direction: 'forward' | 'backward'): void {
        run(
            applyToTrajetAndSave((currentTrajet) => {
                if (direction === 'forward') {
                    currentTrajet.moveImageForwardInVoyage(imageId);
                } else {
                    currentTrajet.moveImageBackwardInVoyage(imageId);
                }
            }),
            'le déplacement de la page',
        );
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

/** Même garde pour un point : l'écran ne montre que ce que l'agrégat contient. */
function trajetPoint(trajet: Trajet, pointId: PointId): Point {
    const point = trajet.points.find((candidate) => candidate.id === pointId);
    if (point === undefined) {
        throw new Error(`Incohérence : le point ${pointId} n'appartient pas au trajet.`);
    }
    return point;
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
