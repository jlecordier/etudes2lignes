/**
 * Port : garder l'écran allumé pendant le suivi.
 *
 * Contrat : best effort — un échec (API absente, ancien iOS) est toléré
 * silencieusement, l'application fonctionne alors sans verrou d'écran.
 */
export interface EcranAllume {
  maintenir(): Promise<void>;
  relacher(): Promise<void>;
}
