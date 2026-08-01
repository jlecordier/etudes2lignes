// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { BrowserForeground } from './BrowserForeground';

/** Force la visibilité de la page : jsdom ne la pilote pas. */
function withHiddenPage(verifier: () => void): void {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    try {
        verifier();
    } finally {
        Object.defineProperty(document, 'visibilityState', {
            value: 'visible',
            configurable: true,
        });
    }
}

describe('BrowserForeground', () => {
    describe('Étant donné un abonné au retour au premier plan', () => {
        it('alors chacun des trois réveils du navigateur le notifie', () => {
            const foreground = new BrowserForeground();
            let reveils = 0;
            const unsubscribe = foreground.onReturnToForeground(() => {
                reveils++;
            });

            document.dispatchEvent(new Event('visibilitychange'));
            window.dispatchEvent(new Event('pageshow'));
            window.dispatchEvent(new Event('focus'));

            expect(reveils).toBe(3);
            unsubscribe();
        });

        it('alors le désabonnement rendu coupe les notifications', () => {
            const foreground = new BrowserForeground();
            let reveils = 0;
            const unsubscribe = foreground.onReturnToForeground(() => {
                reveils++;
            });

            unsubscribe();
            document.dispatchEvent(new Event('visibilitychange'));
            window.dispatchEvent(new Event('pageshow'));
            window.dispatchEvent(new Event('focus'));

            expect(reveils).toBe(0);
        });
    });

    describe('Étant donné une page visible', () => {
        it('alors elle est au premier plan', () => {
            expect(new BrowserForeground().isInForeground()).toBe(true);
        });
    });

    describe('Étant donné une page masquée', () => {
        it('alors elle n’est pas au premier plan', () => {
            withHiddenPage(() => {
                expect(new BrowserForeground().isInForeground()).toBe(false);
            });
        });
    });
});
