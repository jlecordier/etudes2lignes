import { NomDeTrajet } from '../domain/NomDeTrajet';
import { Trajet } from '../domain/Trajet';
import type { TrajetId } from '../domain/ids';
import type { ResumeDeTrajet, TrajetRepository } from '../ports/TrajetRepository';
import { exporterTrajetEnJson, importerTrajetDepuisJson } from '../serialisation/trajetJson';

export interface DependancesListeTrajets {
    repository: TrajetRepository;
    surOuverture: (id: TrajetId) => void;
}

/** Écran d'accueil : la liste des trajets (créer, renommer, supprimer, ouvrir). */
export function creerListeTrajetsScreen(dependances: DependancesListeTrajets): {
    afficher: () => Promise<void>;
} {
    const { repository, surOuverture } = dependances;
    const liste = document.querySelector<HTMLUListElement>('#liste-trajets')!;
    const messageVide = document.querySelector<HTMLParagraphElement>('#liste-vide')!;
    const boutonCreer = document.querySelector<HTMLButtonElement>('#bouton-creer-trajet')!;
    const boutonImporter = document.querySelector<HTMLButtonElement>('#bouton-importer-trajet')!;
    const champFichierImport = document.querySelector<HTMLInputElement>('#input-import-trajet')!;

    boutonCreer.addEventListener('click', () => void creerUnTrajet());
    boutonImporter.addEventListener('click', () => champFichierImport.click());
    champFichierImport.addEventListener('change', () => void importerUnTrajet());

    async function afficher(): Promise<void> {
        const resumes = await repository.listerResumes();
        liste.replaceChildren(...resumes.map(ligneDeTrajet));
        messageVide.hidden = resumes.length > 0;
    }

    async function creerUnTrajet(): Promise<void> {
        const nom = demanderUnNom('Nom du trajet ?');
        if (nom === null) {
            return;
        }
        await repository.sauvegarder(Trajet.creer(nom));
        await afficher();
    }

    async function renommerUnTrajet(resume: ResumeDeTrajet): Promise<void> {
        const nom = demanderUnNom('Nouveau nom du trajet ?', resume.nom);
        if (nom === null) {
            return;
        }
        const trajet = await repository.charger(resume.id);
        if (trajet === null) {
            return;
        }
        trajet.renommer(nom);
        await repository.sauvegarder(trajet);
        await afficher();
    }

    async function importerUnTrajet(): Promise<void> {
        const fichier = champFichierImport.files?.[0];
        champFichierImport.value = '';
        if (fichier === undefined) {
            return;
        }
        try {
            const trajet = await importerTrajetDepuisJson(await fichier.text());
            await repository.sauvegarder(trajet);
        } catch (erreur) {
            alert(erreur instanceof Error ? erreur.message : String(erreur));
            return;
        }
        await afficher();
    }

    async function exporterUnTrajet(resume: ResumeDeTrajet): Promise<void> {
        const trajet = await repository.charger(resume.id);
        if (trajet === null) {
            return;
        }
        const json = await exporterTrajetEnJson(trajet);
        telecharger(json, `${nomDeFichierSur(resume.nom)}.json`);
    }

    async function supprimerUnTrajet(resume: ResumeDeTrajet): Promise<void> {
        const confirme = confirm(
            `Supprimer le trajet « ${resume.nom} » ? Ses images et ses points seront perdus.`,
        );
        if (!confirme) {
            return;
        }
        await repository.supprimer(resume.id);
        await afficher();
    }

    function ligneDeTrajet(resume: ResumeDeTrajet): HTMLLIElement {
        const ligne = document.createElement('li');
        ligne.className = 'ligne-trajet';

        const ouvrir = document.createElement('button');
        ouvrir.type = 'button';
        ouvrir.className = 'nom-trajet';
        ouvrir.textContent = resume.nom;
        ouvrir.addEventListener('click', () => surOuverture(resume.id));

        const details = document.createElement('span');
        details.className = 'details-trajet';
        details.textContent = `${resume.nombreDImages} image(s) · ${resume.nombreDePoints} point(s)`;

        const renommer = document.createElement('button');
        renommer.type = 'button';
        renommer.className = 'secondaire';
        renommer.textContent = '✏️ Renommer';
        renommer.addEventListener('click', () => void renommerUnTrajet(resume));

        const exporter = document.createElement('button');
        exporter.type = 'button';
        exporter.className = 'secondaire';
        exporter.textContent = '⬇️ Exporter';
        exporter.setAttribute('aria-label', `Exporter ${resume.nom}`);
        exporter.addEventListener('click', () => void exporterUnTrajet(resume));

        const supprimer = document.createElement('button');
        supprimer.type = 'button';
        supprimer.className = 'secondaire danger';
        supprimer.textContent = '🗑️ Supprimer';
        supprimer.addEventListener('click', () => void supprimerUnTrajet(resume));

        ligne.append(ouvrir, details, renommer, exporter, supprimer);
        return ligne;
    }

    return { afficher };
}

/** Déclenche le téléchargement d'un fichier texte par le navigateur. */
function telecharger(contenu: string, nomDeFichier: string): void {
    const url = URL.createObjectURL(new Blob([contenu], { type: 'application/json' }));
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = nomDeFichier;
    lien.click();
    URL.revokeObjectURL(url);
}

/** Un nom de trajet peut contenir des caractères interdits dans un nom de fichier. */
function nomDeFichierSur(nom: string): string {
    return nom.replace(/[/\\:*?"<>|]/g, '-');
}

function demanderUnNom(question: string, valeurInitiale = ''): NomDeTrajet | null {
    const saisie = prompt(question, valeurInitiale);
    if (saisie === null) {
        return null;
    }
    try {
        return NomDeTrajet.creer(saisie);
    } catch (erreur) {
        alert(erreur instanceof Error ? erreur.message : String(erreur));
        return null;
    }
}
