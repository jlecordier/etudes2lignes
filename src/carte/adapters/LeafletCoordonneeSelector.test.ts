// @vitest-environment jsdom
import * as L from 'leaflet';
import { beforeEach, describe, expect, it } from 'vitest';
import { BehaviorSubject, EMPTY, Subject } from 'rxjs';
import { query } from '../../shared/dom';
import { Coordonnee } from '../../trajets/domain/Coordonnee';
import type { DisplayedPosition } from '../ports/CarteDesPointsPort';
import { LeafletCoordonneeSelector } from './LeafletCoordonneeSelector';
import { INPUT_HINT } from './saisieDeCoordonnee';

const PARIS = Coordonnee.create(48.8566, 2.3522);
const BORDEAUX = Coordonnee.create(44.8378, -0.5792);

/** Les consignes montrées à l'utilisateur pendant le test. */
const consignes: string[] = [];

/** Les cartes Leaflet créées depuis le début du fichier. */
const createdCartes: L.Map[] = [];
L.Map.addInitHook(function (this: L.Map) {
    createdCartes.push(this);
});

function carteCourante(): L.Map {
    const last = createdCartes.at(-1);
    if (last === undefined) {
        throw new Error("Aucune carte Leaflet créée : l'adapter n'a pas été sollicité.");
    }
    return last;
}

function positionMarkers(carte: L.Map): L.Marker[] {
    const trouves: L.Marker[] = [];
    carte.eachLayer((couche) => {
        if (
            couche instanceof L.Marker &&
            couche.getElement()?.classList.contains('carte-position-marker') === true
        ) {
            trouves.push(couche);
        }
    });
    return trouves;
}

/** Les cercles d'incertitude posés sur la carte : un fix grossier en porte un. */
function positionCircles(carte: L.Map): L.Circle[] {
    const trouves: L.Circle[] = [];
    carte.eachLayer((couche) => {
        if (couche instanceof L.Circle) {
            trouves.push(couche);
        }
    });
    return trouves;
}

/** L'écran de carte de index.html, réduit à ce dont l'adapter a besoin. */
function mountCarteScreenDom(): void {
    document.body.innerHTML = `
        <section id="screen-carte" hidden>
            <div id="carte-container"></div>
            <p id="carte-position-status" hidden></p>
            <input id="latitude-input" type="number" step="any" />
            <input id="longitude-input" type="number" step="any" />
            <button id="manual-place-button" type="button">Placer</button>
            <button id="carte-position-button" type="button" disabled>Ma position</button>
            <button id="cancel-carte-button" type="button">Annuler</button>
            <button id="confirm-carte-button" type="button" disabled>Valider</button>
        </section>`;
    const container = query('#carte-container', HTMLElement);
    // jsdom ne calcule aucune mise en page : sans ces mesures, Leaflet croit sa
    // carte de taille nulle.
    Object.defineProperty(container, 'clientWidth', { value: 600 });
    Object.defineProperty(container, 'clientHeight', { value: 600 });
}

function input(selector: string): HTMLInputElement {
    return query(selector, HTMLInputElement);
}

function button(selector: string): HTMLButtonElement {
    return query(selector, HTMLButtonElement);
}

function screenIsVisible(): boolean {
    return !query('#screen-carte', HTMLElement).hidden;
}

beforeEach(() => {
    consignes.length = 0;
    window.alert = (message?: string) => {
        consignes.push(message ?? '');
    };
    mountCarteScreenDom();
});

