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
 * - `sauvegarder` écrit tout l'agrégat de façon atomique (tout ou rien) ;
 * - `charger` rend `null` si le trajet n'existe pas ;
 * - `supprimer` efface le trajet, ses images et ses points ;
 * - `listerResumes` rend les trajets du plus ancien au plus récent.
 */
export interface TrajetRepository {
    listerResumes(): Promise<ResumeDeTrajet[]>;
    charger(id: TrajetId): Promise<Trajet | null>;
    sauvegarder(trajet: Trajet): Promise<void>;
    supprimer(id: TrajetId): Promise<void>;
}
