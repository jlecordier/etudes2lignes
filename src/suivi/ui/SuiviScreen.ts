import type { PointAffiche } from '../../carte/ports/CarteDesPointsPort';
import type { SelecteurDeCoordonnee } from '../../carte/ports/SelecteurDeCoordonneePort';
import { requete } from '../../commun/dom';
import type { Lancer } from '../../commun/lancement';
import { creerPileDePages } from '../../commun/pileDePages';
import type { Coordonnee } from '../../trajets/domain/Coordonnee';
import type { Trajet } from '../../trajets/domain/Trajet';
import type { TrajetId } from '../../trajets/domain/ids';
import type { TrajetRepository } from '../../trajets/ports/TrajetRepository';
import { texteDEtatDeLaSource, texteDEtatDuSuivi } from '../domain/presentation';
import {
    calculerCibleDeScroll,
    calculerDefilement,
    FRACTION_D_ECRAN_DE_LA_POSITION,
    type AncragePrecedent,
    type EtapeDuVoyage,
} from '../domain/projection';
import type { EtatDeLaSource } from '../domain/etatDeLaSource';
import type { EcranAllume } from '../ports/EcranAllumePort';
import type { PositionSource } from '../ports/PositionSource';
import type { SimulateurDePosition } from '../ports/SimulateurDePosition';

export interface DependancesSuivi {
    repository: TrajetRepository;
    sourceReelle: PositionSource;
    simulation: SimulateurDePosition;
    selecteurDeCoordonnee: SelecteurDeCoordonnee;
    ecranAllume: EcranAllume;
    lancer: Lancer;
    surRetour: (id: TrajetId) => void;
}

/** Où la position vient-elle ? Le mode n'est plus deviné d'un attribut du DOM. */
type ModeDeSuivi = 'gps' | 'simulation';

/**
 * Écran de suivi : les pages du trajet empilées, et le document qui défile
 * tout seul pour placer la position courante aux trois quarts de l'écran.
 */
