/**
 * Une file d'attente : les travaux passés s'exécutent l'un après l'autre, dans
 * leur ordre d'arrivée, jamais en parallèle.
 *
 * L'éditeur en a besoin pour les enregistrements. Deux gestes rapprochés — un
 * marqueur glissé sur la carte pendant qu'une suppression s'écrit — lançaient
 * deux écritures concurrentes, et le dépôt ne peut pas garantir l'ordre de deux
 * transactions entrelacées : la seconde décide ce qu'elle supprime d'après un
 * état que la première a déjà changé.
 */

export type Enqueue = (task: () => Promise<void>) => Promise<void>;

export function createQueue(): Enqueue {
    let last: Promise<void> = Promise.resolve();

    return (task) => {
        const result = last.then(task);
        // La file ne reste jamais en échec : un travail qui échoue est signalé à
        // son propre appelant, mais ne condamne pas les gestes suivants.
        last = result.catch(() => undefined);
        return result;
    };
}
