// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { CarteDesPoints, DisplayedPoint } from '../../carte/ports/CarteDesPointsPort';
import type { CoordonneeSelector } from '../../carte/ports/CoordonneeSelectorPort';
import { queryAll } from '../../shared/dom';
import { createRunner, type Run } from '../../shared/runner';
import { Coordonnee } from '../domain/Coordonnee';
import { FractionVerticale } from '../domain/FractionVerticale';
import { NomDeTrajet } from '../domain/NomDeTrajet';
import { Trajet } from '../domain/Trajet';
import type { TrajetRepository, TrajetSummary } from '../ports/TrajetRepository';
import { createTrajetEditorScreen, type TrajetEditorDependencies } from './TrajetEditorScreen';

/**
 * Dépôt en mémoire qui rend à chaque lecture un agrégat **neuf**, reconstruit
 * depuis ce qui est stocké : c'est ainsi qu'on distingue ce que l'écran a en
 * mémoire de ce qui est réellement enregistré.
 */
class FakeTrajetRepository implements TrajetRepository {
    private refuseraLaProchaineEcriture = false;
    private lectureSuspendue = false;
    private pending: ((trajet: Trajet | null) => void) | null = null;

    constructor(private stocke: (() => Trajet) | null) {}

    viderLeDepot(): void {
        this.stocke = null;
    }

    refuserLaProchaineEcriture(): void {
        this.refuseraLaProchaineEcriture = true;
    }

    suspendreLaLecture(): void {
        this.lectureSuspendue = true;
    }

    terminerLaLecture(): void {
        const resolve = this.pending;
        this.lectureSuspendue = false;
        this.pending = null;
        resolve?.(this.stocke === null ? null : this.stocke());
    }

    load(): Promise<Trajet | null> {
        if (this.lectureSuspendue) {
            return new Promise((resolve) => {
                this.pending = resolve;
            });
        }
        return Promise.resolve(this.stocke === null ? null : this.stocke());
    }

    save(): Promise<void> {
        if (this.refuseraLaProchaineEcriture) {
            this.refuseraLaProchaineEcriture = false;
            return Promise.reject(new Error('Stockage plein.'));
        }
        return Promise.resolve();
    }

    listSummaries(): Promise<TrajetSummary[]> {
        return Promise.resolve([]);
    }

    delete(): Promise<void> {
        return Promise.resolve();
    }
}

/** Carte des points observable par son état : montée ou non, et ce qu'elle affiche. */
class FakeCarteDesPoints implements CarteDesPoints {
    private container: HTMLElement | null = null;
    private displayed: readonly DisplayedPoint[] = [];

    mount(container: HTMLElement): void {
        this.container = container;
    }

    unmount(): void {
        this.container = null;
        this.displayed = [];
    }

    show(points: readonly DisplayedPoint[]): void {
        this.displayed = points;
    }

    chooseCoordonnee(): Promise<Coordonnee | null> {
        return Promise.resolve(null);
    }

    cancelChoice(): void {
        // Rien à abandonner : aucun choix n'est armé dans ces tests.
    }

    isMounted(): boolean {
        return this.container !== null;
    }

    numerosAffiches(): number[] {
        return this.displayed.map((point) => point.number);
    }
}

/** Carte plein écran qui n'ouvre jamais rien. */
const carteMuette: CoordonneeSelector = {
    choose: () => Promise.resolve(null),
};

/** Un trajet de trois pages et un point, dans l'ordre du voyage p1, p2, p3. */
function trajetDeTroisPages(): Trajet {
    const trajet = Trajet.create(NomDeTrajet.create('Paris → Bordeaux'));
    const premiere = trajet.addImage(page('p1.png'));
    trajet.addImage(page('p2.png'));
    trajet.addImage(page('p3.png'));
    trajet.addPoint({
        imageId: premiere,
        fraction: FractionVerticale.create(0.5),
        coordonnee: Coordonnee.create(44.826, -0.556),
    });
    return trajet;
}

function page(nom: string): { nom: string; blob: Blob; largeur: number; hauteur: number } {
    return { nom, blob: new Blob([nom]), largeur: 800, hauteur: 1200 };
}

let repository: FakeTrajetRepository;
let carteDesPoints: FakeCarteDesPoints;
let echecs: string[];
let run: Run;
let retours: number;
let suivis: number;

beforeEach(() => {
    document.body.replaceChildren();
    repository = new FakeTrajetRepository(trajetDeTroisPages);
    carteDesPoints = new FakeCarteDesPoints();
    echecs = [];
    retours = 0;
    suivis = 0;
    run = createRunner((message) => echecs.push(message));
});

