import { trajetIdFrom } from '../domain/ids';
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
export interface KeyValueStorage {
    read(key: string): string | null;
    write(key: string, value: string): void;
    clear(key: string): void;
}

export interface LastOpenedSession {
    remember(id: TrajetId): void;
    forget(): void;
    /** L'identifiant mémorisé, ou `null` s'il n'y en a pas ou s'il est inexploitable. */
    restore(): TrajetId | null;
}

const KEY = 'dernierTrajetId';

/** Délégation directe : la tolérance aux pannes est la règle du cas d'usage, en dessous. */
const browserStorage: KeyValueStorage = {
    read: (key) => localStorage.getItem(key),
    write: (key, value) => {
        localStorage.setItem(key, value);
    },
    clear: (key) => {
        localStorage.removeItem(key);
    },
};

export function createLastOpenedSession(
    storage: KeyValueStorage = browserStorage,
): LastOpenedSession {
    /**
     * Se souvenir d'un trajet est un confort, jamais une obligation : un stockage
     * indisponible (navigation privée d'anciens Safari, quota, stockage refusé)
     * ne doit pas empêcher l'application de démarrer. L'échec est donc toléré —
     * silencieusement, puisqu'il n'y a rien à demander à l'utilisateur.
     */
    function tolerate(acces: () => void): void {
        try {
            acces();
        } catch {
            // Confort perdu, rien de plus.
        }
    }

    function readTolerantly(): string | null {
        try {
            return storage.read(KEY);
        } catch {
            return null;
        }
    }

    return {
        remember(id) {
            tolerate(() => {
                storage.write(KEY, id);
            });
        },

        forget() {
            tolerate(() => {
                storage.clear(KEY);
            });
        },

        restore() {
            const memorise = readTolerantly();
            // Vérifié, jamais présumé : le stockage est modifiable par
            // l'utilisateur et survit aux versions de l'application.
            return memorise === null ? null : trajetIdFrom(memorise);
        },
    };
}
