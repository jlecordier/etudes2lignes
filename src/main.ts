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
import { goTo } from './navigation';
import { GeolocationPositionSource } from './suivi/adapters/GeolocationPositionSource';
import { BrowserScreenWakeLock } from './suivi/adapters/BrowserScreenWakeLock';
import { BrowserForeground } from './suivi/adapters/BrowserForeground';
import { SimulationPositionSource } from './suivi/adapters/SimulationPositionSource';
import { createSuiviScreen } from './suivi/ui/SuiviScreen';
import { IdbTrajetRepository } from './trajets/adapters/IdbTrajetRepository';
import { createLastOpenedSession } from './trajets/adapters/lastOpenedSession';
import { createTrajetEditorScreen } from './trajets/ui/TrajetEditorScreen';
import { createTrajetsListScreen } from './trajets/ui/TrajetsListScreen';

function start(): void {
    // La frontière d'erreur de l'application : tout travail lancé par un geste
    // de l'utilisateur y passe, pour qu'aucun échec ne reste muet.
    const run = defaultRunner;
    const repository = new IdbTrajetRepository();
    const coordonneeSelector = new LeafletCoordonneeSelector();
    const lastOpenedSession = createLastOpenedSession();
    // Un seul jeu d'écouteurs pour tous ceux qui doivent se réveiller quand la
    // page revient au premier plan (le GPS et le verrou d'écran).
    const foreground = new BrowserForeground();

    const suivi = createSuiviScreen({
        repository,
        realSource: new GeolocationPositionSource({ foreground }),
        simulation: new SimulationPositionSource(),
        coordonneeSelector,
        screenWakeLock: new BrowserScreenWakeLock({ foreground }),
        run,
        onBack: (id) => {
            run(
                goTo('editor', () => trajetEditor.show(id)),
                'l’ouverture du trajet',
            );
        },
    });

    const trajetEditor = createTrajetEditorScreen({
        repository,
        coordonneeSelector,
        carteDesPoints: new LeafletCarteDesPoints('carte-points'),
        run,
        onBack: () => {
            lastOpenedSession.forget();
            run(
                goTo('list', () => trajetsListScreen.show()),
                'la lecture de la liste',
            );
        },
        onSuivi: (id) => {
            run(
                goTo('suivi', () => suivi.show(id)),
                'l’ouverture du suivi',
            );
        },
    });

    const trajetsListScreen = createTrajetsListScreen({
        repository,
        run,
        onOpen: (id) => {
            lastOpenedSession.remember(id);
            run(
                goTo('editor', () => trajetEditor.show(id)),
                'l’ouverture du trajet',
            );
        },
    });

    // Si iOS a tué la PWA en plein voyage, on rouvre directement le dernier trajet.
    const lastTrajet = lastOpenedSession.restore();
    if (lastTrajet !== null) {
        run(
            goTo('editor', () => trajetEditor.show(lastTrajet)),
            'l’ouverture du dernier trajet',
        );
    } else {
        run(
            goTo('list', () => trajetsListScreen.show()),
            'la lecture de la liste',
        );
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
