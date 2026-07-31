// @vitest-environment jsdom
import * as L from 'leaflet';
import { beforeEach, describe, expect, it } from 'vitest';
import { Coordonnee } from '../../trajets/domain/Coordonnee';
import { nouveauPointId, type PointId } from '../../trajets/domain/ids';
import type { PointAffiche } from '../ports/CarteDesPointsPort';
import { LeafletCarteDesPoints } from './LeafletCarteDesPoints';

const PARIS = Coordonnee.creer(48.8566, 2.3522);
const BORDEAUX = Coordonnee.creer(44.8378, -0.5792);

/**
 * Les cartes Leaflet créées depuis le début du fichier. L'adapter garde la
 * sienne pour lui — c'est très bien — donc le test l'observe par le seul point
 * d'accroche public de Leaflet.
 */
const cartesCreees: L.Map[] = [];
L.Map.addInitHook(function (this: L.Map) {
    cartesCreees.push(this);
});

interface Banc {
    carteDesPoints: LeafletCarteDesPoints;
    conteneur: HTMLElement;
    /** Les déplacements de marqueur rapportés par l'adapter. */
    deplacements: { id: PointId; coordonnee: Coordonnee }[];
    afficher: (points: readonly PointAffiche[]) => void;
    /** La carte Leaflet de l'adapter (créée à son premier usage). */
    carte: () => L.Map;
}

function banc(): Banc {
    const conteneur = document.createElement('div');
    conteneur.id = 'carte-de-test';
    // jsdom ne calcule aucune mise en page : sans ces mesures, Leaflet croit sa
    // carte de taille nulle et ne sait calculer aucun zoom.
    Object.defineProperty(conteneur, 'clientWidth', { value: 600 });
    Object.defineProperty(conteneur, 'clientHeight', { value: 600 });
    document.body.replaceChildren(conteneur);

    const carteDesPoints = new LeafletCarteDesPoints('carte-de-test');
    const deplacements: { id: PointId; coordonnee: Coordonnee }[] = [];
    return {
        carteDesPoints,
        conteneur,
        deplacements,
        afficher: (points) => {
            carteDesPoints.afficher(points, (id, coordonnee) => {
                deplacements.push({ id, coordonnee });
            });
        },
        carte: () => {
            const derniere = cartesCreees.at(-1);
            if (derniere === undefined) {
                throw new Error('Aucune carte Leaflet créée : l’adapter n’a pas été sollicité.');
            }
            return derniere;
        },
    };
}

function point(numero: number, coordonnee: Coordonnee): PointAffiche {
    return { id: nouveauPointId(), numero, coordonnee };
}

/** Un clic de l'utilisateur sur la carte, à la coordonnée voulue. */
function cliquerLaCarte(carte: L.Map, latitude: number, longitude: number): void {
    carte.fire('click', { latlng: L.latLng(latitude, longitude) });
}

function marqueurs(carte: L.Map): L.Marker[] {
    const trouves: L.Marker[] = [];
    carte.eachLayer((couche) => {
        if (couche instanceof L.Marker) {
            trouves.push(couche);
        }
    });
    return trouves;
}

beforeEach(() => {
    cartesCreees.length = 0;
});

