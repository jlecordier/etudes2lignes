// @vitest-environment jsdom
import * as L from 'leaflet';
import { beforeEach, describe, expect, it } from 'vitest';
import { Subject } from 'rxjs';
import { Coordonnee } from '../../trajets/domain/Coordonnee';
import { newPointId, type PointId } from '../../trajets/domain/ids';
import type { DisplayedPoint, DisplayedPosition } from '../ports/CarteDesPointsPort';
import { LeafletCarteDesPoints } from './LeafletCarteDesPoints';

const PARIS = Coordonnee.create(48.8566, 2.3522);
const BORDEAUX = Coordonnee.create(44.8378, -0.5792);

/**
 * Les cartes Leaflet créées depuis le début du fichier. L'adapter garde la
 * sienne pour lui — c'est très bien — donc le test l'observe par le seul point
 * d'accroche public de Leaflet.
 */
const createdCartes: L.Map[] = [];
L.Map.addInitHook(function (this: L.Map) {
    createdCartes.push(this);
});

interface TestBed {
    carteDesPoints: LeafletCarteDesPoints;
    container: HTMLElement;
    /** Les déplacements de marqueur rapportés par l'adapter. */
    moves: { id: PointId; coordonnee: Coordonnee }[];
    /** Les points désignés d'un clic sur leur marqueur. */
    shows: PointId[];
    show: (points: readonly DisplayedPoint[]) => void;
    /** La carte Leaflet de l'adapter (créée à son premier usage). */
    carte: () => L.Map;
}

/** Un conteneur mesuré : jsdom ne calcule aucune mise en page, et Leaflet
 * croirait sa carte de taille nulle, incapable de calculer un zoom. */
function conteneurMesure(): HTMLElement {
    const container = document.createElement('div');
    // `configurable` : un test change ces mesures en cours de route, pour voir
    // la carte se remesurer.
    Object.defineProperty(container, 'clientWidth', { value: 600, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 600, configurable: true });
    return container;
}

function testBed(): TestBed {
    const container = conteneurMesure();
    document.body.replaceChildren(container);

    const carteDesPoints = new LeafletCarteDesPoints();
    carteDesPoints.mount(container);
    const moves: { id: PointId; coordonnee: Coordonnee }[] = [];
    const shows: PointId[] = [];
    return {
        carteDesPoints,
        container,
        moves,
        shows,
        show: (points) => {
            carteDesPoints.show(
                points,
                (id, coordonnee) => {
                    moves.push({ id, coordonnee });
                },
                (id) => {
                    shows.push(id);
                },
            );
        },
        carte: () => {
            const last = createdCartes.at(-1);
            if (last === undefined) {
                throw new Error("Aucune carte Leaflet créée : l'adapter n'a pas été sollicité.");
            }
            return last;
        },
    };
}

function point(number: number, coordonnee: Coordonnee): DisplayedPoint {
    return { id: newPointId(), number, coordonnee };
}

/** Un clic de l'utilisateur sur la carte, à la coordonnée voulue. */
function clickCarte(carte: L.Map, latitude: number, longitude: number): void {
    carte.fire('click', { latlng: L.latLng(latitude, longitude) });
}

function markers(carte: L.Map): L.Marker[] {
    const trouves: L.Marker[] = [];
    carte.eachLayer((couche) => {
        if (couche instanceof L.Marker) {
            trouves.push(couche);
        }
    });
    return trouves;
}

function circles(carte: L.Map): L.Circle[] {
    const trouves: L.Circle[] = [];
    carte.eachLayer((couche) => {
        if (couche instanceof L.Circle) {
            trouves.push(couche);
        }
    });
    return trouves;
}

/**
 * Les marqueurs de « ma position », reconnus à la classe que la feuille de style
 * vise — c'est-à-dire au seul signe qui compte pour l'utilisateur.
 */
function positionMarkers(carte: L.Map): L.Marker[] {
    return markers(carte).filter(
        (marker) => marker.getElement()?.classList.contains('carte-position-marker') === true,
    );
}

beforeEach(() => {
    createdCartes.length = 0;
});

