import { Coordonnee } from '../../trajets/domain/Coordonnee';
import type { PositionSource } from '../ports/PositionSource';

/** Le sous-ensemble de navigator.geolocation dont l'adapter a besoin. */
export interface FournisseurDeGeolocalisation {
  watchPosition(
    succes: PositionCallback,
    erreur?: PositionErrorCallback | null,
    options?: PositionOptions,
  ): number;
  clearWatch(id: number): void;
}

/** Planifie une action répétée ; rend la fonction d'annulation. */
export interface Cadenceur {
  toutesLes(millisecondes: number, action: () => void): () => void;
}

const CODE_PERMISSION_REFUSEE = 1;
/** Au plus une position traitée par intervalle (ce que l'utilisateur a demandé). */
const INTERVALLE_ENTRE_POSITIONS_MS = 10_000;
/** Un fix plus imprécis que ça (démarrage à froid, gare couverte) est ignoré. */
const PRECISION_MAXIMALE_METRES = 500;
/** Au-delà de ce silence, on prévient que la position affichée date. */
const SILENCE_AVANT_ALERTE_MS = 30_000;
const CADENCE_DU_CHIEN_DE_GARDE_MS = 15_000;

const OPTIONS_DE_POSITION: PositionOptions = { enableHighAccuracy: true, maximumAge: 0 };

/**
 * Source de position branchée sur le GPS du navigateur.
 *
 * watchPosition (throttlé) plutôt que getCurrentPosition en boucle : pas de
 * chevauchement de requêtes et la puce GPS reste chaude. Au retour au premier
 * plan (page dégelée par iOS/Android), une position immédiate est demandée.
 */
export class GeolocationPositionSource implements PositionSource {
  private readonly geolocalisation: FournisseurDeGeolocalisation | null;
  private readonly maintenant: () => number;
  private readonly cadenceur: Cadenceur;

  private surPosition: ((position: Coordonnee) => void) | null = null;
  private surErreur: ((message: string) => void) | null = null;
  private idDeSurveillance: number | null = null;
  private annulerLeChienDeGarde: (() => void) | null = null;
  private dernierTraitementMs: number | null = null;
  private dernierFixMs: number | null = null;

  private readonly surRetourAuPremierPlan = (): void => this.demanderUnePositionImmediate();

  constructor(dependances?: {
    geolocalisation?: FournisseurDeGeolocalisation;
    maintenant?: () => number;
    cadenceur?: Cadenceur;
  }) {
    this.geolocalisation = dependances?.geolocalisation ?? navigator.geolocation ?? null;
    this.maintenant = dependances?.maintenant ?? (() => Date.now());
    this.cadenceur = dependances?.cadenceur ?? cadenceurParDefaut;
  }

  demarrer(
    surPosition: (position: Coordonnee) => void,
    surErreur: (message: string) => void,
  ): void {
    this.surPosition = surPosition;
    this.surErreur = surErreur;
    if (this.geolocalisation === null) {
      surErreur('La géolocalisation n’est pas disponible sur cet appareil.');
      return;
    }
    this.demarrerLaSurveillance();
    this.annulerLeChienDeGarde = this.cadenceur.toutesLes(CADENCE_DU_CHIEN_DE_GARDE_MS, () =>
      this.verifierLeSilence(),
    );
    document.addEventListener('visibilitychange', this.surRetourAuPremierPlan);
    window.addEventListener('pageshow', this.surRetourAuPremierPlan);
    window.addEventListener('focus', this.surRetourAuPremierPlan);
  }

  private demarrerLaSurveillance(): void {
    this.idDeSurveillance = this.geolocalisation!.watchPosition(
      (fix) => this.traiterLeFix(fix),
      (erreur) => this.traiterLErreur(erreur),
      OPTIONS_DE_POSITION,
    );
  }

  arreter(): void {
    if (this.geolocalisation !== null && this.idDeSurveillance !== null) {
      this.geolocalisation.clearWatch(this.idDeSurveillance);
    }
    this.idDeSurveillance = null;
    this.annulerLeChienDeGarde?.();
    this.annulerLeChienDeGarde = null;
    document.removeEventListener('visibilitychange', this.surRetourAuPremierPlan);
    window.removeEventListener('pageshow', this.surRetourAuPremierPlan);
    window.removeEventListener('focus', this.surRetourAuPremierPlan);
    this.surPosition = null;
    this.surErreur = null;
  }

  private traiterLeFix(fix: GeolocationPosition): void {
    if (fix.coords.accuracy > PRECISION_MAXIMALE_METRES) {
      return;
    }
    this.dernierFixMs = this.maintenant();
    if (
      this.dernierTraitementMs !== null &&
      this.maintenant() - this.dernierTraitementMs < INTERVALLE_ENTRE_POSITIONS_MS
    ) {
      return;
    }
    this.dernierTraitementMs = this.maintenant();
    this.surPosition?.(Coordonnee.creer(fix.coords.latitude, fix.coords.longitude));
  }

  private traiterLErreur(erreur: GeolocationPositionError): void {
    if (erreur.code === CODE_PERMISSION_REFUSEE) {
      this.surErreur?.(
        'Accès à la position refusé — autorisez la localisation pour ce site puis revenez.',
      );
      return;
    }
    // Erreur passagère (indisponibilité, timeout) : le GPS réel en émet au
    // passage des tunnels. On ne s'alarme que si la dernière position date.
    this.verifierLeSilence();
  }

  private verifierLeSilence(): void {
    if (this.dernierFixMs === null || this.maintenant() - this.dernierFixMs > SILENCE_AVANT_ALERTE_MS) {
      this.signalerLeSilence();
    }
  }

  private signalerLeSilence(): void {
    if (this.dernierFixMs === null) {
      this.surErreur?.('En attente du signal GPS…');
      return;
    }
    const minutes = Math.max(1, Math.round((this.maintenant() - this.dernierFixMs) / 60_000));
    this.surErreur?.(`Signal GPS perdu — dernière position il y a ${minutes} min.`);
  }

  /**
   * La page vient d'être dégelée : la surveillance en cours peut être morte
   * (iOS gèle tout). On la redémarre — l'abonnement force un fix rapide —
   * et on lève le throttle pour traiter ce fix immédiatement.
   */
  private demanderUnePositionImmediate(): void {
    if (this.geolocalisation === null || this.surPosition === null) {
      return;
    }
    if (this.idDeSurveillance !== null) {
      this.geolocalisation.clearWatch(this.idDeSurveillance);
    }
    this.dernierTraitementMs = null;
    this.demarrerLaSurveillance();
  }
}

const cadenceurParDefaut: Cadenceur = {
  toutesLes(millisecondes, action) {
    const id = setInterval(action, millisecondes);
    return () => clearInterval(id);
  },
};
