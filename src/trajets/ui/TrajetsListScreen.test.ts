// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { query, queryAll } from '../../shared/dom';
import { createRunner, type Run } from '../../shared/runner';
import type { Trajet } from '../domain/Trajet';
import { newTrajetId } from '../domain/ids';
import type { TrajetId } from '../domain/ids';
import type { TrajetRepository, TrajetSummary } from '../ports/TrajetRepository';
import { createTrajetsListScreen, type TrajetsListDependencies } from './TrajetsListScreen';

/** Dépôt en mémoire dont la lecture de la liste peut tomber en panne. */
class FakeTrajetRepository implements TrajetRepository {
    private summaries: TrajetSummary[] = [];
    private panne: string | null = null;
    private supprimes: TrajetId[] = [];

    contient(...summaries: TrajetSummary[]): void {
        this.summaries = summaries;
    }

    tomberEnPanne(message: string): void {
        this.panne = message;
    }

    reparer(): void {
        this.panne = null;
    }

    trajetsSupprimes(): TrajetId[] {
        return [...this.supprimes];
    }

    listSummaries(): Promise<TrajetSummary[]> {
        if (this.panne !== null) {
            return Promise.reject(new Error(this.panne));
        }
        return Promise.resolve([...this.summaries]);
    }

    load(): Promise<Trajet | null> {
        return Promise.resolve(null);
    }

    save(): Promise<void> {
        return Promise.resolve();
    }

    delete(id: TrajetId): Promise<void> {
        this.supprimes.push(id);
        this.summaries = this.summaries.filter((summary) => summary.id !== id);
        return Promise.resolve();
    }
}

function summary(nom: string, imageCount = 2, pointCount = 3): TrajetSummary {
    return { id: newTrajetId(), nom, creeLe: new Date(0), imageCount, pointCount };
}

let repository: FakeTrajetRepository;
let echecs: string[];
let run: Run;
let ouvertures: TrajetId[];

beforeEach(() => {
    document.body.replaceChildren();
    repository = new FakeTrajetRepository();
    echecs = [];
    ouvertures = [];
    run = createRunner((message) => echecs.push(message));
});

function dependances(): TrajetsListDependencies {
    return {
        repository,
        run,
        onOpen: (id) => ouvertures.push(id),
    };
}

async function attacherLEcran(): Promise<HTMLElement> {
    const element = createTrajetsListScreen(dependances());
    document.body.append(element);
    await laisserLesPromessesSAchever();
    return element;
}

function laisserLesPromessesSAchever(): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, 0);
    });
}

function nomsAffiches(element: HTMLElement): string[] {
    return queryAll('.trajet-name', HTMLButtonElement, element).map((bouton) => bouton.textContent);
}

function messageDErreur(element: HTMLElement): string | null {
    const banniere = query('#list-error', HTMLParagraphElement, element);
    return banniere.hidden ? null : query('#list-error-text', HTMLSpanElement, element).textContent;
}

describe('trajets-list-screen', () => {
    describe("Étant donné des trajets enregistrés, quand j'attache l'écran", () => {
        it("alors il les liste avec leurs comptes d'images et de points", async () => {
            repository.contient(summary('Paris → Bordeaux', 6, 4), summary('Tours → Nantes', 2, 2));

            const element = await attacherLEcran();

            expect(nomsAffiches(element)).toEqual(['Paris → Bordeaux', 'Tours → Nantes']);
            expect(queryAll('.trajet-details', HTMLSpanElement, element)[0]?.textContent).toBe(
                '6 images · 4 points',
            );
            expect(query('#empty-list', HTMLParagraphElement, element).hidden).toBe(true);
        });
    });

    describe("Étant donné aucun trajet, quand j'attache l'écran", () => {
        it('alors il invite à en créer un', async () => {
            const element = await attacherLEcran();

            expect(nomsAffiches(element)).toEqual([]);
            expect(query('#empty-list', HTMLParagraphElement, element).hidden).toBe(false);
        });
    });

    describe('Étant donné une ligne de trajet, quand je touche son nom', () => {
        it("alors l'écran demande l'ouverture de ce trajet-là", async () => {
            const paris = summary('Paris → Bordeaux');
            repository.contient(summary('Tours → Nantes'), paris);
            const element = await attacherLEcran();

            queryAll('.trajet-name', HTMLButtonElement, element)[1]?.click();

            expect(ouvertures).toEqual([paris.id]);
        });
    });

    describe("Étant donné un dépôt illisible, quand j'attache l'écran", () => {
        it('alors il dit ce qui se passe au lieu de rester vide', async () => {
            repository.tomberEnPanne('Base bloquée par un autre onglet.');

            const element = await attacherLEcran();

            expect(messageDErreur(element)).toBe(
                'Impossible de lire la liste des trajets. Base bloquée par un autre onglet.',
            );
            // Pas de message d'accueil : il ferait croire qu'il n'y a pas de trajet.
            expect(query('#empty-list', HTMLParagraphElement, element).hidden).toBe(true);
        });

        it('alors « Réessayer » relit la liste une fois le dépôt réparé', async () => {
            repository.tomberEnPanne('Base bloquée par un autre onglet.');
            const element = await attacherLEcran();
            repository.contient(summary('Paris → Bordeaux'));
            repository.reparer();

            query('#retry-list-button', HTMLButtonElement, element).click();
            await laisserLesPromessesSAchever();

            expect(nomsAffiches(element)).toEqual(['Paris → Bordeaux']);
            expect(messageDErreur(element)).toBeNull();
        });
    });

    describe('Étant donné un trajet, quand je le supprime et confirme', () => {
        it('alors il quitte le dépôt et la liste est relue', async () => {
            const paris = summary('Paris → Bordeaux');
            repository.contient(paris);
            const element = await attacherLEcran();
            window.confirm = () => true;

            queryAll('button', HTMLButtonElement, element)
                .find(
                    (bouton) => bouton.getAttribute('aria-label') === 'Supprimer Paris → Bordeaux',
                )
                ?.click();
            await laisserLesPromessesSAchever();

            expect(repository.trajetsSupprimes()).toEqual([paris.id]);
            expect(nomsAffiches(element)).toEqual([]);
        });
    });
});
