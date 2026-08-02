// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { CoordonneeSelector } from '../../carte/ports/CoordonneeSelectorPort';
import { query } from '../../shared/dom';
import { createRunner, type Run } from '../../shared/runner';
import { Coordonnee } from '../../trajets/domain/Coordonnee';
import { FractionVerticale } from '../../trajets/domain/FractionVerticale';
import { NomDeTrajet } from '../../trajets/domain/NomDeTrajet';
import { Trajet } from '../../trajets/domain/Trajet';
import type { TrajetRepository, TrajetSummary } from '../../trajets/ports/TrajetRepository';
import { SimulationPositionSource } from '../adapters/SimulationPositionSource';
import type { ScreenWakeLock } from '../ports/ScreenWakeLockPort';
import { createSuiviScreen, type SuiviDependencies } from './SuiviScreen';

/**
 * Dépôt en mémoire, dont la lecture peut rester **en suspens** : c'est ainsi
 * qu'on observe un écran quitté avant la fin de son chargement.
 */
class FakeTrajetRepository implements TrajetRepository {
    private stored: Trajet | null = null;
    private pending: ((trajet: Trajet | null) => void) | null = null;

    put(trajet: Trajet): void {
        this.stored = trajet;
    }

    /** Suspend la prochaine lecture jusqu'à `terminerLaLecture()`. */
    suspendreLaLecture(): void {
        this.pending = null;
        this.suspendu = true;
    }

    terminerLaLecture(): void {
        const resolve = this.pending;
        this.suspendu = false;
        this.pending = null;
        resolve?.(this.stored);
    }

    private suspendu = false;

    load(): Promise<Trajet | null> {
        if (!this.suspendu) {
            return Promise.resolve(this.stored);
        }
        return new Promise((resolve) => {
            this.pending = resolve;
        });
    }

    listSummaries(): Promise<TrajetSummary[]> {
        return Promise.resolve([]);
    }

    save(): Promise<void> {
        return Promise.resolve();
    }

    delete(): Promise<void> {
        return Promise.resolve();
    }
}

/** Verrou d'écran observable par son état, pas par les appels reçus. */
class FakeScreenWakeLock implements ScreenWakeLock {
    private held = false;

    acquire(): Promise<void> {
        this.held = true;
        return Promise.resolve();
    }

    release(): Promise<void> {
        this.held = false;
        return Promise.resolve();
    }

    isHeld(): boolean {
        return this.held;
    }
}

/** Carte qui n'ouvre jamais rien : aucun test d'ici ne choisit de coordonnée. */
const carteMuette: CoordonneeSelector = {
    choose: () => Promise.resolve(null),
};

/** Un trajet d'une page et deux points, autour de Bordeaux. */
function trajetDeDeuxPoints(): Trajet {
    const trajet = Trajet.create(NomDeTrajet.create('Paris → Bordeaux'));
    const imageId = trajet.addImage({
        nom: 'page-1.png',
        blob: new Blob(['page']),
        largeur: 800,
        hauteur: 1200,
    });
    trajet.addPoint({
        imageId,
        fraction: FractionVerticale.create(0.9),
        coordonnee: Coordonnee.create(44.826, -0.556),
    });
    trajet.addPoint({
        imageId,
        fraction: FractionVerticale.create(0.1),
        coordonnee: Coordonnee.create(44.9, -0.5),
    });
    return trajet;
}

let repository: FakeTrajetRepository;
let realSource: SimulationPositionSource;
let simulation: SimulationPositionSource;
let screenWakeLock: FakeScreenWakeLock;
let echecs: string[];
let run: Run;
let trajet: Trajet;
let retours: number;

beforeEach(() => {
    document.body.replaceChildren();
    repository = new FakeTrajetRepository();
    // Le GPS réel est ici une seconde source pilotable : l'écran ne fait
    // aucune différence entre les deux, c'est tout l'intérêt du port.
    realSource = new SimulationPositionSource();
    simulation = new SimulationPositionSource();
    screenWakeLock = new FakeScreenWakeLock();
    echecs = [];
    retours = 0;
    run = createRunner((message) => echecs.push(message));
    trajet = trajetDeDeuxPoints();
    repository.put(trajet);
});

