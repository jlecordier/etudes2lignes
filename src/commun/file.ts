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

export type EnFile = (travail: () => Promise<void>) => Promise<void>;

export function creerFileDAttente(): EnFile {
    let derniere: Promise<void> = Promise.resolve();

    return (travail) => {
        const resultat = derniere.then(travail);
        // La file ne reste jamais en échec : un travail qui échoue est signalé à
        // son propre appelant, mais ne condamne pas les gestes suivants.
        derniere = resultat.catch(() => undefined);
        return resultat;
    };
}
