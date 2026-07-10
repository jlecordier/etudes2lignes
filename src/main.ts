/**
 * Composition root : c'est le seul fichier qui connaît les adapters concrets.
 * Il les instancie, les injecte dans les écrans, et démarre l'application.
 */
import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { LeafletSelecteurDeCoordonnee } from './carte/adapters/LeafletSelecteurDeCoordonnee';
import { afficherEcran } from './navigation';
import { GeolocationPositionSource } from './suivi/adapters/GeolocationPositionSource';
import { NavigateurEcranAllume } from './suivi/adapters/NavigateurEcranAllume';
import { SimulationPositionSource } from './suivi/adapters/SimulationPositionSource';
import { creerSuiviScreen } from './suivi/ui/SuiviScreen';
import { IdbTrajetRepository } from './trajets/adapters/IdbTrajetRepository';
import type { TrajetId } from './trajets/domain/ids';
import { creerEditeurTrajetScreen } from './trajets/ui/EditeurTrajetScreen';
import { creerListeTrajetsScreen } from './trajets/ui/ListeTrajetsScreen';

const CLE_DERNIER_TRAJET = 'dernierTrajetId';

function demarrer(): void {
    const repository = new IdbTrajetRepository();
    const selecteurDeCoordonnee = new LeafletSelecteurDeCoordonnee();

    const suivi = creerSuiviScreen({
        repository,
        sourceReelle: new GeolocationPositionSource(),
        simulation: new SimulationPositionSource(),
        selecteurDeCoordonnee,
        ecranAllume: new NavigateurEcranAllume(),
        surRetour: (id) => {
            afficherEcran('editeur');
            void editeurTrajet.afficher(id);
        },
    });

    const editeurTrajet = creerEditeurTrajetScreen({
        repository,
        selecteurDeCoordonnee,
        surRetour: () => {
            localStorage.removeItem(CLE_DERNIER_TRAJET);
            afficherEcran('liste');
            void listeTrajets.afficher();
        },
        surSuivi: (id) => {
            afficherEcran('suivi');
            void suivi.afficher(id);
        },
    });

    const listeTrajets = creerListeTrajetsScreen({
        repository,
        surOuverture: (id) => {
            localStorage.setItem(CLE_DERNIER_TRAJET, id);
            afficherEcran('editeur');
            void editeurTrajet.afficher(id);
        },
    });

    // Si iOS a tué la PWA en plein voyage, on rouvre directement le dernier trajet.
    const dernierTrajet = localStorage.getItem(CLE_DERNIER_TRAJET) as TrajetId | null;
    if (dernierTrajet !== null) {
        afficherEcran('editeur');
        void editeurTrajet.afficher(dernierTrajet);
    } else {
        afficherEcran('liste');
        void listeTrajets.afficher();
    }
}

function activerLeModeHorsLigne(): void {
    registerSW({
        onOfflineReady() {
            const indicateur = document.querySelector<HTMLElement>('#indicateur-hors-ligne')!;
            indicateur.hidden = false;
        },
    });
    // Best effort : demande au navigateur de ne jamais purger le stockage.
    void navigator.storage?.persist?.();
}

demarrer();
activerLeModeHorsLigne();