function dependances(): SuiviDependencies {
    return {
        repository,
        realSource,
        simulation,
        coordonneeSelector: carteMuette,
        screenWakeLock,
        run,
        trajetId: trajet.id,
        onBack: () => {
            retours++;
        },
    };
}

/** Attache l'écran et laisse le chargement du trajet s'achever. */
async function attacherLEcran(): Promise<HTMLElement> {
    const element = createSuiviScreen(dependances());
    document.body.append(element);
    await Promise.resolve();
    await Promise.resolve();
    return element;
}

function statut(element: HTMLElement): string {
    return query('#suivi-status', HTMLSpanElement, element).textContent;
}

describe('suivi-screen', () => {
    describe('Étant donné un trajet, quand j’attache l’écran', () => {
        it('alors ses pages sont montées et l’écran est gardé allumé', async () => {
            const element = await attacherLEcran();

            expect(element.querySelectorAll('schema-page')).toHaveLength(1);
            expect(screenWakeLock.isHeld()).toBe(true);
            expect(echecs).toEqual([]);
        });

        it('alors la source annonce elle-même son attente', async () => {
            const element = await attacherLEcran();

            expect(statut(element)).toBe('En attente du signal GPS…');
        });
    });

    describe('Étant donné un écran attaché, quand je touche « Éditer »', () => {
        it('alors l’écran demande le retour, sans se démonter lui-même', async () => {
            const element = await attacherLEcran();

            query('#leave-suivi-button', HTMLButtonElement, element).click();

            // C'est la navigation qui détache, pas l'écran : il ne décide pas
            // où l'on va, il dit seulement qu'on veut partir.
            expect(retours).toBe(1);
            expect(element.isConnected).toBe(true);
        });
    });

    describe('Étant donné un écran attaché, quand une position arrive', () => {
        it('alors une position loin de la ligne est annoncée hors trajet', async () => {
            const element = await attacherLEcran();

            realSource.simulate(Coordonnee.create(48.857, 2.295));

            expect(statut(element)).toMatch(/^Hors trajet \(à \d+ km de la ligne\)\.$/);
        });
    });

    describe('Étant donné un écran attaché, quand je le détache', () => {
        it('alors le verrou d’écran est relâché', async () => {
            const element = await attacherLEcran();

            element.remove();

            expect(screenWakeLock.isHeld()).toBe(false);
        });

        it('alors une position qui arrive ensuite ne change plus rien', async () => {
            const element = await attacherLEcran();
            const avant = statut(element);

            element.remove();
            realSource.simulate(Coordonnee.create(48.857, 2.295));

            expect(statut(element)).toBe(avant);
        });

        it('alors la molette ne rallume plus « Reprendre le suivi »', async () => {
            const element = await attacherLEcran();
            const resume = query('#resume-button', HTMLButtonElement, element);

            element.remove();
            window.dispatchEvent(new WheelEvent('wheel'));

            // L'écouteur vit sur `window`, hors de l'écran : sans le signal
            // d'abandon, il survivrait à la sortie et s'ajouterait à chaque visite.
            expect(resume.hidden).toBe(true);
        });

        it('alors les pages libèrent ce qu’elles retenaient', async () => {
            const element = await attacherLEcran();

            element.remove();
            await Promise.resolve();

            expect(element.querySelector('schema-page')?.shadowRoot?.children).toHaveLength(0);
        });
    });

    describe('Étant donné un chargement encore en cours, quand je détache l’écran', () => {
        it('alors rien n’est monté et aucun verrou n’est demandé', async () => {
            repository.suspendreLaLecture();
            const element = createSuiviScreen(dependances());
            document.body.append(element);

            element.remove();
            repository.terminerLaLecture();
            await Promise.resolve();
            await Promise.resolve();

            expect(element.querySelectorAll('schema-page')).toHaveLength(0);
            // Le verrou est le vrai danger : demandé après la sortie, plus
            // personne n'était là pour le rendre.
            expect(screenWakeLock.isHeld()).toBe(false);
        });
    });
});
