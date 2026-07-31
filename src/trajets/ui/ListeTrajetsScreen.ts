import { requete } from '../../commun/dom';
import { creerBouton } from '../../commun/elements';
import type { Lancer } from '../../commun/lancement';
import { NomDeTrajet } from '../domain/NomDeTrajet';
import { Trajet } from '../domain/Trajet';
import type { TrajetId } from '../domain/ids';
import type { ResumeDeTrajet, TrajetRepository } from '../ports/TrajetRepository';
import { exporterTrajetEnJson, importerTrajetDepuisJson } from '../serialisation/trajetJson';

export interface DependancesListeTrajets {
    repository: TrajetRepository;
    lancer: Lancer;
    surOuverture: (id: TrajetId) => void;
}

/** Écran d'accueil : la liste des trajets (créer, renommer, supprimer, ouvrir). */
export function creerListeTrajetsScreen(dependances: DependancesListeTrajets): {
    afficher: () => Promise<void>;
} {
    const { repository, lancer, surOuverture } = dependances;
    const liste = requete('#liste-trajets', HTMLUListElement);
    const messageVide = requete('#liste-vide', HTMLParagraphElement);
    const boutonCreer = requete('#bouton-creer-trajet', HTMLButtonElement);
    const boutonImporter = requete('#bouton-importer-trajet', HTMLButtonElement);
    const champFichierImport = requete('#input-import-trajet', HTMLInputElement);

    boutonCreer.addEventListener('click', () => {
        lancer(creerUnTrajet(), 'la création du trajet');
    });
    boutonImporter.addEventListener('click', () => {
        champFichierImport.click();
    });
    champFichierImport.addEventListener('change', () => {
        lancer(importerUnTrajet(), 'l’import du trajet');
    });

    async function afficher(): Promise<void> {
        try {
            const resumes = await repository.listerResumes();
            liste.replaceChildren(...resumes.map(ligneDeTrajet));
            messageVide.hidden = resumes.length > 0;
        } catch (erreur) {
            // La liste est la porte d'entrée de l'application : si elle ne
            // s'ouvre pas, l'utilisateur n'a plus aucune prise. On lui dit ce
            // qui se passe et on lui laisse de quoi réessayer.
            messageVide.hidden = true;
            liste.replaceChildren(ligneDErreur(erreur));
        }
    }

    async function creerUnTrajet(): Promise<void> {
        const nom = demanderUnNomUtilisable('Nom du trajet ?');
        if (nom === null) {
            return;
        }
        await repository.sauvegarder(Trajet.creer(nom));
        await afficher();
    }

    async function renommerUnTrajet(resume: ResumeDeTrajet): Promise<void> {
        const nom = demanderUnNomUtilisable('Nouveau nom du trajet ?', resume.nom);
        if (nom === null) {
            return;
        }
        const trajet = await repository.charger(resume.id);
        if (trajet === null) {
            await afficher();
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
        const trajet = await lireLeTrajet(fichier);
        if (trajet === null) {
            return;
        }
        // L'échec d'enregistrement remonte à la frontière d'erreur, qui sait
        // nommer le débordement de quota — fréquent sur mobile avec des pages.
        await repository.sauvegarder(trajet);
        await afficher();
    }

    /**
     * Lit un fichier de trajet, ou explique précisément ce qui ne va pas.
     *
     * La lecture et la validation portent des messages distincts, et ceux de la
     * validation viennent du domaine : sans ce découpage, un fichier étranger
     * afficherait le message technique brut du navigateur.
     */
    async function lireLeTrajet(fichier: File): Promise<Trajet | null> {
        let texte: string;
        try {
            texte = await fichier.text();
        } catch {
            alert('Fichier illisible : impossible de lire ce fichier.');
            return null;
        }
        try {
            return importerTrajetDepuisJson(texte);
        } catch (erreur) {
            alert(messageLisible(erreur));
            return null;
        }
    }

    async function exporterUnTrajet(resume: ResumeDeTrajet): Promise<void> {
        const trajet = await repository.charger(resume.id);
        if (trajet === null) {
            await afficher();
            return;
        }
        telecharger(await exporterTrajetEnJson(trajet), `${nomDeFichierSur(resume.nom)}.json`);
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

        // Le nom du trajet est le titre cliquable de la ligne, pas une action
        // secondaire : son nom accessible est le nom du trajet, tout court.
        const ouvrir = document.createElement('button');
        ouvrir.type = 'button';
        ouvrir.className = 'nom-trajet';
        ouvrir.textContent = resume.nom;
        ouvrir.addEventListener('click', () => {
            surOuverture(resume.id);
        });

        const details = document.createElement('span');
        details.className = 'details-trajet';
        details.textContent = `${String(resume.nombreDImages)} image(s) · ${String(resume.nombreDePoints)} point(s)`;

        ligne.append(
            ouvrir,
            details,
            creerBouton({
                texte: '✏️ Renommer',
                intitule: `Renommer ${resume.nom}`,
                action: () => {
                    lancer(renommerUnTrajet(resume), 'le renommage du trajet');
                },
            }),
            creerBouton({
                texte: '⬇️ Exporter',
                intitule: `Exporter ${resume.nom}`,
                action: () => {
                    lancer(exporterUnTrajet(resume), 'l’export du trajet');
                },
            }),
            creerBouton({
                texte: '🗑️ Supprimer',
                intitule: `Supprimer ${resume.nom}`,
                action: () => {
                    lancer(supprimerUnTrajet(resume), 'la suppression du trajet');
                },
                danger: true,
            }),
        );
        return ligne;
    }

    /** La liste n'a pas pu être lue : dire quoi, et laisser réessayer. */
    function ligneDErreur(erreur: unknown): HTMLLIElement {
        const ligne = document.createElement('li');
        ligne.className = 'ligne-trajet';

        const explication = document.createElement('span');
        explication.className = 'description-point';
        explication.textContent = `Impossible de lire la liste des trajets. ${messageLisible(erreur)}`;

        ligne.append(
            explication,
            creerBouton({
                texte: '🔄 Réessayer',
                intitule: 'Réessayer de lire la liste des trajets',
                action: () => {
                    lancer(afficher(), 'la lecture de la liste');
                },
            }),
        );
        return ligne;
    }

    return { afficher };
}

/** Délai avant de libérer l'URL blob d'un téléchargement (une minute). */
const DELAI_REVOCATION_MS = 60_000;

/** Déclenche le téléchargement d'un fichier texte par le navigateur. */
function telecharger(contenu: string, nomDeFichier: string): void {
    const url = URL.createObjectURL(new Blob([contenu], { type: 'application/json' }));
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = nomDeFichier;
    lien.click();
    // Révocation différée : Safari/iOS et Firefox lisent le blob après le tick
    // courant ; le révoquer tout de suite annulerait le téléchargement.
    setTimeout(() => {
        URL.revokeObjectURL(url);
    }, DELAI_REVOCATION_MS);
}

/** Un nom de trajet peut contenir des caractères interdits dans un nom de fichier. */
function nomDeFichierSur(nom: string): string {
    return nom.replace(/[/\\:*?"<>|]/g, '-');
}

/**
 * Demande un nom à l'utilisateur, et rend `null` s'il n'y a **pas de nom
 * utilisable** — qu'il ait annulé ou saisi un nom que le domaine refuse, cas
 * où il a déjà été prévenu. Les deux appelants abandonnent pareillement : les
 * distinguer par un type n'apporterait rien qu'ils sauraient utiliser.
 */
function demanderUnNomUtilisable(question: string, valeurInitiale = ''): NomDeTrajet | null {
    const saisie = prompt(question, valeurInitiale);
    if (saisie === null) {
        return null;
    }
    try {
        return NomDeTrajet.creer(saisie);
    } catch (erreur) {
        alert(messageLisible(erreur));
        return null;
    }
}

/** Les messages du domaine et du dépôt sont écrits pour être lus : on les reprend. */
function messageLisible(erreur: unknown): string {
    return erreur instanceof Error ? erreur.message : String(erreur);
}
