// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { query } from '../../shared/dom';
import { Coordonnee } from '../domain/Coordonnee';
import { newImageId, newPointId, type ImageId, type PointId } from '../domain/ids';
import { dragsOnStack, type DroppedPoint } from './dragPointOnStack';
import { ImageFrameElement } from './ImageFrame';
import { createPointMarker, PointMarkerElement } from './PointMarker';

/**
 * jsdom ne connaît ni la capture de pointeur, ni `PointerEvent`. La première est
 * neutralisée, le second reconstruit au strict nécessaire : un `MouseEvent` qui
 * porte en plus l'identifiant du pointeur.
 */
class FauxPointerEvent extends MouseEvent {
    readonly pointerId: number;

    constructor(type: string, clientY: number, pointerId = 1, button = 0) {
        super(type, { clientY, bubbles: true, button });
        this.pointerId = pointerId;
    }
}

/** Une pile de deux pages mesurées, et le repère posé sur celle du haut. */
interface Scene {
    pile: HTMLElement;
    pastille: HTMLElement;
    pointId: PointId;
    hautId: ImageId;
    basId: ImageId;
    deposes: DroppedPoint[];
}

/**
 * jsdom ne calcule aucune mise en page : les cadres sont posés à la main, sans
 * quoi `FractionVerticale.fromHeight` lèverait sur une hauteur nulle.
 *
 * La page du haut occupe [0, 1000], celle du bas [1100, 2100] — l'interstice de
 * 100 px entre les deux est délibéré : c'est lui qui met à l'épreuve « relâcher
 * hors de toute page garde la dernière position ».
 */
function cadre(imageId: ImageId, top: number, hauteur: number): ImageFrameElement {
    const element = new ImageFrameElement();
    element.imageId = imageId;
    const zone = document.createElement('div');
    zone.className = 'image-area';
    zone.getBoundingClientRect = () => new DOMRect(0, top, 800, hauteur);
    element.append(zone);
    return element;
}

function scene(): Scene {
    const pile = document.createElement('div');
    const hautId = newImageId();
    const basId = newImageId();
    const haut = cadre(hautId, 0, 1000);
    const bas = cadre(basId, 1100, 1000);
    pile.append(haut, bas);
    document.body.replaceChildren(pile);

    const pointId = newPointId();
    const repere = createPointMarker({
        pointId,
        number: 1,
        fraction: 0.5,
        coordonnee: Coordonnee.create(44.826, -0.556),
    });
    haut.append(repere);

    const deposes: DroppedPoint[] = [];
    dragsOnStack(pile).subscribe((depose) => deposes.push(depose));

    return {
        pile,
        pastille: query('.point-number', HTMLButtonElement, repere),
        pointId,
        hautId,
        basId,
        deposes,
    };
}

/** Rejoue un geste complet : appui sur la pastille, mouvements, relâchement. */
function glisser(scene: Scene, depart: number, ...etapes: number[]): void {
    scene.pastille.dispatchEvent(new FauxPointerEvent('pointerdown', depart));
    for (const y of etapes) {
        scene.pile.dispatchEvent(new FauxPointerEvent('pointermove', y));
    }
    scene.pile.dispatchEvent(new FauxPointerEvent('pointerup', etapes.at(-1) ?? depart));
}

/**
 * Un seul événement de pointeur, avec un identifiant explicite — pour
 * composer à la main un geste à plusieurs doigts, ou une annulation, que
 * `glisser` (toujours au doigt n° 1) ne sait pas rejouer.
 */
function evenementPointeur(cible: HTMLElement, type: string, y: number, pointerId: number): void {
    cible.dispatchEvent(new FauxPointerEvent(type, y, pointerId));
}

/** Les identifiants de pointeur pour lesquels la capture a été posée. */
let captures: number[];

