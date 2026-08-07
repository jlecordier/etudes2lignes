import { Observable, fromEvent, map } from 'rxjs';

/**
 * Les événements DOM, en flux.
 *
 * `addEventListener` est **enveloppé** plutôt que `fromEvent` appelé
 * directement : c'est lui qui connaît `HTMLElementEventMap`, donc lui seul peut
 * _prouver_ que `click-page` porte un `PageAimIntent`. Écrire
 * `fromEvent<CustomEvent<PageAimIntent>>(…)` le ferait **affirmer** — un
 * générique que seul le retour contraint est un `as` déguisé, et l'ADR 0002 les
 * bannit pour cette raison exacte.
 *
 * Le flux est froid : l'écouteur est posé à l'abonnement et retiré au
 * désabonnement.
 */
export function eventsOf<Type extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: Type,
    options?: AddEventListenerOptions,
): Observable<HTMLElementEventMap[Type]> {
    return new Observable<HTMLElementEventMap[Type]>((subscriber) => {
        const listener = (event: HTMLElementEventMap[Type]): void => {
            subscriber.next(event);
        };
        target.addEventListener(type, listener, options);
        return () => {
            target.removeEventListener(type, listener, options);
        };
    });
}

/**
 * Idem pour la fenêtre, qui a sa propre carte d'événements. Ceux-là sont posés
 * **hors** de l'écran : sans le `takeUntil` de son signal, ils lui survivraient
 * et s'ajouteraient une fois de plus à chaque visite.
 */
export function windowEventsOf<Type extends keyof WindowEventMap>(
    type: Type,
    options?: AddEventListenerOptions,
): Observable<WindowEventMap[Type]> {
    return new Observable<WindowEventMap[Type]>((subscriber) => {
        const listener = (event: WindowEventMap[Type]): void => {
            subscriber.next(event);
        };
        window.addEventListener(type, listener, options);
        return () => {
            window.removeEventListener(type, listener, options);
        };
    });
}

/**
 * Le détachement d'un écran, en flux : ce qu'on met dans un `takeUntil` pour
 * que tout ce que l'écran a ouvert se referme avec lui.
 *
 * C'est la version flux de ce que le signal fait déjà pour les écouteurs — il
 * n'y a donc toujours **pas de méthode de sortie à penser à appeler**.
 */
export function untilAborted(signal: AbortSignal): Observable<void> {
    return fromEvent(signal, 'abort').pipe(map(() => undefined));
}