function dependances(): TrajetEditorDependencies {
    return {
        repository,
        coordonneeSelector: carteMuette,
        carteDesPoints,
        run,
        trajetId: Trajet.create(NomDeTrajet.create('peu importe')).id,
        onBack: () => {
            retours++;
        },
        onSuivi: () => {
            suivis++;
        },
    };
}

/** Attache l'écran et laisse le chargement du trajet s'achever. */
async function attacherLEcran(): Promise<HTMLElement> {
    const element = createTrajetEditorScreen(dependances());
    document.body.append(element);
    await laisserLesPromessesSAchever();
    return element;
}

function laisserLesPromessesSAchever(): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, 0);
    });
}

/** Les noms des pages, de haut en bas — l'ordre de lecture du document. */
function pagesAffichees(element: HTMLElement): string[] {
    return queryAll('.image-name', HTMLSpanElement, element).map((nom) => nom.textContent);
}

function monter(element: HTMLElement, nomDeLaPage: string): void {
    const bouton = queryAll('button', HTMLButtonElement, element).find(
        (candidat) => candidat.getAttribute('aria-label') === `Monter ${nomDeLaPage}`,
    );
    if (bouton === undefined) {
        throw new Error(`Aucun bouton « Monter ${nomDeLaPage} » dans l’écran.`);
    }
    bouton.click();
}

describe('trajet-editor-screen', () => {
    describe('Étant donné un trajet, quand j’attache l’écran', () => {
        it('alors il affiche son nom, ses pages en ordre de lecture et ses points', async () => {
            const element = await attacherLEcran();

            expect(element.querySelector('#trajet-title')?.textContent).toBe('Paris → Bordeaux');
            // Le document se lit de bas en haut : la dernière page du voyage
            // s'affiche en haut de la pile.
            expect(pagesAffichees(element)).toEqual(['p3.png', 'p2.png', 'p1.png']);
            expect(element.querySelectorAll('.point-row')).toHaveLength(1);
        });

        it('alors la carte est montée sur le conteneur que l’écran vient de créer', async () => {
            await attacherLEcran();

            expect(carteDesPoints.isMounted()).toBe(true);
            expect(carteDesPoints.numerosAffiches()).toEqual([1]);
        });
    });

    describe('Étant donné un écran attaché, quand je le détache', () => {
        it('alors la carte est démontée avec lui', async () => {
            const element = await attacherLEcran();

            element.remove();

            // Elle ne peut pas survivre à son conteneur, qui part avec l'écran.
            expect(carteDesPoints.isMounted()).toBe(false);
        });
    });

    describe('Étant donné un dépôt qui refuse d’écrire, quand je déplace une page', () => {
        it('alors l’échec est signalé à l’utilisateur', async () => {
            const element = await attacherLEcran();

            repository.refuserLaProchaineEcriture();
            monter(element, 'p1.png');
            await laisserLesPromessesSAchever();

            expect(echecs).toEqual(['Échec de le déplacement de la page : Stockage plein.']);
        });

        it('alors l’écran repart de ce qui est réellement stocké', async () => {
            const element = await attacherLEcran();

            repository.refuserLaProchaineEcriture();
            monter(element, 'p1.png');
            await laisserLesPromessesSAchever();
            // Le même geste, cette fois accepté : s'il part de la mémoire
            // modifiée par l'échec précédent, la page aura avancé deux fois.
            monter(element, 'p1.png');
            await laisserLesPromessesSAchever();

            expect(pagesAffichees(element)).toEqual(['p3.png', 'p1.png', 'p2.png']);
        });
    });

    describe('Étant donné un trajet supprimé entre-temps, quand j’ouvre l’écran', () => {
        it('alors il repart en arrière plutôt que d’afficher un écran vide', async () => {
            repository.viderLeDepot();

            await attacherLEcran();

            expect(retours).toBe(1);
        });
    });

    describe('Étant donné un chargement encore en cours, quand je détache l’écran', () => {
        it('alors rien ne s’affiche et la carte est rendue', async () => {
            repository.suspendreLaLecture();
            const element = createTrajetEditorScreen(dependances());
            document.body.append(element);

            element.remove();
            repository.terminerLaLecture();
            await laisserLesPromessesSAchever();

            expect(pagesAffichees(element)).toEqual([]);
            expect(carteDesPoints.isMounted()).toBe(false);
            expect(suivis).toBe(0);
        });
    });
});
