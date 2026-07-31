/**
 * Composition root : c'est le seul fichier qui connaît les adapters concrets.
 * Il les instancie, les injecte dans les écrans, et démarre l'application.
 */
import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { LeafletCarteDesPoints } from './carte/adapters/LeafletCarteDesPoints';
import { LeafletSelecteurDeCoordonnee } from './carte/adapters/LeafletSelecteurDeCoordonnee';
import { requete } from './commun/dom';
import { lanceurParDefaut } from './commun/lancement';
import { aller } from './navigation';
import { GeolocationPositionSource } from './suivi/adapters/GeolocationPositionSource';
import { NavigateurEcranAllume } from './suivi/adapters/NavigateurEcranAllume';
import { NavigateurPremierPlan } from './suivi/adapters/NavigateurPremierPlan';
import { SimulationPositionSource } from './suivi/adapters/SimulationPositionSource';
import { creerSuiviScreen } from './suivi/ui/SuiviScreen';
import { IdbTrajetRepository } from './trajets/adapters/IdbTrajetRepository';
import { creerDerniereSessionOuverte } from './trajets/adapters/derniereSessionOuverte';
import { creerEditeurTrajetScreen } from './trajets/ui/EditeurTrajetScreen';
import { creerListeTrajetsScreen } from './trajets/ui/ListeTrajetsScreen';

function demarrer(): void {
    // La frontière d'erreur de l'application : tout travail lancé par un geste
    // de l'utilisateur y passe, pour qu'aucun échec ne reste muet.
    const lancer = lanceurParDefaut;
    const repository = new IdbTrajetRepository();
    const selecteurDeCoordonnee = new LeafletSelecteurDeCoordonnee();
    const derniereSession = creerDerniereSessionOuverte();
    // Un seul jeu d'écouteurs pour tous ceux qui doivent se réveiller quand la
    // page revient au premier plan (le GPS et le verrou d'écran).
    const premierPlan = new NavigateurPremierPlan();

    const suivi = creerSuiviScreen({
        repository,
        sourceReelle: new GeolocationPositionSource({ premierPlan }),
        simulation: new SimulationPositionSource(),
        selecteurDeCoordonnee,
        ecranAllume: new NavigateurEcranAllume({ premierPlan }),
        lancer,
        surRetour: (id) => {
            lancer(
                aller('editeur', () => editeurTrajet.afficher(id)),
                'l’ouverture du trajet',
            );
        },
    });

    const editeurTrajet = creerEditeurTrajetScreen({
        repository,
        selecteurDeCoordonnee,
        carteDesPoints: new LeafletCarteDesPoints('carte-points'),
        lancer,
        surRetour: () => {
            derniereSession.oublier();
            lancer(
                aller('liste', () => listeTrajets.afficher()),
                'la lecture de la liste',
            );
        },
        surSuivi: (id) => {
            lancer(
                aller('suivi', () => suivi.afficher(id)),
                'l’ouverture du suivi',
            );
        },
    });

    const listeTrajets = creerListeTrajetsScreen({
        repository,
        lancer,
        surOuverture: (id) => {
            derniereSession.memoriser(id);
            lancer(
                aller('editeur', () => editeurTrajet.afficher(id)),
                'l’ouverture du trajet',
            );
        },
    });

    // Si iOS a tué la PWA en plein voyage, on rouvre directement le dernier trajet.
    const dernierTrajet = derniereSession.restaurer();
    if (dernierTrajet !== null) {
        lancer(
            aller('editeur', () => editeurTrajet.afficher(dernierTrajet)),
            'l’ouverture du dernier trajet',
        );
    } else {
        lancer(
            aller('liste', () => listeTrajets.afficher()),
            'la lecture de la liste',
        );
    }
}

function activerLeModeHorsLigne(): void {
    registerSW({
        onOfflineReady() {
            const indicateur = requete('#indicateur-hors-ligne', HTMLElement);
            indicateur.hidden = false;
        },
    });
    // Best effort : demande au navigateur de ne jamais purger le stockage.
    // navigator.storage est typé comme toujours présent, mais absent de certains
    // navigateurs (contexte non sécurisé, vieux Safari). On l'annote optionnel pour
    // exprimer honnêtement cette absence possible (Navigator s'y assigne sans cast).
    const navigateur: { storage?: { persist?: () => Promise<boolean> } } = navigator;
    void navigateur.storage?.persist?.();
}

demarrer();
activerLeModeHorsLigne();
