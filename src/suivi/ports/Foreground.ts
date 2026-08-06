import type { Observable } from 'rxjs';

/**
 * Port : la couture « la page revient au premier plan ».
 *
 * iOS et Android gèlent une page en arrière-plan : au dégel, une surveillance
 * GPS ou un verrou d'écran peuvent être morts sans le dire. C'est le seul
 * endroit qui sait quels événements du navigateur trahissent ce réveil.
 *
 * Contrat : `returnToForeground$` émet à chaque retour au premier plan, et
 * **seulement page effectivement visible**. Les réveils sont bruyants — un même
 * retour en émet plusieurs, et certains arrivent alors que la page est encore
 * masquée : le port retient ces derniers, ses abonnés n'ont plus à s'en
 * défendre. Restent les rafales, que paie qui paie cher son réveil (`auditTime`
 * côté GPS, `exhaustMap` côté verrou).
 */
export interface Foreground {
    readonly returnToForeground$: Observable<void>;
}
