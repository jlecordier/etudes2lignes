import { describe, expect, it } from 'vitest';
import { blockPinchZoom } from './pinchZoom';

/**
 * `gesturestart` et `gesturechange` sont des événements de WebKit, absents de
 * toute norme. Un `Event` nu suffit, puisque tout ce qu'on lui demande est de
 * pouvoir être annulé.
 */
function gesturestart(): Event {
    return new Event('gesturestart', { cancelable: true });
}

function gesturechange(): Event {
    return new Event('gesturechange', { cancelable: true });
}

describe('Refuser le pincement de page', () => {
    describe('Étant donné une cible surveillée', () => {
        it('alors un gesturestart y est annulé', () => {
            const cible = new EventTarget();
            blockPinchZoom(cible);

            const evenement = gesturestart();
            cible.dispatchEvent(evenement);

            expect(evenement.defaultPrevented).toBe(true);
        });
    });

    describe('Étant donné une cible surveillée', () => {
        it("alors un gesturechange n'y est pas annulé : annuler le début du geste suffit", () => {
            const cible = new EventTarget();
            blockPinchZoom(cible);

            const evenement = gesturechange();
            cible.dispatchEvent(evenement);

            expect(evenement.defaultPrevented).toBe(false);
        });
    });
});
