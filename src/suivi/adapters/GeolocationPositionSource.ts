import { Coordonnee } from '../../trajets/domain/Coordonnee';
import type { EtatDeLaSource } from '../domain/etatDeLaSource';
import { fixUtilisable } from '../domain/precisionDuFix';
import type { PositionSource } from '../ports/PositionSource';
import type { PremierPlan } from '../ports/PremierPlan';
import { NavigateurPremierPlan } from './NavigateurPremierPlan';

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
/** Au-delà de ce silence, on prévient que la position affichée date. */
const SILENCE_AVANT_ALERTE_MS = 30_000;
const CADENCE_DU_CHIEN_DE_GARDE_MS = 15_000;
/** Deux réveils à moins de 5 s d'écart : le second ne redémarre pas le watch. */
const DELAI_MINIMUM_ENTRE_REDEMARRAGES_MS = 5_000;

const OPTIONS_DE_POSITION: PositionOptions = { enableHighAccuracy: true, maximumAge: 0 };

/**
 * Une session de surveillance : les rappels de l'appelant, les poignées à rendre
 * en partant, et les horodatages de **cette** session. Rien n'y survit à
 * `arreter` — sinon le premier fix d'une nouvelle session serait avalé par le
 * throttle de la session morte, et le chien de garde annoncerait un silence
 * hérité.
 */
interface SurveillanceEnCours {
    readonly type: 'enCours';
    readonly surPosition: (position: Coordonnee) => void;
    readonly surEtat: (etat: EtatDeLaSource) => void;
    readonly annulerLeChienDeGarde: () => void;
    readonly seDesabonnerDuPremierPlan: () => void;
    idDeSurveillance: number | null;
    dernierTraitementMs: number | null;
    dernierFixMs: number | null;
    /** Dernier signe de vie du GPS, fixes trop imprécis compris. */
    dernierSignalMs: number | null;
    derniereImprecisionMetres: number | null;
    dernierRedemarrageMs: number | null;
}

type Surveillance = { readonly type: 'arretee' } | SurveillanceEnCours;

/** Tout ce que la source emprunte à sa plateforme, remplaçable un par un. */
export interface DependancesDeLaSourceGps {
    /** `null` dit « pas de géolocalisation sur cet appareil », que la source annonce. */
    geolocalisation?: FournisseurDeGeolocalisation | null;
    maintenant?: () => number;
    cadenceur?: Cadenceur;
    premierPlan?: PremierPlan;
}

/**
 * `navigator.geolocation` est typé comme toujours présent, mais absent en
 * contexte non sécurisé ou sur de vieux navigateurs. On l'annote optionnel pour
 * l'exprimer honnêtement (`Navigator` s'y assigne sans cast).
 */
function geolocalisationDuNavigateur(): FournisseurDeGeolocalisation | null {
    const navigateur: { geolocation?: Geolocation } = navigator;
    return navigateur.geolocation ?? null;
}

function maintenantSelonLeSysteme(): number {
    return Date.now();
}

/**
 * Source de position branchée sur le GPS du navigateur.
 *
 * watchPosition (throttlé) plutôt que getCurrentPosition en boucle : pas de
 * chevauchement de requêtes et la puce GPS reste chaude. Au retour au premier
 * plan (page dégelée par iOS/Android), une position immédiate est demandée.
 *
 * L'adapter **mesure** (mètres, millisecondes) et laisse `presentation.ts`
 * rédiger : il n'écrit aucune phrase destinée à l'utilisateur.
 */
export class GeolocationPositionSource implements PositionSource {
    private readonly geolocalisation: FournisseurDeGeolocalisation | null;
    private readonly maintenant: () => number;
    private readonly cadenceur: Cadenceur;
    private readonly premierPlan: PremierPlan;

    private surveillance: Surveillance = { type: 'arretee' };

    constructor({
        geolocalisation = geolocalisationDuNavigateur(),
        maintenant = maintenantSelonLeSysteme,
        cadenceur = cadenceurParDefaut,
        premierPlan = new NavigateurPremierPlan(),
    }: DependancesDeLaSourceGps = {}) {
        this.geolocalisation = geolocalisation;
        this.maintenant = maintenant;
        this.cadenceur = cadenceur;
        this.premierPlan = premierPlan;
    }

    demarrer(
        surPosition: (position: Coordonnee) => void,
        surEtat: (etat: EtatDeLaSource) => void,
    ): void {
        // Idempotent : une session déjà en cours est refermée d'un bloc, sinon sa
        // minuterie et sa surveillance tourneraient à vide pour toujours.
        this.arreter();
        if (this.geolocalisation === null) {
            surEtat({ etat: 'indisponible' });
            return;
        }
        surEtat({ etat: 'attente' });
        const annulerLeChienDeGarde = this.cadenceur.toutesLes(CADENCE_DU_CHIEN_DE_GARDE_MS, () => {
            this.verifierLeSilence();
        });
        const seDesabonnerDuPremierPlan = this.premierPlan.surRetourAuPremierPlan(() => {
            this.demanderUnePositionImmediate();
        });
        const surveillance: SurveillanceEnCours = {
            type: 'enCours',
            surPosition,
            surEtat,
            annulerLeChienDeGarde,
            seDesabonnerDuPremierPlan,
            idDeSurveillance: null,
            dernierTraitementMs: null,
            dernierFixMs: null,
            dernierSignalMs: null,
            derniereImprecisionMetres: null,
            dernierRedemarrageMs: null,
        };
        this.surveillance = surveillance;
        this.ouvrirLaSurveillance(surveillance);
    }