beforeEach(() => {
    captures = [];
    // jsdom n'implémente pas la capture de pointeur ; l'enregistrement ici
    // remplace le no-op initial pour observer QUAND elle est posée, sans quoi
    // le geste n'aurait aucun moyen de le dire.
    Element.prototype.setPointerCapture = function setPointerCapture(pointerId: number) {
        captures.push(pointerId);
    };
    document.body.replaceChildren();
});

describe('Glisser un point sur la pile', () => {
    describe('Étant donné un maintien qui ne dépasse pas le seuil', () => {
        it('alors rien n’est déposé : c’était un clic', () => {
            const scene1 = scene();

            glisser(scene1, 500, 502);

            expect(scene1.deposes).toEqual([]);
        });

        it('alors la capture du pointeur n’est jamais posée', () => {
            const scene1 = scene();

            glisser(scene1, 500, 502);

            expect(captures).toEqual([]);
        });
    });

    describe('Étant donné un maintien qui atteint exactement le seuil', () => {
        it('alors c’est un glisser : le point est déposé', () => {
            const scene1 = scene();

            // 500 → 503 : un écart de 3 px pile, la limite de `SEUIL_DE_GLISSER`.
            glisser(scene1, 500, 503);

            expect(scene1.deposes).toHaveLength(1);
        });
    });

    describe('Étant donné un glisser franc à l’intérieur de la page', () => {
        it('alors le point est déposé à la fraction d’arrivée, sur la même image', () => {
            const scene1 = scene();

            glisser(scene1, 500, 520, 250);

            expect(scene1.deposes).toHaveLength(1);
            const depose = scene1.deposes[0];
            expect(depose?.pointId).toBe(scene1.pointId);
            expect(depose?.imageId).toBe(scene1.hautId);
            expect(depose?.fraction.value).toBeCloseTo(0.25, 6);
        });

        it('alors le repère a suivi le doigt, à sa nouvelle hauteur', () => {
            const scene1 = scene();

            glisser(scene1, 500, 520, 250);

            const repere = query('point-marker', PointMarkerElement, scene1.pile);
            expect(repere.style.top).toBe('25%');
        });

        it('alors la capture du pointeur est posée une seule fois, au franchissement du seuil', () => {
            const scene1 = scene();

            glisser(scene1, 500, 520, 250);

            expect(captures).toEqual([1]);
        });
    });

    describe('Étant donné un glisser qui passe sur la page voisine', () => {
        it('alors c’est l’identifiant de cette page-là qui est déposé', () => {
            const scene1 = scene();

            glisser(scene1, 500, 900, 1600);

            expect(scene1.deposes[0]?.imageId).toBe(scene1.basId);
            expect(scene1.deposes[0]?.fraction.value).toBeCloseTo(0.5, 6);
        });
    });

    describe('Étant donné un doigt relâché dans l’interstice entre deux pages', () => {
        it('alors la dernière position survolée est conservée', () => {
            const scene1 = scene();

            // 1600 est sur la page du bas ; 1050 ne l'est sur aucune.
            glisser(scene1, 500, 1600, 1050);

            expect(scene1.deposes[0]?.imageId).toBe(scene1.basId);
            expect(scene1.deposes[0]?.fraction.value).toBeCloseTo(0.5, 6);
        });
    });

    describe('Étant donné un second doigt posé pendant un glisser', () => {
        it('alors il ne démarre pas un second geste', () => {
            const scene1 = scene();

            scene1.pastille.dispatchEvent(new FauxPointerEvent('pointerdown', 500));
            scene1.pile.dispatchEvent(new FauxPointerEvent('pointermove', 300));
            scene1.pastille.dispatchEvent(new FauxPointerEvent('pointerdown', 800, 2));
            scene1.pile.dispatchEvent(new FauxPointerEvent('pointerup', 300));

            expect(scene1.deposes).toHaveLength(1);
        });
    });

    describe('Étant donné un second doigt qui bouge puis se lève pendant un glisser', () => {
        it('alors le premier geste l’ignore, et se conclut à la position que le premier doigt avait posée', () => {
            const scene1 = scene();

            scene1.pastille.dispatchEvent(new FauxPointerEvent('pointerdown', 500, 1));
            evenementPointeur(scene1.pile, 'pointermove', 520, 1);
            // Le second doigt bouge, puis se lève — sans jamais avoir saisi la
            // pastille. Ni l'un ni l'autre ne doit toucher au premier geste.
            evenementPointeur(scene1.pile, 'pointermove', 900, 2);
            evenementPointeur(scene1.pile, 'pointerup', 900, 2);
            evenementPointeur(scene1.pile, 'pointermove', 250, 1);
            evenementPointeur(scene1.pile, 'pointerup', 250, 1);

            expect(scene1.deposes).toHaveLength(1);
            expect(scene1.deposes[0]?.fraction.value).toBeCloseTo(0.25, 6);
        });
    });

    describe('Étant donné un glisser annulé par le système (pointercancel)', () => {
        it('alors le repère retourne à sa position d’origine, et rien n’est déposé', () => {
            const scene1 = scene();
            const repere = query('point-marker', PointMarkerElement, scene1.pile);
            const parentDorigine = repere.parentElement;

            scene1.pastille.dispatchEvent(new FauxPointerEvent('pointerdown', 500));
            evenementPointeur(scene1.pile, 'pointermove', 1600, 1);
            // La page voisine a bien été saisie : sans quoi l'annulation qui
            // suit ne prouverait rien, faute de parent à restaurer.
            expect(repere.parentElement).not.toBe(parentDorigine);

            evenementPointeur(scene1.pile, 'pointercancel', 1600, 1);

            expect(scene1.deposes).toEqual([]);
            expect(repere.parentElement).toBe(parentDorigine);
            expect(repere.style.top).toBe('50%');
        });

        it('alors le piège du clic n’a pas été armé : le clic suivant atteint la pastille', () => {
            const scene1 = scene();
            const clics: string[] = [];
            scene1.pastille.addEventListener('click', () => clics.push('pastille'));

            scene1.pastille.dispatchEvent(new FauxPointerEvent('pointerdown', 500));
            evenementPointeur(scene1.pile, 'pointermove', 520, 1);
            evenementPointeur(scene1.pile, 'pointercancel', 520, 1);
            scene1.pastille.dispatchEvent(new MouseEvent('click', { bubbles: true }));

            expect(clics).toEqual(['pastille']);
        });
    });

    describe('Étant donné un appui ailleurs que sur la pastille', () => {
        it('alors aucun glisser ne démarre', () => {
            const scene1 = scene();

            scene1.pile.dispatchEvent(new FauxPointerEvent('pointerdown', 500));
            scene1.pile.dispatchEvent(new FauxPointerEvent('pointermove', 250));
            scene1.pile.dispatchEvent(new FauxPointerEvent('pointerup', 250));

            expect(scene1.deposes).toEqual([]);
        });
    });

    describe('Étant donné un glisser achevé, quand le navigateur dispatche le clic qui suit', () => {
        it('alors ce clic n’atteint pas la pastille', () => {
            const scene1 = scene();
            const clics: string[] = [];
            scene1.pastille.addEventListener('click', () => clics.push('pastille'));

            glisser(scene1, 500, 520, 250);
            scene1.pastille.dispatchEvent(new MouseEvent('click', { bubbles: true }));

            expect(clics).toEqual([]);
        });

        it('alors le clic d’après, lui, passe : le piège n’est armé qu’une fois', () => {
            const scene1 = scene();
            const clics: string[] = [];
            scene1.pastille.addEventListener('click', () => clics.push('pastille'));

            glisser(scene1, 500, 520, 250);
            scene1.pastille.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            scene1.pastille.dispatchEvent(new MouseEvent('click', { bubbles: true }));

            expect(clics).toEqual(['pastille']);
        });
    });

    describe('Étant donné un glisser qui n’a produit aucun clic', () => {
        it('alors la pression suivante atteint quand même la pastille', () => {
            const scene1 = scene();
            const clics: string[] = [];
            scene1.pastille.addEventListener('click', () => clics.push('pastille'));

            glisser(scene1, 500, 520, 250);
            // Aucun clic synthétique ici : un doigt qui glisse puis se lève
            // n'en produit pas toujours un — c'est justement le cas que le
            // piège doit survivre jusqu'à la prochaine interaction.
            evenementPointeur(scene1.pile, 'pointerdown', 300, 1);
            scene1.pastille.dispatchEvent(new MouseEvent('click', { bubbles: true }));

            expect(clics).toEqual(['pastille']);
        });
    });

    describe('Étant donné un relâchement sous le seuil qui n’atteint pas la pile', () => {
        it('alors un second doigt peut quand même démarrer un glisser', () => {
            const scene1 = scene();

            // Un maintien sans jamais franchir le seuil, relâché en dehors de
            // la pile — sur `document.body`, qui n'est ni la pile ni l'un de
            // ses descendants : ce `pointerup` ne peut atteindre un écouteur
            // posé sur la pile elle-même. C'est exactement ce qui arrive
            // quand le doigt s'échappe de la pile à l'horizontale (la carte,
            // sur un grand écran) avant d'avoir bougé de 3 px.
            scene1.pastille.dispatchEvent(new FauxPointerEvent('pointerdown', 500, 1));
            document.body.dispatchEvent(new FauxPointerEvent('pointerup', 500, 1));

            // Un second doigt, d'un identifiant différent : si le premier
            // geste n'est jamais retombé, `exhaustMap` ignore ce nouvel appui
            // avant même de regarder à qui il appartient — aucun glisser n'en
            // ressortirait, quoi que ce doigt fasse ensuite.
            evenementPointeur(scene1.pastille, 'pointerdown', 500, 2);
            evenementPointeur(scene1.pile, 'pointermove', 520, 2);
            evenementPointeur(scene1.pile, 'pointermove', 250, 2);
            evenementPointeur(scene1.pile, 'pointerup', 250, 2);

            expect(scene1.deposes).toHaveLength(1);
        });
    });

    describe('Étant donné un glisser achevé, quand l’activation suivante vient du clavier', () => {
        it('alors le clic qu’elle produit atteint quand même la pastille', () => {
            const scene1 = scene();
            const clics: string[] = [];
            scene1.pastille.addEventListener('click', () => clics.push('pastille'));

            glisser(scene1, 500, 520, 250);
            // Une pastille activée au clavier (Tab puis Entrée) dispatche un
            // `keydown` puis le `click` qu'il produit — jamais de
            // `pointerdown` entre les deux, le clavier n'en émettant pas.
            scene1.pastille.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
            );
            scene1.pastille.dispatchEvent(new MouseEvent('click', { bubbles: true }));

            expect(clics).toEqual(['pastille']);
        });
    });

    describe('Étant donné un appui du bouton droit sur la pastille, suivi d’une dérive', () => {
        it('alors aucun glisser ne démarre', () => {
            const scene1 = scene();

            // Bouton 2 : le droit. Sans le garde, cette dérive de 400 px
            // déplacerait le point en plus d'ouvrir le menu contextuel
            // d'ajout que le `contextmenu` d'un clic droit ferait remonter.
            scene1.pastille.dispatchEvent(new FauxPointerEvent('pointerdown', 500, 1, 2));
            scene1.pile.dispatchEvent(new FauxPointerEvent('pointermove', 900, 1, 2));
            scene1.pile.dispatchEvent(new FauxPointerEvent('pointerup', 900, 1, 2));

            expect(scene1.deposes).toEqual([]);
        });
    });
});
