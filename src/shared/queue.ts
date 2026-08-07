import { EMPTY, Subject, catchError, concatMap, defer, tap, type Observable } from 'rxjs';

/**
 * Une file d'attente : les travaux passés s'exécutent l'un après l'autre, dans
 * leur ordre d'arrivée, jamais en parallèle.
 *
 * L'éditeur en a besoin pour les enregistrements. Deux gestes rapprochés — un
 * marqueur glissé sur la carte pendant qu'une suppression s'écrit — lançaient
 * deux écritures concurrentes, et le dépôt ne peut pas garantir l'ordre de deux
 * transactions entrelacées : la seconde décide ce qu'elle supprime d'après un
 * état que la première a déjà changé.
 *
 * `concatMap` **est** cette règle, sous son nom. Elle se déduisait auparavant de
 * la façon dont une promesse en chaînait une autre.
 *
 * La promesse reste en surface, elle : un travail mis en file a une issue et une
 * seule, et c'est exactement ce qu'une promesse dit. Le flux n'entre que là où
 * il y a un ordre à tenir entre plusieurs.
 */

export type Enqueue = (task: () => Promise<void>) => Promise<void>;

export function createQueue(): Enqueue {
    const soumis = new Subject<Observable<void>>();

    soumis
        .pipe(
            // La file ne reste jamais en échec : un travail qui échoue est
            // signalé à son propre appelant, mais ne condamne pas les gestes
            // suivants.
            concatMap((travail$) => travail$.pipe(catchError(() => EMPTY))),
        )
        .subscribe();

    return (task) =>
        new Promise<void>((resolve, reject) => {
            // `defer` diffère le lancement du travail jusqu'à ce que la file
            // l'ouvre : sans lui, `task()` partirait à la mise en file, et la
            // file ne compterait plus que les issues de travaux déjà tous partis.
            soumis.next(
                defer(task).pipe(
                    tap({
                        error: reject,
                        complete: () => {
                            resolve();
                        },
                    }),
                ),
            );
        });
}
