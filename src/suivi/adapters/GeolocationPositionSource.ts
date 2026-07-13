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
/**
 * Un fix approximatif (cellule, Wi-Fi, vitres athermiques d'un train) vaut
 * mieux que « signal perdu » : le suivi tolère des kilomètres (le seuil
 * « hors trajet » démarre à 5 km). Au-delà de 3 km d'incertitude en revanche,
 * caler la page n'a plus de sens.
 */
const PRECISION_MAXIMALE_METRES = 3000;
/** Au-delà de ce silence, on prévient que la position affichée date. */
const SILENCE_AVANT_ALERTE_MS = 30_000;
const CADENCE_DU_CHIEN_DE_GARDE_MS = 15_000;
/** Deux réveils à moins de 5 s d'écart : le second ne redémarre pas le watch. */
const DELAI_MINIMUM_ENTRE_REDEMARRAGES_MS = 5_000;

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
    /** Dernier signe de vie du GPS, fixes trop imprécis compris. */
    private dernierSignalMs: number | null = null;
    private derniereImprecisionMetres: number | null = null;
    private dernierRedemarrageMs: number | null = null;

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
        this.dernierSignalMs = this.maintenant();
        if (fix.coords.accuracy > PRECISION_MAXIMALE_METRES) {
            this.derniereImprecisionMetres = fix.coords.accuracy;
            this.signalerLImprecision();
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
        if (this.estFrais(this.dernierFixMs)) {
            return;
        }
        // Le GPS répond mais trop imprécisément : le dire, plutôt que « perdu ».
        if (this.estFrais(this.dernierSignalMs)) {
            this.signalerLImprecision();
            return;
        }
        this.signalerLeSilence();
    }

    private estFrais(instantMs: number | null): boolean {
        return instantMs !== null && this.maintenant() - instantMs <= SILENCE_AVANT_ALERTE_MS;
    }

    private signalerLImprecision(): void {
        const kilometres = Math.max(1, Math.round((this.derniereImprecisionMetres ?? 0) / 1000));
        this.surErreur?.(
            `Position approximative (± ${kilometres} km) — trop imprécise pour caler la page.`,
        );
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
     * Débouncé : des réveils en rafale (focus, alertes) relanceraient sans
     * cesse l'acquisition et dégraderaient la précision des fixes.
     */
    private demanderUnePositionImmediate(): void {
        if (this.geolocalisation === null || this.surPosition === null) {
            return;
        }
        if (document.visibilityState !== 'visible') {
            return;
        }
        if (
            this.dernierRedemarrageMs !== null &&
            this.maintenant() - this.dernierRedemarrageMs < DELAI_MINIMUM_ENTRE_REDEMARRAGES_MS
        ) {
            return;
        }
        this.dernierRedemarrageMs = this.maintenant();
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
