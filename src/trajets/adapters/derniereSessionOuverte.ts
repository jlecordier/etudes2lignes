import { trajetIdDepuis } from '../domain/ids';
import type { TrajetId } from '../domain/ids';

/**
 * Se souvenir du trajet ouvert, pour le rouvrir directement au lancement — iOS
 * tue volontiers une PWA en pleine consultation, et personne n'a envie de
 * retraverser la liste en gare.
 *
 * C'est une vraie frontière de persistance : elle seule connaît la clé de
 * stockage, elle seule vérifie ce qu'elle relit. Cette responsabilité vivait
 * dans le composition root, qui reforgeait un identifiant à partir d'un texte
 * jamais vérifié.
 */

/** Le stockage clé-valeur du navigateur, injectable pour les tests. */
export interface StockageDeSession {
    lire(cle: string): string | null;
    ecrire(cle: string, valeur: string): void;
    effacer(cle: string): void;
}

export interface DerniereSessionOuverte {
    memoriser(id: TrajetId): void;
    oublier(): void;
    /** L'identifiant mémorisé, ou `null` s'il n'y en a pas ou s'il est inexploitable. */
    restaurer(): TrajetId | null;
}

const CLE = 'dernierTrajetId';

/** Délégation directe : la tolérance aux pannes est la règle du cas d'usage, en dessous. */
const stockageDuNavigateur: StockageDeSession = {
    lire: (cle) => localStorage.getItem(cle),
    ecrire: (cle, valeur) => {
        localStorage.setItem(cle, valeur);
    },
    effacer: (cle) => {
        localStorage.removeItem(cle);
    },
};

export function creerDerniereSessionOuverte(
    stockage: StockageDeSession = stockageDuNavigateur,
): DerniereSessionOuverte {
    /**
     * Se souvenir d'un trajet est un confort, jamais une obligation : un stockage
     * indisponible (navigation privée d'anciens Safari, quota, stockage refusé)
     * ne doit pas empêcher l'application de démarrer. L'échec est donc toléré —
     * silencieusement, puisqu'il n'y a rien à demander à l'utilisateur.
     */
    function tolerer(acces: () => void): void {
        try {
            acces();
        } catch {
            // Confort perdu, rien de plus.
        }
    }

    function lireEnTolerant(): string | null {
        try {
            return stockage.lire(CLE);
        } catch {
            return null;
        }
    }

    return {
        memoriser(id) {
            tolerer(() => {
                stockage.ecrire(CLE, id);
            });
        },

        oublier() {
            tolerer(() => {
                stockage.effacer(CLE);
            });
        },

        restaurer() {
            const memorise = lireEnTolerant();
            // Vérifié, jamais présumé : le stockage est modifiable par
            // l'utilisateur et survit aux versions de l'application.
            return memorise === null ? null : trajetIdDepuis(memorise);
        },
    };
}
