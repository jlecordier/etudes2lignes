import type { SelecteurDeCoordonnee } from '../../carte/ports/SelecteurDeCoordonneePort';
import type { Coordonnee } from '../../trajets/domain/Coordonnee';
import type { Trajet } from '../../trajets/domain/Trajet';
import type { TrajetId } from '../../trajets/domain/ids';
import type { TrajetRepository } from '../../trajets/ports/TrajetRepository';
import { elementImagePleineLargeur, revoquerLesUrls } from '../../trajets/ui/elementsDImage';
import { texteDEtatDuSuivi } from '../domain/presentation';
import {
    calculerCibleDeScroll,
    calculerDefilement,
    type AncragePrecedent,
    type EtapeDuVoyage,
} from '../domain/projection';
import type { EcranAllume } from '../ports/EcranAllumePort';
import type { PositionSource } from '../ports/PositionSource';
import type { SimulateurDePosition } from '../ports/SimulateurDePosition';

export interface DependancesSuivi {
    repository: TrajetRepository;
    sourceReelle: PositionSource;
    simulation: SimulateurDePosition;
    selecteurDeCoordonnee: SelecteurDeCoordonnee;
    ecranAllume: EcranAllume;
    surRetour: (id: TrajetId) => void;
}

/**
 * Écran de suivi : les pages du trajet empilées, et le document qui défile
 * tout seul pour placer la position courante aux trois quarts de l'écran.
 */
export function creerSuiviScreen(dependances: DependancesSuivi): {
    afficher: (id: TrajetId) => Promise<void>;
} {
    const { repository, sourceReelle, simulation, selecteurDeCoordonnee, ecranAllume, surRetour } =
        dependances;
    const ecran = document.querySelector<HTMLElement>('#ecran-suivi')!;
    const pile = document.querySelector<HTMLDivElement>('#pile-suivi')!;
    const etat = document.querySelector<HTMLSpanElement>('#etat-suivi')!;
    const bandeauSimulation = document.querySelector<HTMLElement>('#bandeau-simulation')!;
    const boutonReprendre = document.querySelector<HTMLButtonElement>('#bouton-reprendre')!;

    let trajet: Trajet | null = null;
    let idAffiche: TrajetId | null = null;
    // Incrémenté à chaque affichage et à chaque sortie : un chargement dont le
    // jeton est périmé (écran quitté entre-temps) ne démarre rien.
    let jetonDAffichage = 0;
    let dernierePosition: Coordonnee | null = null;
    let ancragePrecedent: AncragePrecedent | null = null;
    let suiviAutomatique = true;
    const urlsARevoquer: string[] = [];

    document
        .querySelector<HTMLButtonElement>('#bouton-quitter-suivi')!
        .addEventListener('click', () => quitter());
    document
        .querySelector<HTMLButtonElement>('#bouton-simuler')!
        .addEventListener('click', () => void choisirUnePositionSimulee());
    document
        .querySelector<HTMLButtonElement>('#bouton-quitter-simulation')!
        .addEventListener('click', () => quitterLaSimulation());
    boutonReprendre.addEventListener('click', () => reprendreLeSuivi());

    // Seuls un toucher sur le document ou la molette trahissent un défilement
    // humain ; on n'écoute pas 'scroll' (déclenché aussi par nos scrollTo).
    pile.addEventListener('touchstart', () => passerEnDefilementManuel(), { passive: true });
    window.addEventListener('wheel', () => passerEnDefilementManuel(), { passive: true });

    async function afficher(id: TrajetId): Promise<void> {
        idAffiche = id;
        const jeton = ++jetonDAffichage;
        const charge = await repository.charger(id);
        if (jeton !== jetonDAffichage) {
            return;
        }
        trajet = charge;
        dernierePosition = null;
        ancragePrecedent = null;
        suiviAutomatique = true;
        boutonReprendre.hidden = true;
        bandeauSimulation.hidden = true;
        etat.textContent = 'En attente de position…';
        rendreLaPile();
        void ecranAllume.maintenir();
        sourceReelle.demarrer(surPosition, surErreur);
    }

    function quitter(): void {
        jetonDAffichage++;
        sourceReelle.arreter();
        simulation.arreter();
        void ecranAllume.relacher();
        revoquerLesUrls(urlsARevoquer);
        surRetour(idAffiche!);
    }

    function rendreLaPile(): void {
        revoquerLesUrls(urlsARevoquer);
        // La pile s'affiche comme le document se lit (de bas en haut) : la
        // première page du voyage tout en bas — le voyage remonte l'écran
        // d'un seul tenant, sans rupture aux changements de page.
        const imagesDeHautEnBas = [...(trajet?.images ?? [])].reverse();
        pile.replaceChildren(
            ...imagesDeHautEnBas.map((image) => elementImagePleineLargeur(image, urlsARevoquer)),
        );
    }

    // --- Position → défilement --------------------------------------------------

    function surPosition(position: Coordonnee): void {
        dernierePosition = position;
        appliquerLaPosition();
    }

    function surErreur(message: string): void {
        etat.textContent = message;
    }

    function appliquerLaPosition(): void {
        if (trajet === null || dernierePosition === null) {
            return;
        }
        const resultat = calculerCibleDeScroll(
            etapesDuVoyage(),
            dernierePosition,
            ancragePrecedent,
        );
        etat.textContent = texteDEtatDuSuivi(resultat);
        if (resultat.etat !== 'sur-trajet') {
            return;
        }
        ancragePrecedent = resultat;
        if (suiviAutomatique) {
            defilerVers(resultat.scrollCible);
        }
    }

    /**
     * Les offsets sont relus à chaque position (jamais mis en cache) :
     * gratuit toutes les ~10 s, et insensible aux rotations d'écran.
     */
    function etapesDuVoyage(): EtapeDuVoyage[] {
        return trajet!.ordreVoyageDesPoints().map((point) => {
            const image = pile.querySelector<HTMLImageElement>(
                `img[data-image-id="${point.imageId}"]`,
            )!;
            const cadre = image.getBoundingClientRect();
            return {
                coordonnee: point.coordonnee,
                offset: cadre.top + window.scrollY + point.fraction.valeur * cadre.height,
            };
        });
    }

    function defilerVers(cible: number): void {
        const haut = calculerDefilement(
            cible,
            window.innerHeight,
            document.documentElement.scrollHeight,
        );
        window.scrollTo({ top: haut, behavior: 'smooth' });
    }

    // --- Défilement manuel -------------------------------------------------------

    function passerEnDefilementManuel(): void {
        const carteOuverte = !document.querySelector<HTMLElement>('#ecran-carte')!.hidden;
        if (ecran.hidden || carteOuverte || !suiviAutomatique) {
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
        const coordonnee = await selecteurDeCoordonnee.choisir(simulation.dernierePosition);
        if (coordonnee === null) {
            return;
        }
        sourceReelle.arreter();
        bandeauSimulation.hidden = false;
        simulation.demarrer(surPosition, surErreur);
        simulation.simuler(coordonnee);
    }

    function quitterLaSimulation(): void {
        simulation.arreter();
        bandeauSimulation.hidden = true;
        etat.textContent = 'En attente de position…';
        sourceReelle.demarrer(surPosition, surErreur);
    }

    return { afficher };
}
