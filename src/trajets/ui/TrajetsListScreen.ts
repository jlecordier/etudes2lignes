import { query } from '../../shared/dom';
import { createButton } from '../../shared/elements';
import type { Run } from '../../shared/runner';
import { NomDeTrajet } from '../domain/NomDeTrajet';
import { Trajet } from '../domain/Trajet';
import type { TrajetId } from '../domain/ids';
import type { TrajetSummary, TrajetRepository } from '../ports/TrajetRepository';
import { exportTrajetToJson, importTrajetFromJson } from '../serialization/trajetJson';

export interface TrajetsListDependencies {
    repository: TrajetRepository;
    run: Run;
    onOpen: (id: TrajetId) => void;
}

/** Écran d'accueil : la liste des trajets (créer, renommer, supprimer, ouvrir). */
export function createTrajetsListScreen(dependencies: TrajetsListDependencies): {
    show: () => Promise<void>;
} {
    const { repository, run, onOpen } = dependencies;
    const liste = query('#trajets-list', HTMLUListElement);
    const emptyMessage = query('#empty-list', HTMLParagraphElement);
    const createTrajetButton = query('#create-trajet-button', HTMLButtonElement);
    const importButton = query('#import-trajet-button', HTMLButtonElement);
    const importFileInput = query('#input-import-trajet', HTMLInputElement);

    createTrajetButton.addEventListener('click', () => {
        run(createTrajet(), 'la création du trajet');
    });
    importButton.addEventListener('click', () => {
        importFileInput.click();
    });
    importFileInput.addEventListener('change', () => {
        run(importTrajet(), 'l’import du trajet');
    });

    async function show(): Promise<void> {
        try {
            const summaries = await repository.listSummaries();
            liste.replaceChildren(...summaries.map(trajetRow));
            emptyMessage.hidden = summaries.length > 0;
        } catch (error) {
            // La liste est la porte d'entrée de l'application : si elle ne
            // s'ouvre pas, l'utilisateur n'a plus aucune prise. On lui dit ce
            // qui se passe et on lui laisse de quoi réessayer.
            emptyMessage.hidden = true;
            liste.replaceChildren(errorRow(error));
        }
    }

    async function createTrajet(): Promise<void> {
        const nom = promptUsableNom('Nom du trajet ?');
        if (nom === null) {
            return;
        }
        await repository.save(Trajet.create(nom));
        await show();
    }

    async function renameTrajet(summary: TrajetSummary): Promise<void> {
        const nom = promptUsableNom('Nouveau nom du trajet ?', summary.nom);
        if (nom === null) {
            return;
        }
        const trajet = await repository.load(summary.id);
        if (trajet === null) {
            await show();
            return;
        }
        trajet.rename(nom);
        await repository.save(trajet);
        await show();
    }

    async function importTrajet(): Promise<void> {
        const file = importFileInput.files?.[0];
        importFileInput.value = '';
        if (file === undefined) {
            return;
        }
        const trajet = await readTrajetFile(file);
        if (trajet === null) {
            return;
        }
        // L'échec d'enregistrement remonte à la frontière d'erreur, qui sait
        // nommer le débordement de quota — fréquent sur mobile avec des pages.
        await repository.save(trajet);
        await show();
    }

    /**
     * Lit un fichier de trajet, ou explique précisément ce qui ne va pas.
     *
     * La lecture et la validation portent des messages distincts, et ceux de la
     * validation viennent du domaine : sans ce découpage, un fichier étranger
     * afficherait le message technique brut du navigateur.
     */
    async function readTrajetFile(file: File): Promise<Trajet | null> {
        let text: string;
        try {
            text = await file.text();
        } catch {
            alert('Fichier illisible : impossible de lire ce fichier.');
            return null;
        }
        try {
            return importTrajetFromJson(text);
        } catch (error) {
            alert(readableMessage(error));
            return null;
        }
    }

    async function exportTrajet(summary: TrajetSummary): Promise<void> {
        const trajet = await repository.load(summary.id);
        if (trajet === null) {
            await show();
            return;
        }
        telecharger(await exportTrajetToJson(trajet), `${fileNameFrom(summary.nom)}.json`);
    }

    async function deleteTrajet(summary: TrajetSummary): Promise<void> {
        const confirme = confirm(
            `Supprimer le trajet « ${summary.nom} » ? Ses images et ses points seront perdus.`,
        );
        if (!confirme) {
            return;
        }
        await repository.delete(summary.id);
        await show();
    }

    function trajetRow(summary: TrajetSummary): HTMLLIElement {
        const ligne = document.createElement('li');
        ligne.className = 'trajet-row';

        // Le nom du trajet est le titre cliquable de la ligne, pas une action
        // secondaire : son nom accessible est le nom du trajet, tout court.
        const openButton = document.createElement('button');
        openButton.type = 'button';
        openButton.className = 'trajet-name';
        openButton.textContent = summary.nom;
        openButton.addEventListener('click', () => {
            onOpen(summary.id);
        });

        const details = document.createElement('span');
        details.className = 'trajet-details';
        details.textContent = `${String(summary.imageCount)} image(s) · ${String(summary.pointCount)} point(s)`;

        ligne.append(
            openButton,
            details,
            createButton({
                text: '✏️ Renommer',
                ariaLabel: `Renommer ${summary.nom}`,
                action: () => {
                    run(renameTrajet(summary), 'le renommage du trajet');
                },
            }),
            createButton({
                text: '⬇️ Exporter',
                ariaLabel: `Exporter ${summary.nom}`,
                action: () => {
                    run(exportTrajet(summary), 'l’export du trajet');
                },
            }),
            createButton({
                text: '🗑️ Supprimer',
                ariaLabel: `Supprimer ${summary.nom}`,
                action: () => {
                    run(deleteTrajet(summary), 'la suppression du trajet');
                },
                danger: true,
            }),
        );
        return ligne;
    }

    /** La liste n'a pas pu être lue : dire quoi, et laisser réessayer. */
    function errorRow(error: unknown): HTMLLIElement {
        const ligne = document.createElement('li');
        ligne.className = 'trajet-row';

        const explication = document.createElement('span');
        explication.className = 'point-description';
        explication.textContent = `Impossible de lire la liste des trajets. ${readableMessage(error)}`;

        ligne.append(
            explication,
            createButton({
                text: '🔄 Réessayer',
                ariaLabel: 'Réessayer de lire la liste des trajets',
                action: () => {
                    run(show(), 'la lecture de la liste');
                },
            }),
        );
        return ligne;
    }

    return { show };
}