describe("Carte des points de l'éditeur", () => {
    describe("Étant donné les points d'un trajet à afficher", () => {
        it('alors chacun a son marqueur, à sa coordonnée', () => {
            const { show, carte } = testBed();

            show([point(1, PARIS), point(2, BORDEAUX)]);

            expect(markers(carte()).map((marker) => marker.getLatLng().lat)).toEqual([
                PARIS.latitude,
                BORDEAUX.latitude,
            ]);
        });
    });

    describe('Étant donné un point supprimé du trajet', () => {
        it('alors son marqueur disparaît de la carte', () => {
            const { show, carte } = testBed();
            const restant = point(1, PARIS);
            show([restant, point(2, BORDEAUX)]);

            show([restant]);

            expect(markers(carte()).map((marker) => marker.getLatLng().lng)).toEqual([
                PARIS.longitude,
            ]);
        });
    });

    describe("Étant donné une carte que l'utilisateur a lui-même cadrée", () => {
        it('alors réafficher les mêmes points ne lui vole pas son zoom', () => {
            const { show, carte } = testBed();
            const aPoint = point(1, PARIS);
            show([aPoint]);
            carte().setView([0, 0], 3, { animate: false });

            show([{ ...aPoint, coordonnee: BORDEAUX }]);

            expect(carte().getZoom()).toBe(3);
            expect([carte().getCenter().lat, carte().getCenter().lng]).toEqual([0, 0]);
        });
    });

    describe("Étant donné un point existant, quand j'arme le choix avec sa position", () => {
        it('alors la carte est centrée sur elle', async () => {
            const { carteDesPoints, show, carte } = testBed();
            show([point(1, PARIS), point(2, BORDEAUX)]);

            const choice = carteDesPoints.chooseCoordonnee(BORDEAUX);

            expect(carte().getCenter().lat).toBeCloseTo(BORDEAUX.latitude, 6);
            expect(carte().getCenter().lng).toBeCloseTo(BORDEAUX.longitude, 6);
            expect(carte().getZoom()).toBe(12);
            carteDesPoints.cancelChoice();
            expect(await choice).toBeNull();
        });
    });

    describe('Étant donné un nouveau point à placer (aucune position de départ)', () => {
        it("alors le cadrage d'ensemble est conservé, et le clic est attendu", async () => {
            const { carteDesPoints, show, carte, container } = testBed();
            show([point(1, PARIS), point(2, BORDEAUX)]);
            const cadrage = { center: carte().getCenter(), zoom: carte().getZoom() };

            const choice = carteDesPoints.chooseCoordonnee(null);

            expect(carte().getCenter()).toEqual(cadrage.center);
            expect(carte().getZoom()).toBe(cadrage.zoom);
            expect(container.classList.contains('awaiting-click')).toBe(true);
            carteDesPoints.cancelChoice();
            expect(await choice).toBeNull();
        });
    });

    describe("Étant donné un choix armé, quand l'utilisateur clique la carte", () => {
        it("alors le choix rend la coordonnée cliquée et n'attend plus rien", async () => {
            const { carteDesPoints, show, carte, container } = testBed();
            show([]);

            const choice = carteDesPoints.chooseCoordonnee(null);
            clickCarte(carte(), 48.8566, 2.3522);

            const coordonnee = await choice;
            expect(coordonnee?.latitude).toBe(48.8566);
            expect(coordonnee?.longitude).toBe(2.3522);
            expect(container.classList.contains('awaiting-click')).toBe(false);
        });
    });

    describe('Étant donné un clic à un tour du monde de la France (Leaflet défile en boucle)', () => {
        it('alors la coordonnée rendue est ramenée dans les bornes du globe', async () => {
            const { carteDesPoints, show, carte } = testBed();
            show([]);

            const choice = carteDesPoints.chooseCoordonnee(null);
            clickCarte(carte(), 48.8566, 2.3522 + 360);

            const coordonnee = await choice;
            expect(coordonnee?.longitude).toBeCloseTo(2.3522, 9);
        });
    });

    describe('Étant donné un choix armé, puis abandonné', () => {
        it('alors il rend null, et le clic qui arrive trop tard est perdu', async () => {
            const { carteDesPoints, show, carte, container } = testBed();
            show([]);
            const abandonne = carteDesPoints.chooseCoordonnee(null);

            carteDesPoints.cancelChoice();

            expect(await abandonne).toBeNull();
            expect(container.classList.contains('awaiting-click')).toBe(false);
            // Le clic tardif ne relance rien : le choix suivant reçoit le sien.
            clickCarte(carte(), 0, 0);
            const next = carteDesPoints.chooseCoordonnee(null);
            clickCarte(carte(), 44.8378, -0.5792);
            expect((await next)?.latitude).toBe(44.8378);
        });
    });

    describe('Étant donné un choix déjà armé, quand un second est armé par-dessus', () => {
        it("alors le premier est abandonné et le clic ne sert qu'au second", async () => {
            const { carteDesPoints, show, carte } = testBed();
            show([]);

            const first = carteDesPoints.chooseCoordonnee(null);
            const second = carteDesPoints.chooseCoordonnee(null);
            clickCarte(carte(), 48.8566, 2.3522);

            expect(await first).toBeNull();
            expect((await second)?.latitude).toBe(48.8566);
        });
    });

    describe("Étant donné un choix abandonné alors qu'aucun n'était armé", () => {
        it('alors rien ne se passe : la carte reste utilisable', async () => {
            const { carteDesPoints, show, carte } = testBed();
            show([]);

            carteDesPoints.cancelChoice();

            const choice = carteDesPoints.chooseCoordonnee(null);
            clickCarte(carte(), 44.8378, -0.5792);
            expect((await choice)?.longitude).toBe(-0.5792);
        });
    });

    describe("Étant donné une carte démontée, quand l'écran la remonte ailleurs", () => {
        it("alors elle repart dans le nouveau conteneur, et lâche l'ancien", () => {
            const { carteDesPoints, container, show, carte } = testBed();
            show([point(1, PARIS)]);

            carte().setView([0, 0], 3, { animate: false });
            carteDesPoints.unmount();
            const nouveau = conteneurMesure();
            document.body.replaceChildren(nouveau);
            carteDesPoints.mount(nouveau);
            show([point(1, BORDEAUX)]);

            // La régression que ce cycle de vie existe pour éviter : l'écran
            // d'édition étant recréé à chaque ouverture, une carte mémorisée
            // resterait accrochée au conteneur de la visite précédente.
            expect(container.querySelector('.leaflet-map-pane')).toBeNull();
            expect(nouveau.querySelector('.leaflet-map-pane')).not.toBeNull();
            expect(markers(carte()).map((marker) => marker.getLatLng().lat)).toEqual([
                BORDEAUX.latitude,
            ]);
            // La carte neuve se recadre sur les points : le souvenir de ce qui
            // était affiché est parti avec l'ancienne, sans quoi elle garderait
            // le cadrage du conteneur précédent.
            expect(carte().getCenter().lat).toBeCloseTo(BORDEAUX.latitude, 4);
        });

        it("alors se servir d'une carte démontée est refusé, en le disant", () => {
            const { carteDesPoints, show } = testBed();

            carteDesPoints.unmount();

            expect(() => {
                show([point(1, PARIS)]);
            }).toThrow("n'est pas montée");
        });
    });

    describe('Étant donné un conteneur qui a changé de taille sans que la fenêtre bouge', () => {
        it('quand on demande une remesure, alors la carte prend la nouvelle taille', () => {
            const { carteDesPoints, container, carte, show } = testBed();
            show([point(1, PARIS)]);
            expect(carte().getSize().x).toBe(600);

            // La carte passe par-dessus le schéma : son conteneur double de large.
            Object.defineProperty(container, 'clientWidth', { value: 1200, configurable: true });
            carteDesPoints.resized();

            expect(carte().getSize().x).toBe(1200);
        });
    });

    describe("Étant donné un marqueur que l'utilisateur désigne d'un clic", () => {
        it("alors le point est rapporté, et rien n'a bougé", () => {
            const { show, carte, moves, shows } = testBed();
            const premier = point(1, PARIS);
            show([premier, point(2, BORDEAUX)]);

            markers(carte()).at(0)?.fire('click');

            expect(shows).toEqual([premier.id]);
            expect(moves).toEqual([]);
        });
    });

    describe("Étant donné un marqueur que l'utilisateur fait glisser", () => {
        it("alors le déplacement est rapporté avec la coordonnée d'arrivée", () => {
            const { show, carte, moves } = testBed();
            const aPoint = point(1, PARIS);
            show([aPoint]);

            const marker = markers(carte()).at(0);
            marker?.setLatLng([BORDEAUX.latitude, BORDEAUX.longitude]);
            marker?.fire('dragend');

            expect(moves.map(({ id, coordonnee }) => [id, coordonnee.longitude])).toEqual([
                [aPoint.id, BORDEAUX.longitude],
            ]);
        });
    });

    describe('Étant donné une position connue poussée dans le flux', () => {
        it('alors un marqueur la montre, sans voler le cadrage', () => {
            const { carteDesPoints, show, carte } = testBed();
            show([point(1, PARIS)]);
            const cadrage = { center: carte().getCenter(), zoom: carte().getZoom() };
            const positions$ = new Subject<DisplayedPosition>();
            carteDesPoints.showPosition(positions$);

            positions$.next({ kind: 'connue', coordonnee: BORDEAUX });

            expect(positionMarkers(carte()).map((marker) => marker.getLatLng().lat)).toEqual([
                BORDEAUX.latitude,
            ]);
            expect(carte().getCenter()).toEqual(cadrage.center);
            expect(carte().getZoom()).toBe(cadrage.zoom);
        });
    });

    describe('Étant donné une position trop imprécise pour caler la page', () => {
        it("alors elle est montrée quand même, cerclée de l'incertitude mesurée", () => {
            const { carteDesPoints, show, carte } = testBed();
            show([]);
            const positions$ = new Subject<DisplayedPosition>();
            carteDesPoints.showPosition(positions$);

            positions$.next({
                kind: 'approximative',
                coordonnee: BORDEAUX,
                imprecisionMetres: 8_000,
                message: 'Position approximative (± 8 km).',
            });

            expect(positionMarkers(carte())).toHaveLength(1);
            expect(circles(carte()).map((cercle) => cercle.getRadius())).toEqual([8_000]);
        });
    });

    describe('Étant donné une position devenue inconnue', () => {
        it("alors le marqueur et son cercle s'effacent tous les deux", () => {
            const { carteDesPoints, show, carte } = testBed();
            show([]);
            const positions$ = new Subject<DisplayedPosition>();
            carteDesPoints.showPosition(positions$);
            positions$.next({
                kind: 'approximative',
                coordonnee: BORDEAUX,
                imprecisionMetres: 8_000,
                message: 'Position approximative (± 8 km).',
            });

            positions$.next({ kind: 'inconnue', message: 'Signal GPS perdu.' });

            expect(positionMarkers(carte())).toEqual([]);
            expect(circles(carte())).toEqual([]);
        });
    });

    describe('Étant donné une position déjà connue, quand les points changent', () => {
        it('alors le cadrage recalculé englobe les deux', () => {
            const { carteDesPoints, carte } = testBed();
            const positions$ = new Subject<DisplayedPosition>();
            carteDesPoints.showPosition(positions$);
            positions$.next({ kind: 'connue', coordonnee: BORDEAUX });

            carteDesPoints.show(
                [point(1, PARIS)],
                () => undefined,
                () => undefined,
            );

            const vue = carte().getBounds();
            expect(vue.contains(L.latLng(PARIS.latitude, PARIS.longitude))).toBe(true);
            expect(vue.contains(L.latLng(BORDEAUX.latitude, BORDEAUX.longitude))).toBe(true);
        });
    });

    describe("Étant donné une carte qu'on démonte", () => {
        it("alors elle n'écoute plus la position : plus personne n'observe le flux", () => {
            const { carteDesPoints } = testBed();
            const positions$ = new Subject<DisplayedPosition>();
            carteDesPoints.showPosition(positions$);
            expect(positions$.observed).toBe(true);

            carteDesPoints.unmount();

            expect(positions$.observed).toBe(false);
        });
    });

    describe("Étant donné un point que l'écran demande de montrer sur la carte", () => {
        it("alors la carte se cale dessus, au zoom d'un point unique", () => {
            const { carteDesPoints, show, carte } = testBed();
            show([point(1, PARIS), point(2, BORDEAUX)]);

            carteDesPoints.centerOn(BORDEAUX);

            expect(carte().getCenter().lat).toBeCloseTo(BORDEAUX.latitude, 6);
            expect(carte().getCenter().lng).toBeCloseTo(BORDEAUX.longitude, 6);
            expect(carte().getZoom()).toBe(12);
        });

        it('alors le demander à une carte démontée est refusé, en le disant', () => {
            const { carteDesPoints } = testBed();

            carteDesPoints.unmount();

            expect(() => {
                carteDesPoints.centerOn(PARIS);
            }).toThrow("n'est pas montée");
        });
    });
});