describe("Carte plein écran de choix d'une coordonnée", () => {
    describe('Étant donné la carte ouverte et ses champs vides, quand on clique « Placer »', () => {
        it("alors une consigne utilisable s'affiche et rien n'est sélectionné", async () => {
            const selector = new LeafletCoordonneeSelector();
            const choice = selector.choose(null, [], EMPTY);

            button('#manual-place-button').click();

            expect(consignes).toEqual([INPUT_HINT]);
            expect(button('#confirm-carte-button').disabled).toBe(true);
            button('#cancel-carte-button').click();
            expect(await choice).toBeNull();
        });
    });

    describe('Étant donné une latitude hors du globe saisie à la main', () => {
        it("alors la même consigne s'affiche, sans message technique du domaine", async () => {
            const selector = new LeafletCoordonneeSelector();
            const choice = selector.choose(null, [], EMPTY);
            input('#latitude-input').value = '200';
            input('#longitude-input').value = '2.3522';

            button('#manual-place-button').click();

            expect(consignes).toEqual([INPUT_HINT]);
            expect(button('#confirm-carte-button').disabled).toBe(true);
            button('#cancel-carte-button').click();
            expect(await choice).toBeNull();
        });
    });

    describe('Étant donné une coordonnée valide saisie à la main, puis validée', () => {
        it("alors le choix rend cette coordonnée et l'écran se referme", async () => {
            const selector = new LeafletCoordonneeSelector();
            const choice = selector.choose(null, [], EMPTY);
            input('#latitude-input').value = '48.8566';
            input('#longitude-input').value = '2.3522';

            button('#manual-place-button').click();
            expect(consignes).toEqual([]);
            expect(button('#confirm-carte-button').disabled).toBe(false);
            button('#confirm-carte-button').click();

            const coordonnee = await choice;
            expect(coordonnee?.latitude).toBe(48.8566);
            expect(coordonnee?.longitude).toBe(2.3522);
            expect(screenIsVisible()).toBe(false);
        });
    });

    describe("Étant donné un point existant que l'on déplace (coordonnée initiale)", () => {
        it("alors la carte s'ouvre avec ce point déjà sélectionné", async () => {
            const selector = new LeafletCoordonneeSelector();

            const choice = selector.choose(PARIS, [], EMPTY);

            expect(screenIsVisible()).toBe(true);
            expect(input('#latitude-input').value).toBe('48.85660');
            expect(input('#longitude-input').value).toBe('2.35220');
            expect(button('#confirm-carte-button').disabled).toBe(false);
            button('#cancel-carte-button').click();
            expect(await choice).toBeNull();
        });
    });

    describe('Étant donné une carte réouverte après un premier choix', () => {
        it('alors la sélection précédente est oubliée', async () => {
            const selector = new LeafletCoordonneeSelector();
            const first = selector.choose(PARIS, [], EMPTY);
            button('#cancel-carte-button').click();
            await first;

            const second = selector.choose(null, [], EMPTY);

            expect(input('#latitude-input').value).toBe('');
            expect(button('#confirm-carte-button').disabled).toBe(true);
            button('#cancel-carte-button').click();
            expect(await second).toBeNull();
        });
    });

    describe("Étant donné une position connue avant l'ouverture", () => {
        it("alors elle est montrée, et le cadrage d'ouverture l'englobe", async () => {
            const selector = new LeafletCoordonneeSelector();
            const positions$ = new BehaviorSubject<DisplayedPosition>({
                kind: 'connue',
                coordonnee: BORDEAUX,
            });

            const choice = selector.choose(null, [], positions$);

            expect(
                positionMarkers(carteCourante()).map((marker) => marker.getLatLng().lat),
            ).toEqual([BORDEAUX.latitude]);
            expect(carteCourante().getCenter().lat).toBeCloseTo(BORDEAUX.latitude, 4);
            button('#cancel-carte-button').click();
            expect(await choice).toBeNull();
        });
    });

    describe('Étant donné une position inconnue', () => {
        it('alors aucun marqueur, mais la phrase qui dit pourquoi', async () => {
            const selector = new LeafletCoordonneeSelector();
            const positions$ = new BehaviorSubject<DisplayedPosition>({
                kind: 'inconnue',
                message: 'Accès à la position refusé.',
            });

            const choice = selector.choose(null, [], positions$);

            expect(positionMarkers(carteCourante())).toEqual([]);
            expect(query('#carte-position-status', HTMLParagraphElement).textContent).toBe(
                'Accès à la position refusé.',
            );
            expect(button('#carte-position-button').disabled).toBe(true);
            button('#cancel-carte-button').click();
            expect(await choice).toBeNull();
        });
    });

    describe('Étant donné une position trop imprécise pour caler la page', () => {
        it("alors elle est montrée quand même, cerclée de l'incertitude mesurée", async () => {
            const selector = new LeafletCoordonneeSelector();
            const positions$ = new BehaviorSubject<DisplayedPosition>({
                kind: 'approximative',
                coordonnee: BORDEAUX,
                imprecisionMetres: 8_000,
                message: 'Position approximative (± 8 km) — trop imprécise pour caler la page.',
            });

            const choice = selector.choose(null, [], positions$);

            expect(
                positionMarkers(carteCourante()).map((marker) => marker.getLatLng().lat),
            ).toEqual([BORDEAUX.latitude]);
            expect(positionCircles(carteCourante()).map((cercle) => cercle.getRadius())).toEqual([
                8_000,
            ]);
            // La phrase dit l'approximation, et le bouton reste **actif** : une
            // position à ± 8 km ne cale aucune page, mais on peut aller la voir.
            expect(query('#carte-position-status', HTMLParagraphElement).textContent).toBe(
                'Position approximative (± 8 km) — trop imprécise pour caler la page.',
            );
            expect(button('#carte-position-button').disabled).toBe(false);
            button('#cancel-carte-button').click();
            expect(await choice).toBeNull();
        });
    });

    describe('Étant donné une position connue, quand on demande « Ma position »', () => {
        it("alors la carte vient dessus, au zoom d'un point unique", async () => {
            const selector = new LeafletCoordonneeSelector();
            const positions$ = new BehaviorSubject<DisplayedPosition>({
                kind: 'connue',
                coordonnee: PARIS,
            });
            const choice = selector.choose(null, [], positions$);
            carteCourante().setView([0, 0], 3, { animate: false });

            button('#carte-position-button').click();

            expect(carteCourante().getCenter().lat).toBeCloseTo(PARIS.latitude, 4);
            expect(carteCourante().getZoom()).toBe(12);
            button('#cancel-carte-button').click();
            expect(await choice).toBeNull();
        });
    });

    describe('Étant donné un choix terminé', () => {
        it("alors la carte n'écoute plus la position et ne la montre plus", async () => {
            const selector = new LeafletCoordonneeSelector();
            const positions$ = new Subject<DisplayedPosition>();
            const choice = selector.choose(null, [], positions$);
            positions$.next({ kind: 'connue', coordonnee: PARIS });
            expect(positions$.observed).toBe(true);

            button('#cancel-carte-button').click();
            await choice;

            expect(positions$.observed).toBe(false);
            expect(positionMarkers(carteCourante())).toEqual([]);
        });
    });
});