    arreter(): void {
        const surveillance = this.surveillance;
        if (surveillance.type === 'arretee') {
            return;
        }
        // La session est abandonnée d'abord : un fix déjà en vol la trouvera
        // périmée et n'appellera plus les rappels de l'appelant.
        this.surveillance = { type: 'arretee' };
        this.fermerLaSurveillance(surveillance);
        surveillance.annulerLeChienDeGarde();
        surveillance.seDesabonnerDuPremierPlan();
    }

    private ouvrirLaSurveillance(surveillance: SurveillanceEnCours): void {
        if (this.geolocalisation === null) {
            return;
        }
        surveillance.idDeSurveillance = this.geolocalisation.watchPosition(
            (fix) => {
                this.traiterLeFix(surveillance, fix);
            },
            (erreur) => {
                this.traiterLErreur(surveillance, erreur);
            },
            OPTIONS_DE_POSITION,
        );
    }

    private fermerLaSurveillance(surveillance: SurveillanceEnCours): void {
        if (this.geolocalisation === null || surveillance.idDeSurveillance === null) {
            return;
        }
        this.geolocalisation.clearWatch(surveillance.idDeSurveillance);
        surveillance.idDeSurveillance = null;
    }

    private traiterLeFix(surveillance: SurveillanceEnCours, fix: GeolocationPosition): void {
        if (this.surveillance !== surveillance) {
            return;
        }
        surveillance.dernierSignalMs = this.maintenant();
        if (!fixUtilisable(fix.coords.accuracy)) {
            surveillance.derniereImprecisionMetres = fix.coords.accuracy;
            this.signalerLImprecision(surveillance);
            return;
        }
        surveillance.dernierFixMs = this.maintenant();
        if (
            surveillance.dernierTraitementMs !== null &&
            this.maintenant() - surveillance.dernierTraitementMs < INTERVALLE_ENTRE_POSITIONS_MS
        ) {
            return;
        }
        surveillance.dernierTraitementMs = this.maintenant();
        surveillance.surPosition(Coordonnee.creer(fix.coords.latitude, fix.coords.longitude));
    }

    private traiterLErreur(
        surveillance: SurveillanceEnCours,
        erreur: GeolocationPositionError,
    ): void {
        if (this.surveillance !== surveillance) {
            return;
        }
        if (erreur.code === CODE_PERMISSION_REFUSEE) {
            surveillance.surEtat({ etat: 'permission-refusee' });
            return;
        }
        // Erreur passagère (indisponibilité, timeout) : le GPS réel en émet au
        // passage des tunnels. On ne s'alarme que si la dernière position date.
        this.verifierLeSilence();
    }

    private verifierLeSilence(): void {
        const surveillance = this.surveillance;
        if (surveillance.type === 'arretee') {
            return;
        }
        if (this.estFrais(surveillance.dernierFixMs)) {
            return;
        }
        // Le GPS répond mais trop imprécisément : le dire, plutôt que « perdu ».
        if (this.estFrais(surveillance.dernierSignalMs)) {
            this.signalerLImprecision(surveillance);
            return;
        }
        this.signalerLeSilence(surveillance);
    }

    private estFrais(instantMs: number | null): boolean {
        return instantMs !== null && this.maintenant() - instantMs <= SILENCE_AVANT_ALERTE_MS;
    }

    private signalerLImprecision(surveillance: SurveillanceEnCours): void {
        const imprecisionMetres = surveillance.derniereImprecisionMetres;
        // Annoncer une imprécision inconnue reviendrait à en inventer une : le
        // rédacteur planche à 1 km, l'utilisateur lirait « ± 1 km » sans qu'aucun
        // fix imprécis ne soit jamais arrivé. On dit alors ce qu'on sait : le
        // silence.
        if (imprecisionMetres === null) {
            this.signalerLeSilence(surveillance);
            return;
        }
        surveillance.surEtat({ etat: 'imprecise', imprecisionMetres });
    }

    private signalerLeSilence(surveillance: SurveillanceEnCours): void {
        if (surveillance.dernierFixMs === null) {
            surveillance.surEtat({ etat: 'attente' });
            return;
        }
        surveillance.surEtat({
            etat: 'perdue',
            ancienneteMs: this.maintenant() - surveillance.dernierFixMs,
        });
    }

    /**
     * La page vient d'être dégelée : la surveillance en cours peut être morte
     * (iOS gèle tout). On la redémarre — l'abonnement force un fix rapide —
     * et on lève le throttle pour traiter ce fix immédiatement.
     * Débouncé : des réveils en rafale (focus, alertes) relanceraient sans
     * cesse l'acquisition et dégraderaient la précision des fixes.
     */
    private demanderUnePositionImmediate(): void {
        const surveillance = this.surveillance;
        if (surveillance.type === 'arretee') {
            return;
        }
        if (!this.premierPlan.estAuPremierPlan()) {
            return;
        }
        if (
            surveillance.dernierRedemarrageMs !== null &&
            this.maintenant() - surveillance.dernierRedemarrageMs <
                DELAI_MINIMUM_ENTRE_REDEMARRAGES_MS
        ) {
            return;
        }
        surveillance.dernierRedemarrageMs = this.maintenant();
        this.fermerLaSurveillance(surveillance);
        surveillance.dernierTraitementMs = null;
        this.ouvrirLaSurveillance(surveillance);
    }
}

const cadenceurParDefaut: Cadenceur = {
    toutesLes(millisecondes, action) {
        const id = setInterval(action, millisecondes);
        return () => {
            clearInterval(id);
        };
    },
};
