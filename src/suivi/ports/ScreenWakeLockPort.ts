import type { Observable } from 'rxjs';

/**
 * Port : garder l'écran allumé pendant le suivi.
 *
 * Contrat : l'écran reste allumé **tant que l'abonnement dure**, et le verrou
 * est rendu au désabonnement — il n'y a rien à relâcher, donc rien à oublier de
 * relâcher. Le flux n'émet jamais : il ne raconte rien, il tient quelque chose.
 *
 * Best effort — un échec (API absente, ancien iOS) est toléré silencieusement,
 * l'application fonctionne alors sans verrou d'écran.
 */
export interface ScreenWakeLock {
    readonly held$: Observable<never>;
}
