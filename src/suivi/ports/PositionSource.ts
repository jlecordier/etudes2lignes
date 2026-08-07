import type { Observable } from 'rxjs';
import type { Coordonnee } from '../../trajets/domain/Coordonnee';
import type { SourceStatus } from '../domain/sourceStatus';

/**
 * Ce qu'une source raconte au fil de l'eau : les positions qu'elle retient et
 * les états qu'elle **mesure** (mètres, millisecondes), jamais une phrase —
 * c'est `sourceStatusText` qui rédige le texte de l'interface.
 *
 * Les deux voyagent dans **un seul** flux, parce que leur ordre est une règle :
 * la ligne d'état est écrite tantôt par la source, tantôt par la projection, et
 * c'est le dernier événement qui gagne. Deux flux séparés laisseraient cet ordre
 * à la merci de l'ordre des abonnements.
 */
export type SourceEvent =
    | { readonly kind: 'position'; readonly position: Coordonnee }
    | { readonly kind: 'status'; readonly status: SourceStatus };

export function positionEvent(position: Coordonnee): SourceEvent {
    return { kind: 'position', position };
}

export function statusEvent(status: SourceStatus): SourceEvent {
    return { kind: 'status', status };
}

/**
 * Port : fournir des positions au fil de l'eau (GPS réel, simulation…).
 *
 * Contrat :
 * - **s'abonner démarre, se désabonner arrête.** La souscription _est_ la
 *   session : il n'y a ni méthode d'arrêt à ne pas oublier, ni session à
 *   refermer avant d'en ouvrir une autre.
 * - le flux est **froid** : rien ne tourne tant que personne n'écoute, et deux
 *   abonnés ouvrent deux sessions qui s'ignorent. Se désabonner rend tout —
 *   surveillance, minuteries, écouteurs.
 * - il **commence toujours par un état**, avant la moindre position :
 *   `{ kind: 'attente' }`, ou `{ kind: 'indisponible' }` là où l'appareil
 *   n'offre pas de géolocalisation.
 *
 * La suite de contrat `positionSourceContract.ts` éprouve ces règles contre
 * chaque adapter.
 */
export interface PositionSource {
    readonly events$: Observable<SourceEvent>;
}
