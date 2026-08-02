/**
 * Composition root : c'est le seul fichier qui connaît les adapters concrets.
 * Il les instancie, les injecte dans les écrans, et démarre l'application.
 */
import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { LeafletCarteDesPoints } from './carte/adapters/LeafletCarteDesPoints';
import { LeafletCoordonneeSelector } from './carte/adapters/LeafletCoordonneeSelector';
import { query } from './shared/dom';
import { defaultRunner } from './shared/runner';
import { goTo, goToScreen } from './navigation';
import { GeolocationPositionSource } from './suivi/adapters/GeolocationPositionSource';
import { BrowserScreenWakeLock } from './suivi/adapters/BrowserScreenWakeLock';
import { BrowserForeground } from './suivi/adapters/BrowserForeground';
import { SimulationPositionSource } from './suivi/adapters/SimulationPositionSource';
import { createSuiviScreen } from './suivi/ui/SuiviScreen';
import { IdbTrajetRepository } from './trajets/adapters/IdbTrajetRepository';
import { createLastOpenedSession } from './trajets/adapters/lastOpenedSession';
import type { TrajetId } from './trajets/domain/ids';
import { createTrajetEditorScreen } from './trajets/ui/TrajetEditorScreen';
import { createTrajetsListScreen } from './trajets/ui/TrajetsListScreen';

function start(): void {
    // La frontière d'erreur de l'application : tout travail lancé par un geste
    // de l'utilisateur y passe, pour qu'aucun échec ne reste muet.
    const run = defaultRunner;
    const repository = new IdbTrajetRepository();
    const coordonneeSelector = new LeafletCoordonneeSelector();
    const carteDesPoints = new LeafletCarteDesPoints();
    const lastOpenedSession = createLastOpenedSession();
    // Un seul jeu d'écouteurs pour tous ceux qui doivent se réveiller quand la
    // page revient au premier plan (le GPS et le verrou d'écran).
    const foreground = new BrowserForeground();
    // Les adapters vivent plus longtemps que les écrans, qui naissent et meurent
    // à chaque visite : leurs contrats les disent redémarrables et remontables.
    const realSource = new GeolocationPositionSource({ foreground });
    const simulation = new SimulationPositionSource();
    const screenWakeLock = new BrowserScreenWakeLock({ foreground });

    const trajetsListScreen = createTrajetsListScreen({
        repository,
        run,
        onOpen: (id) => {
            lastOpenedSession.remember(id);
            openEditor(id);
        },
    });

    function openEditor(id: TrajetId): void {
        goToScreen(
            createTrajetEditorScreen({
                repository,
                coordonneeSelector,
                carteDesPoints,
                run,
                trajetId: id,
                onBack: () => {
                    lastOpenedSession.forget();
                    openList();
                },
                onSuivi: () => {
                    openSuivi(id);
                },
            }),
        );
    }

    function openSuivi(id: TrajetId): void {
        goToScreen(
            createSuiviScreen({
                repository,
                realSource,
                simulation,
                coordonneeSelector,
                screenWakeLock,
                run,
                trajetId: id,
                onBack: () => {
                    openEditor(id);
                },
            }),
        );
    }

    function openList(): void {
        run(
            goTo('list', () => trajetsListScreen.show()),
            'la lecture de la liste',
        );
    }

    // Si iOS a tué la PWA en plein voyage, on rouvre directement le dernier trajet.
    const lastTrajet = lastOpenedSession.restore();
    if (lastTrajet !== null) {
        openEditor(lastTrajet);
    } else {
        openList();
    }
}

function enableOfflineMode(): void {
    registerSW({
        onOfflineReady() {
            const indicateur = query('#offline-indicator', HTMLElement);
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

start();
enableOfflineMode();
