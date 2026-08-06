import { fromEvent, map, merge, filter, type Observable } from 'rxjs';
import type { Foreground } from '../ports/Foreground';

/**
 * Le seul endroit du projet qui sache reconnaître un retour au premier plan.
 *
 * Trois événements, parce qu'aucun ne suffit seul : `visibilitychange` manque le
 * retour d'un onglet déjà visible, `pageshow` est le seul émis quand iOS ressort
 * la page de son cache de navigation, et `focus` rattrape le retour après une
 * alerte système. Le même réveil en déclenche donc souvent plusieurs.
 *
 * Le filtre sur la visibilité tient ici, et non chez les abonnés : c'est la même
 * question que celle des trois événements — « ce réveil est-il vrai ? » —, et
 * elle appartient donc à celui qui les connaît. Les deux abonnés la posaient
 * chacun de leur côté.
 *
 * Le flux est **froid** : rien n'écoute tant que personne n'est abonné, et les
 * écouteurs partent au désabonnement. Rien à retirer à la main.
 */
export class BrowserForeground implements Foreground {
    readonly returnToForeground$: Observable<void> = merge(
        fromEvent(document, 'visibilitychange'),
        fromEvent(window, 'pageshow'),
        fromEvent(window, 'focus'),
    ).pipe(
        filter(() => document.visibilityState === 'visible'),
        map(() => undefined),
    );
}
