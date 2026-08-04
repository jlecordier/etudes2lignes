import { query } from '../../shared/dom';
import type { Run } from '../../shared/runner';
import { defineScreen } from '../../shared/screen';
import { NomDeTrajet } from '../domain/NomDeTrajet';
import { Trajet } from '../domain/Trajet';
import type { TrajetId } from '../domain/ids';
import type { TrajetSummary, TrajetRepository } from '../ports/TrajetRepository';
import { importTrajetFromJson } from '../serialization/trajetJson';
import { downloadTrajet } from './downloadTrajet';
import { createTrajetRow } from './TrajetRow';
import html from './TrajetsListScreen.html?raw';

export interface TrajetsListDependencies {
    repository: TrajetRepository;
    run: Run;
    onOpen: (id: TrajetId) => void;
}

/** Écran d'accueil : la liste des trajets (créer, renommer, supprimer, ouvrir). */
export const createTrajetsListScreen = defineScreen<TrajetsListDependencies>(
    'trajets-list-screen',
    html,
    mount,
);

function mount(
    root: HTMLElement,
    dependencies: TrajetsListDependencies,
    signal: AbortSignal,
): void {
    const { repository, run, onOpen } = dependencies;
    const liste = query('#trajets-list', HTMLDivElement, root);
    const emptyMessage = query('#empty-list', HTMLParagraphElement, root);
    const errorBanner = query('#list-error', HTMLParagraphElement, root);
    const errorText = query('#list-error-text', HTMLSpanElement, root);
    const importFileInput = query('#input-import-trajet', HTMLInputElement, root);

    query('#create-trajet-button', HTMLButtonElement, root).addEventListener(
        'click',
        () => {
            run(createTrajet(), 'la création du trajet');
        },
        { signal },
    );
    query('#import-trajet-button', HTMLButtonElement, root).addEventListener(
        'click',
        () => {
            importFileInput.click();
        },
        { signal },
    );
    importFileInput.addEventListener(
        'change',
        () => {
            run(importTrajet(), 'l’import du trajet');
        },
        { signal },
    );
    query('#retry-list-button', HTMLButtonElement, root).addEventListener(
        'click',
        () => {
            run(show(), 'la lecture de la liste');
        },
        { signal },
    );

    // Les lignes annoncent, l'écran décide : un seul jeu d'écouteurs, quel que
    // soit le nombre de trajets affichés.
    root.addEventListener(
        'open-trajet',
        (event) => {
            onOpen(event.detail.summary.id);
        },
        { signal },
    );
    root.addEventListener(
        'rename-trajet',
        (event) => {
            run(renameTrajet(event.detail.summary), 'le renommage du trajet');
        },
        { signal },
    );
    root.addEventListener(
        'export-trajet',
        (event) => {
            run(exportTrajet(event.detail.summary), 'l’export du trajet');
        },
        { signal },
    );
    root.addEventListener(
        'delete-trajet',
        (event) => {
            run(deleteTrajet(event.detail.summary), 'la suppression du trajet');
        },
        { signal },
    );

    run(show(), 'la lecture de la liste');

    async function show(): Promise<void> {
        try {
            const summaries = await repository.listSummaries();
            if (signal.aborted) {
                return;
            }
            liste.replaceChildren(...summaries.map((summary) => createTrajetRow(summary)));
            emptyMessage.hidden = summaries.length > 0;
            errorBanner.hidden = true;
        } catch (error) {
            if (signal.aborted) {
                return;
            }
            // La liste est la porte d'entrée de l'application : si elle ne
            // s'ouvre pas, l'utilisateur n'a plus aucune prise. On lui dit ce
            // qui se passe et on lui laisse de quoi réessayer.
            liste.replaceChildren();
            emptyMessage.hidden = true;
            errorText.textContent = `Impossible de lire la liste des trajets. ${readableMessage(error)}`;
            errorBanner.hidden = false;
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

    async function exportTrajet(summary: TrajetSummary): Promise<void> {
        const trajet = await repository.load(summary.id);
        if (trajet === null) {
            await show();
            return;
        }
        await downloadTrajet(trajet);
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