describe('Carte des points de l’éditeur', () => {
    describe('Étant donné les points d’un trajet à afficher', () => {
        it('alors chacun a son marqueur, à sa coordonnée', () => {
            const { afficher, carte } = banc();

            afficher([point(1, PARIS), point(2, BORDEAUX)]);

            expect(marqueurs(carte()).map((marqueur) => marqueur.getLatLng().lat)).toEqual([
                PARIS.latitude,
                BORDEAUX.latitude,
            ]);
        });
    });

    describe('Étant donné un point supprimé du trajet', () => {
        it('alors son marqueur disparaît de la carte', () => {
            const { afficher, carte } = banc();
            const restant = point(1, PARIS);
            afficher([restant, point(2, BORDEAUX)]);

            afficher([restant]);

            expect(marqueurs(carte()).map((marqueur) => marqueur.getLatLng().lng)).toEqual([
                PARIS.longitude,
            ]);
        });
    });

    describe('Étant donné une carte que l’utilisateur a lui-même cadrée', () => {
        it('alors réafficher les mêmes points ne lui vole pas son zoom', () => {
            const { afficher, carte } = banc();
            const unPoint = point(1, PARIS);
            afficher([unPoint]);
            carte().setView([0, 0], 3, { animate: false });

            afficher([{ ...unPoint, coordonnee: BORDEAUX }]);

            expect(carte().getZoom()).toBe(3);
            expect([carte().getCenter().lat, carte().getCenter().lng]).toEqual([0, 0]);
        });
    });

    describe('Étant donné un point existant, quand j’arme le choix avec sa position', () => {
        it('alors la carte est centrée sur elle', async () => {
            const { carteDesPoints, afficher, carte } = banc();
            afficher([point(1, PARIS), point(2, BORDEAUX)]);

            const choix = carteDesPoints.choisirUneCoordonnee(BORDEAUX);

            expect(carte().getCenter().lat).toBeCloseTo(BORDEAUX.latitude, 6);
            expect(carte().getCenter().lng).toBeCloseTo(BORDEAUX.longitude, 6);
            expect(carte().getZoom()).toBe(12);
            carteDesPoints.annulerLeChoix();
            expect(await choix).toBeNull();
        });
    });

    describe('Étant donné un nouveau point à placer (aucune position de départ)', () => {
        it('alors le cadrage d’ensemble est conservé, et le clic est attendu', async () => {
            const { carteDesPoints, afficher, carte, conteneur } = banc();
            afficher([point(1, PARIS), point(2, BORDEAUX)]);
            const cadrage = { centre: carte().getCenter(), zoom: carte().getZoom() };

            const choix = carteDesPoints.choisirUneCoordonnee(null);

            expect(carte().getCenter()).toEqual(cadrage.centre);
            expect(carte().getZoom()).toBe(cadrage.zoom);
            expect(conteneur.classList.contains('attente-clic')).toBe(true);
            carteDesPoints.annulerLeChoix();
            expect(await choix).toBeNull();
        });
    });

    describe('Étant donné un choix armé, quand l’utilisateur clique la carte', () => {
        it('alors le choix rend la coordonnée cliquée et n’attend plus rien', async () => {
            const { carteDesPoints, afficher, carte, conteneur } = banc();
            afficher([]);

            const choix = carteDesPoints.choisirUneCoordonnee(null);
            cliquerLaCarte(carte(), 48.8566, 2.3522);

            const coordonnee = await choix;
            expect(coordonnee?.latitude).toBe(48.8566);
            expect(coordonnee?.longitude).toBe(2.3522);
            expect(conteneur.classList.contains('attente-clic')).toBe(false);
        });
    });

    describe('Étant donné un clic à un tour du monde de la France (Leaflet défile en boucle)', () => {
        it('alors la coordonnée rendue est ramenée dans les bornes du globe', async () => {
            const { carteDesPoints, afficher, carte } = banc();
            afficher([]);

            const choix = carteDesPoints.choisirUneCoordonnee(null);
            cliquerLaCarte(carte(), 48.8566, 2.3522 + 360);

            const coordonnee = await choix;
            expect(coordonnee?.longitude).toBeCloseTo(2.3522, 9);
        });
    });

    describe('Étant donné un choix armé, puis abandonné', () => {
        it('alors il rend null, et le clic qui arrive trop tard est perdu', async () => {
            const { carteDesPoints, afficher, carte, conteneur } = banc();
            afficher([]);
            const abandonne = carteDesPoints.choisirUneCoordonnee(null);

            carteDesPoints.annulerLeChoix();

            expect(await abandonne).toBeNull();
            expect(conteneur.classList.contains('attente-clic')).toBe(false);
            // Le clic tardif ne relance rien : le choix suivant reçoit le sien.
            cliquerLaCarte(carte(), 0, 0);
            const suivant = carteDesPoints.choisirUneCoordonnee(null);
            cliquerLaCarte(carte(), 44.8378, -0.5792);
            expect((await suivant)?.latitude).toBe(44.8378);
        });
    });

    describe('Étant donné un choix déjà armé, quand un second est armé par-dessus', () => {
        it('alors le premier est abandonné et le clic ne sert qu’au second', async () => {
            const { carteDesPoints, afficher, carte } = banc();
            afficher([]);

            const premier = carteDesPoints.choisirUneCoordonnee(null);
            const second = carteDesPoints.choisirUneCoordonnee(null);
            cliquerLaCarte(carte(), 48.8566, 2.3522);

            expect(await premier).toBeNull();
            expect((await second)?.latitude).toBe(48.8566);
        });
    });

    describe('Étant donné un choix abandonné alors qu’aucun n’était armé', () => {
        it('alors rien ne se passe : la carte reste utilisable', async () => {
            const { carteDesPoints, afficher, carte } = banc();
            afficher([]);

            carteDesPoints.annulerLeChoix();

            const choix = carteDesPoints.choisirUneCoordonnee(null);
            cliquerLaCarte(carte(), 44.8378, -0.5792);
            expect((await choix)?.longitude).toBe(-0.5792);
        });
    });

    describe('Étant donné un marqueur que l’utilisateur fait glisser', () => {
        it('alors le déplacement est rapporté avec la coordonnée d’arrivée', () => {
            const { afficher, carte, deplacements } = banc();
            const unPoint = point(1, PARIS);
            afficher([unPoint]);

            const marqueur = marqueurs(carte()).at(0);
            marqueur?.setLatLng([BORDEAUX.latitude, BORDEAUX.longitude]);
            marqueur?.fire('dragend');

            expect(deplacements.map(({ id, coordonnee }) => [id, coordonnee.longitude])).toEqual([
                [unPoint.id, BORDEAUX.longitude],
            ]);
        });
    });
});
