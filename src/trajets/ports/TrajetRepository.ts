import type { Trajet } from '../domain/Trajet';
import type { TrajetId } from '../domain/ids';

/** Résumé d'un trajet pour l'écran de liste (sans les images, trop lourdes). */
export interface ResumeDeTrajet {
    readonly id: TrajetId;
    readonly nom: string;
    readonly creeLe: Date;
    readonly nombreDImages: number;
    readonly nombreDePoints: number;
}

/**
 * Port de persistance des trajets.
 *
 * Contrat :
 * - `sauvegarder` écrit tout l'agrégat de façon atomique (tout ou rien) : ce qui
 *   n'est plus dans l'agrégat (image retirée, point déplacé) disparaît, et cette
 *   décision se prend **dans** la même transaction que l'écriture, jamais sur une
 *   lecture faite avant elle ;
 * - `charger` rend `null` si le trajet n'existe pas ;
 * - `supprimer` efface le trajet, ses images et ses points ;
 * - `listerResumes` rend les trajets du plus ancien au plus récent ; le nombre
 *   d'images d'un trajet est la longueur de sa liste d'images, pas un comptage
 *   des enregistrements stockés.
 *
 * **Politique face à un enregistrement rompu : refus, pas de meilleur effort.**
 * Un trajet dont un champ est illisible, ou dont une image de sa liste est
 * absente du stockage, fait **rejeter** la lecture avec un message destiné à
 * l'utilisateur : ni trajet amputé, ni `null`. Motifs : l'agrégat refuse déjà un
 * point visant une image absente (`Trajet.rehydrater`), donc l'ignorer ici
 * donnerait deux réponses opposées au même incident ; et un trajet amputé serait
 * ré-enregistré amputé à la sauvegarde suivante, transformant une anomalie
 * réparable en perte définitive et silencieuse.
 * En revanche, un enregistrement d'image que le trajet ne liste pas **ne fait
 * pas partie de l'agrégat** : il est ignoré à la lecture, et nettoyé à la
 * sauvegarde suivante.
 *
 * **Les quatre méthodes peuvent rejeter** — stockage refusé ou saturé, base
 * bloquée par un autre onglet, version de base plus récente, enregistrement
 * rompu. Aucune ne rend un résultat dégradé en silence : tout appelant doit
 * attraper le rejet et afficher `erreur.message`, sans quoi l'utilisateur reste
 * devant un écran vide. Le message peut venir de l'agrégat (invariant violé) ou
 * de l'adapter (« Trajet illisible : … »).
 */
export interface TrajetRepository {
    listerResumes(): Promise<ResumeDeTrajet[]>;
    charger(id: TrajetId): Promise<Trajet | null>;
    sauvegarder(trajet: Trajet): Promise<void>;
    supprimer(id: TrajetId): Promise<void>;
}