export function creerSuiviScreen(dependances: DependancesSuivi): {
    afficher: (id: TrajetId) => Promise<void>;
} {
    const {
        repository,
        sourceReelle,
        simulation,
        selecteurDeCoordonnee,
        ecranAllume,
        lancer,
        surRetour,
    } = dependances;
    const ecran = requete('#ecran-suivi', HTMLElement);
    const etat = requete('#etat-suivi', HTMLSpanElement);
    const bandeauSimulation = requete('#bandeau-simulation', HTMLElement);
    const boutonReprendre = requete('#bouton-reprendre', HTMLButtonElement);
    const conteneurDesPages = requete('#pile-suivi', HTMLDivElement);
    const pile = creerPileDePages(conteneurDesPages);

    // Le repère visuel doit tomber là où le défilement vise : une seule valeur,
    // celle du domaine, que le CSS lit.
    document.documentElement.style.setProperty(
        '--fraction-position',
        String(FRACTION_D_ECRAN_DE_LA_POSITION),
    );

    let trajet: Trajet | null = null;
    let idAffiche: TrajetId | null = null;
    // Incrémenté à chaque affichage et à chaque sortie : un chargement dont le
    // jeton est périmé (écran quitté entre-temps) ne démarre rien.
    let jetonDAffichage = 0;
    let dernierePosition: Coordonnee | null = null;
    let ancragePrecedent: AncragePrecedent | null = null;
    let suiviAutomatique = true;
    // L'écran sait qu'il attend un choix sur la carte : il n'a pas à le déduire
    // de l'attribut `hidden` d'un écran appartenant à une autre capacité.
    let choixDeCoordonneeEnCours = false;

    requete('#bouton-quitter-suivi', HTMLButtonElement).addEventListener('click', () => {
        quitter();
    });
    requete('#bouton-simuler', HTMLButtonElement).addEventListener('click', () => {
        lancer(choisirUnePositionSimulee(), 'le choix de la position simulée');
    });
    requete('#bouton-quitter-simulation', HTMLButtonElement).addEventListener('click', () => {
        basculerVers('gps');
    });
    boutonReprendre.addEventListener('click', () => {
        reprendreLeSuivi();
    });

    // Seuls un toucher sur le document ou la molette trahissent un défilement
    // humain ; on n'écoute pas 'scroll' (déclenché aussi par nos scrollTo).
    conteneurDesPages.addEventListener(
        'touchstart',
        () => {
            passerEnDefilementManuel();
        },
        { passive: true },
    );
    window.addEventListener(
        'wheel',
        () => {
            passerEnDefilementManuel();
        },
        { passive: true },
    );

    async function afficher(id: TrajetId): Promise<void> {
        idAffiche = id;
        const jeton = ++jetonDAffichage;
        const charge = await repository.charger(id);
        if (jeton !== jetonDAffichage) {
            return;
        }
        trajet = charge;
        rendreLaPile();
        void ecranAllume.maintenir();
        basculerVers('gps');
    }

    function quitter(): void {
        jetonDAffichage++;
        sourceReelle.arreter();
        simulation.arreter();
        void ecranAllume.relacher();
        pile.detruire();
        trajet = null;
        if (idAffiche !== null) {
            surRetour(idAffiche);
        }
    }

    /**
     * Le seul endroit qui change de source de position — et donc le seul qui
     * remette l'état du suivi à zéro.
     *
     * La mémoire de la dernière position et l'ancrage d'adhérence n'ont aucun
     * sens d'une source à l'autre : sans cette remise à zéro, quitter la
     * simulation puis appuyer sur « Reprendre le suivi » recalait la page sur la
     * position simulée, que l'utilisateur lisait comme sa position réelle.
     */
    function basculerVers(mode: ModeDeSuivi): void {
        sourceReelle.arreter();
        simulation.arreter();
        dernierePosition = null;
        ancragePrecedent = null;
        suiviAutomatique = true;
        boutonReprendre.hidden = true;
        bandeauSimulation.hidden = mode !== 'simulation';
        // Le texte d'attente n'est plus écrit ici : la source annonce elle-même
        // son état au démarrage, et `presentation.ts` le rédige.
        if (mode === 'simulation') {
            simulation.demarrer(surPosition, surEtat);
        } else {
            sourceReelle.demarrer(surPosition, surEtat);
        }
    }

    function rendreLaPile(): void {
        // La pile s'affiche comme le document se lit (de bas en haut) : la
        // première page du voyage tout en bas — le voyage remonte l'écran
        // d'un seul tenant, sans rupture aux changements de page.
        pile.rendre(trajet === null ? [] : trajet.imagesDansLOrdreDeLecture());
    }

    // --- Position → défilement --------------------------------------------------

    function surPosition(position: Coordonnee): void {
        dernierePosition = position;
        appliquerLaPosition();
    }

    /**
     * Deux voix écrivent dans la ligne d'état : la source (ici) et la projection
     * (`appliquerLaPosition`). La règle est chronologique — le dernier
     * événement gagne — et elle est juste dans les deux sens : un signal perdu
     * doit couvrir un « hors trajet » devenu douteux, et une position fraîche
     * doit effacer un état d'attente périmé.
     */
    function surEtat(nouvelEtat: EtatDeLaSource): void {
        etat.textContent = texteDEtatDeLaSource(nouvelEtat);
    }

    function appliquerLaPosition(): void {
        const trajetCourant = trajet;
        const position = dernierePosition;
        if (trajetCourant === null || position === null) {
            return;
        }
        const resultat = calculerCibleDeScroll(
            etapesDuVoyage(trajetCourant),
            position,
            ancragePrecedent,
        );
        etat.textContent = texteDEtatDuSuivi(resultat);
        if (resultat.etat === 'sur-trajet') {
            ancragePrecedent = resultat;
            suivreLaCible(resultat.scrollCible);
        }
    }

    /** Le défilement automatique s'efface devant un défilement humain. */
    function suivreLaCible(cible: number): void {
        if (!suiviAutomatique) {
            return;
        }
        const haut = calculerDefilement(
            cible,
            window.innerHeight,
            document.documentElement.scrollHeight,
        );
        window.scrollTo({ top: haut, behavior: 'smooth' });
    }

    /**
     * Les offsets sont relus à chaque position (jamais mis en cache) :
     * gratuit toutes les ~10 s, et insensible aux rotations d'écran.
     */
    function etapesDuVoyage(trajetCourant: Trajet): EtapeDuVoyage[] {
        return trajetCourant.ordreVoyageDesPoints().map((point) => {
            // La pile connaît l'image qu'elle a posée pour chaque page : plus
            // besoin de la retrouver par un sélecteur sur un attribut de données.
            const cadre = pile.elementDeLaPage(point.imageId).getBoundingClientRect();
            return {
                coordonnee: point.coordonnee,
                offset: cadre.top + window.scrollY + point.fraction.valeur * cadre.height,
            };
        });
    }

    // --- Défilement manuel -------------------------------------------------------

    function passerEnDefilementManuel(): void {
        if (ecran.hidden || choixDeCoordonneeEnCours || !suiviAutomatique) {
            return;
        }
        suiviAutomatique = false;
        boutonReprendre.hidden = false;
    }

    function reprendreLeSuivi(): void {
        suiviAutomatique = true;
        boutonReprendre.hidden = true;
        appliquerLaPosition();
    }

    // --- Simulation ----------------------------------------------------------------

    async function choisirUnePositionSimulee(): Promise<void> {
        choixDeCoordonneeEnCours = true;
        let coordonnee: Coordonnee | null;
        try {
            // Les points du trajet servent de repères pour viser une position.
            coordonnee = await selecteurDeCoordonnee.choisir(
                simulation.dernierePosition,
                reperesDuTrajet(),
            );
        } finally {
            choixDeCoordonneeEnCours = false;
        }
        if (coordonnee === null) {
            return;
        }
        basculerVers('simulation');
        simulation.simuler(coordonnee);
    }

    function reperesDuTrajet(): PointAffiche[] {
        if (trajet === null) {
            return [];
        }
        return trajet
            .pointsNumerotesDansLOrdreDuVoyage()
            .map(({ point, numero }) => ({ id: point.id, numero, coordonnee: point.coordonnee }));
    }

    return { afficher };
}
