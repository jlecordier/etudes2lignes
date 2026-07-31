/**
 * La frontière d'erreur de l'application.
 *
 * Un geste de l'utilisateur déclenche presque toujours un travail asynchrone
 * (lire ou écrire dans IndexedDB, décoder une image, attendre un choix sur la
 * carte). Lancé en `void travail()`, un rejet est perdu : l'écran ne dit rien
 * et ce qu'il montre diverge de ce qui est réellement enregistré. Tout travail
 * parti d'un gestionnaire d'événement passe donc par `lancer`.
 *
 * Le lanceur est fabriqué avec sa façon de prévenir l'utilisateur, et injecté
 * comme les autres dépendances : les écrans ne connaissent pas `alert`, et les
 * tests recueillent les messages au lieu de les afficher.
 */

/** Prévenir l'utilisateur d'un échec, en français. */
export type Signaler = (message: string) => void;

/**
 * Lance un travail déclenché par l'utilisateur. `quoi` nomme l'action au
 * complément du nom — « l'enregistrement du trajet » — pour se lire dans
 * « Échec de … ».
 */
export type Lancer = (travail: Promise<void>, quoi: string) => void;

export function creerLanceur(signaler: Signaler): Lancer {
    return (travail, quoi) => {
        travail.catch((erreur: unknown) => {
            // Le détail technique reste dans la console : il sert au diagnostic,
            // pas à l'utilisateur, qui reçoit une phrase en français.
            console.error(`Échec de ${quoi} :`, erreur);
            signaler(messageDEchec(quoi, erreur));
        });
    };
}

/** Le lanceur de production : une boîte de dialogue du navigateur. */
export const lanceurParDefaut: Lancer = creerLanceur((message) => {
    alert(message);
});

function messageDEchec(quoi: string, erreur: unknown): string {
    if (estUnDepassementDeQuota(erreur)) {
        return (
            `Échec de ${quoi} : l’espace de stockage de l’appareil est plein. ` +
            `Supprimez un trajet ou des pages, puis réessayez.`
        );
    }
    const detail = detailLisible(erreur);
    return detail === null ? `Échec de ${quoi}.` : `Échec de ${quoi} : ${detail}`;
}

/**
 * Le mode de panne que le projet anticipe depuis toujours : plusieurs pages de
 * schéma pèsent lourd, et le quota d'un navigateur mobile déborde.
 */
function estUnDepassementDeQuota(erreur: unknown): boolean {
    return erreur instanceof DOMException && erreur.name === 'QuotaExceededError';
}

/**
 * Les messages du domaine et du dépôt sont écrits en français pour être lus
 * (« Trajet illisible : … ») : on les reprend. Une erreur sans message n'apporte
 * rien de plus que l'action qui a échoué.
 */
function detailLisible(erreur: unknown): string | null {
    if (!(erreur instanceof Error) || erreur.message === '') {
        return null;
    }
    return erreur.message.endsWith('.') ? erreur.message : `${erreur.message}.`;
}
