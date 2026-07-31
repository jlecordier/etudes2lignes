// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { requete } from '../../commun/dom';
import { Coordonnee } from '../../trajets/domain/Coordonnee';
import { LeafletSelecteurDeCoordonnee } from './LeafletSelecteurDeCoordonnee';
import { CONSIGNE_DE_SAISIE } from './saisieDeCoordonnee';

const PARIS = Coordonnee.creer(48.8566, 2.3522);

/** Les consignes montrées à l'utilisateur pendant le test. */
const consignes: string[] = [];

/** L'écran de carte de index.html, réduit à ce dont l'adapter a besoin. */
function poserLEcranDeCarte(): void {
    document.body.innerHTML = `
        <section id="ecran-carte" hidden>
            <div id="conteneur-carte"></div>
            <input id="champ-latitude" type="number" step="any" />
            <input id="champ-longitude" type="number" step="any" />
            <button id="bouton-placer-manuel" type="button">Placer</button>
            <button id="bouton-annuler-carte" type="button">Annuler</button>
            <button id="bouton-valider-carte" type="button" disabled>Valider</button>
        </section>`;
    const conteneur = requete('#conteneur-carte', HTMLElement);
    // jsdom ne calcule aucune mise en page : sans ces mesures, Leaflet croit sa
    // carte de taille nulle.
    Object.defineProperty(conteneur, 'clientWidth', { value: 600 });
    Object.defineProperty(conteneur, 'clientHeight', { value: 600 });
}

function champ(selecteur: string): HTMLInputElement {
    return requete(selecteur, HTMLInputElement);
}

function bouton(selecteur: string): HTMLButtonElement {
    return requete(selecteur, HTMLButtonElement);
}

function ecranVisible(): boolean {
    return !requete('#ecran-carte', HTMLElement).hidden;
}

beforeEach(() => {
    consignes.length = 0;
    window.alert = (message?: string) => {
        consignes.push(message ?? '');
    };
    poserLEcranDeCarte();
});

describe('Carte plein écran de choix d’une coordonnée', () => {
    describe('Étant donné la carte ouverte et ses champs vides, quand on clique « Placer »', () => {
        it('alors une consigne utilisable s’affiche et rien n’est sélectionné', async () => {
            const selecteur = new LeafletSelecteurDeCoordonnee();
            const choix = selecteur.choisir(null, []);

            bouton('#bouton-placer-manuel').click();

            expect(consignes).toEqual([CONSIGNE_DE_SAISIE]);
            expect(bouton('#bouton-valider-carte').disabled).toBe(true);
            bouton('#bouton-annuler-carte').click();
            expect(await choix).toBeNull();
        });
    });

    describe('Étant donné une latitude hors du globe saisie à la main', () => {
        it('alors la même consigne s’affiche, sans message technique du domaine', async () => {
            const selecteur = new LeafletSelecteurDeCoordonnee();
            const choix = selecteur.choisir(null, []);
            champ('#champ-latitude').value = '200';
            champ('#champ-longitude').value = '2.3522';

            bouton('#bouton-placer-manuel').click();

            expect(consignes).toEqual([CONSIGNE_DE_SAISIE]);
            expect(bouton('#bouton-valider-carte').disabled).toBe(true);
            bouton('#bouton-annuler-carte').click();
            expect(await choix).toBeNull();
        });
    });

    describe('Étant donné une coordonnée valide saisie à la main, puis validée', () => {
        it('alors le choix rend cette coordonnée et l’écran se referme', async () => {
            const selecteur = new LeafletSelecteurDeCoordonnee();
            const choix = selecteur.choisir(null, []);
            champ('#champ-latitude').value = '48.8566';
            champ('#champ-longitude').value = '2.3522';

            bouton('#bouton-placer-manuel').click();
            expect(consignes).toEqual([]);
            expect(bouton('#bouton-valider-carte').disabled).toBe(false);
            bouton('#bouton-valider-carte').click();

            const coordonnee = await choix;
            expect(coordonnee?.latitude).toBe(48.8566);
            expect(coordonnee?.longitude).toBe(2.3522);
            expect(ecranVisible()).toBe(false);
        });
    });

    describe('Étant donné un point existant que l’on déplace (coordonnée initiale)', () => {
        it('alors la carte s’ouvre avec ce point déjà sélectionné', async () => {
            const selecteur = new LeafletSelecteurDeCoordonnee();

            const choix = selecteur.choisir(PARIS, []);

            expect(ecranVisible()).toBe(true);
            expect(champ('#champ-latitude').value).toBe('48.85660');
            expect(champ('#champ-longitude').value).toBe('2.35220');
            expect(bouton('#bouton-valider-carte').disabled).toBe(false);
            bouton('#bouton-annuler-carte').click();
            expect(await choix).toBeNull();
        });
    });

    describe('Étant donné une carte réouverte après un premier choix', () => {
        it('alors la sélection précédente est oubliée', async () => {
            const selecteur = new LeafletSelecteurDeCoordonnee();
            const premier = selecteur.choisir(PARIS, []);
            bouton('#bouton-annuler-carte').click();
            await premier;

            const second = selecteur.choisir(null, []);

            expect(champ('#champ-latitude').value).toBe('');
            expect(bouton('#bouton-valider-carte').disabled).toBe(true);
            bouton('#bouton-annuler-carte').click();
            expect(await second).toBeNull();
        });
    });
});