/** Délai avant de libérer l'URL blob d'un téléchargement (une minute). */
const REVOCATION_DELAY_MS = 60_000;

/** Déclenche le téléchargement d'un fichier texte par le navigateur. */
function telecharger(content: string, fileName: string): void {
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = fileName;
    lien.click();
    // Révocation différée : Safari/iOS et Firefox lisent le blob après le tick
    // courant ; le révoquer tout de suite annulerait le téléchargement.
    setTimeout(() => {
        URL.revokeObjectURL(url);
    }, REVOCATION_DELAY_MS);
}

/** Un nom de trajet peut contenir des caractères interdits dans un nom de fichier. */
function fileNameFrom(nom: string): string {
    return nom.replace(/[/\\:*?"<>|]/g, '-');
}

/**
 * Demande un nom à l'utilisateur, et rend `null` s'il n'y a **pas de nom
 * utilisable** — qu'il ait annulé ou saisi un nom que le domaine refuse, cas
 * où il a déjà été prévenu. Les deux appelants abandonnent pareillement : les
 * distinguer par un type n'apporterait rien qu'ils sauraient utiliser.
 */
function promptUsableNom(question: string, initialValue = ''): NomDeTrajet | null {
    const saisie = prompt(question, initialValue);
    if (saisie === null) {
        return null;
    }
    try {
        return NomDeTrajet.create(saisie);
    } catch (erreur) {
        alert(readableMessage(erreur));
        return null;
    }
}

/** Les messages du domaine et du dépôt sont écrits pour être lus : on les reprend. */
function readableMessage(erreur: unknown): string {
    return erreur instanceof Error ? erreur.message : String(erreur);
}
