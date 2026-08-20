// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { blockPinchZoom } from './pinchZoom';

/**
 * `gesturestart` est un événement de WebKit, absent de toute norme et de jsdom :
 * un `Event` nu suffit, puisque tout ce qu'on lui demande est de pouvoir être
 * annulé.
 */
function gesturestart(): Event {
    return new Event('gesturestart', { cancelable: true });
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

    describe("Étant donné une cible qu'on n'a pas surveillée", () => {
        it("alors son gesturestart n'est pas annulé : la surveillance ne fuit pas d'une cible à l'autre", () => {
            const surveillee = new EventTarget();
            const autre = new EventTarget();
            blockPinchZoom(surveillee);

            const evenement = gesturestart();
            autre.dispatchEvent(evenement);

            expect(evenement.defaultPrevented).toBe(false);
        });
    });
});
