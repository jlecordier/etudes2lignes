/**
 * La frontière d'erreur de l'application.
 *
 * Un geste de l'utilisateur déclenche presque toujours un travail asynchrone
 * (lire ou écrire dans IndexedDB, décoder une image, attendre un choix sur la
 * carte). Lancé en `void travail()`, un rejet est perdu : l'écran ne dit rien
 * et ce qu'il montre diverge de ce qui est réellement enregistré. Tout travail
 * parti d'un gestionnaire d'événement passe donc par `run`.
 *
 * Le lanceur est fabriqué avec sa façon de prévenir l'utilisateur, et injecté
 * comme les autres dépendances : les écrans ne connaissent pas `alert`, et les
 * tests recueillent les messages au lieu de les afficher.
 */

/** Prévenir l'utilisateur d'un échec, en français. */
export type Notify = (message: string) => void;

/**
 * Lance un travail déclenché par l'utilisateur. `label` nomme l'action au
 * complément du nom — « l'enregistrement du trajet » — pour se lire dans
 * « Échec de … ».
 */
export type Run = (travail: Promise<void>, label: string) => void;

export function createRunner(signaler: Notify): Run {
    return (travail, label) => {
        travail.catch((error: unknown) => {
            // Le détail technique reste dans la console : il sert au diagnostic,
            // pas à l'utilisateur, qui reçoit une phrase en français.
            console.error(`Échec de ${label} :`, error);
            signaler(failureMessage(label, error));
        });
    };
}

/** Le lanceur de production : une boîte de dialogue du navigateur. */
export const defaultRunner: Run = createRunner((message) => {
    alert(message);
});

function failureMessage(label: string, error: unknown): string {
    if (isQuotaExceeded(error)) {
        return (
            `Échec de ${label} : l’espace de stockage de l’appareil est plein. ` +
            `Supprimez un trajet ou des pages, puis réessayez.`
        );
    }
    const detail = readableDetail(error);
    return detail === null ? `Échec de ${label}.` : `Échec de ${label} : ${detail}`;
}

/**
 * Le mode de panne que le projet anticipe depuis toujours : plusieurs pages de
 * schéma pèsent lourd, et le quota d'un navigateur mobile déborde.
 */
function isQuotaExceeded(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'QuotaExceededError';
}

/**
 * Les messages du domaine et du dépôt sont écrits en français pour être lus
 * (« Trajet illisible : … ») : on les reprend. Une erreur sans message n'apporte
 * rien de plus que l'action qui a échoué.
 */
function readableDetail(error: unknown): string | null {
    if (!(error instanceof Error) || error.message === '') {
        return null;
    }
    return error.message.endsWith('.') ? error.message : `${error.message}.`;
}
