// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { query } from '../../shared/dom';
import { Coordonnee } from '../../trajets/domain/Coordonnee';
import { LeafletCoordonneeSelector } from './LeafletCoordonneeSelector';
import { INPUT_HINT } from './saisieDeCoordonnee';

const PARIS = Coordonnee.create(48.8566, 2.3522);

/** Les consignes montrées à l'utilisateur pendant le test. */
const consignes: string[] = [];

/** L'écran de carte de index.html, réduit à ce dont l'adapter a besoin. */
function mountCarteScreenDom(): void {
    document.body.innerHTML = `
        <section id="screen-carte" hidden>
            <div id="carte-container"></div>
            <input id="latitude-input" type="number" step="any" />
            <input id="longitude-input" type="number" step="any" />
            <button id="manual-place-button" type="button">Placer</button>
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

describe('Carte plein écran de choix d’une coordonnée', () => {
    describe('Étant donné la carte ouverte et ses champs vides, quand on clique « Placer »', () => {
        it('alors une consigne utilisable s’affiche et rien n’est sélectionné', async () => {
            const selector = new LeafletCoordonneeSelector();
            const choice = selector.choose(null, []);

            button('#manual-place-button').click();

            expect(consignes).toEqual([INPUT_HINT]);
            expect(button('#confirm-carte-button').disabled).toBe(true);
            button('#cancel-carte-button').click();
            expect(await choice).toBeNull();
        });
    });

    describe('Étant donné une latitude hors du globe saisie à la main', () => {
        it('alors la même consigne s’affiche, sans message technique du domaine', async () => {
            const selector = new LeafletCoordonneeSelector();
            const choice = selector.choose(null, []);
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
        it('alors le choix rend cette coordonnée et l’écran se referme', async () => {
            const selector = new LeafletCoordonneeSelector();
            const choice = selector.choose(null, []);
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

    describe('Étant donné un point existant que l’on déplace (coordonnée initiale)', () => {
        it('alors la carte s’ouvre avec ce point déjà sélectionné', async () => {
            const selector = new LeafletCoordonneeSelector();

            const choice = selector.choose(PARIS, []);

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
            const first = selector.choose(PARIS, []);
            button('#cancel-carte-button').click();
            await first;

            const second = selector.choose(null, []);

            expect(input('#latitude-input').value).toBe('');
            expect(button('#confirm-carte-button').disabled).toBe(true);
            button('#cancel-carte-button').click();
            expect(await second).toBeNull();
        });
    });
});
