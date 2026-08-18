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

/** Les trois événements par lesquels un navigateur annonce un réveil. */
function emitEveryWakeup(): void {
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pageshow'));
    window.dispatchEvent(new Event('focus'));
}

/** Compte les réveils reçus pendant l'abonnement, qui est refermé ensuite. */
function countWakeups(foreground: BrowserForeground, pendant: () => void): number {
    let reveils = 0;
    const subscription = foreground.returnToForeground$.subscribe(() => {
        reveils++;
    });
    try {
        pendant();
    } finally {
        subscription.unsubscribe();
    }
    return reveils;
}

describe('BrowserForeground', () => {
    describe('Étant donné un abonné au retour au premier plan', () => {
        it('alors chacun des trois réveils du navigateur le notifie', () => {
            const foreground = new BrowserForeground();

            const reveils = countWakeups(foreground, emitEveryWakeup);

            expect(reveils).toBe(3);
        });

        it('alors le désabonnement coupe les notifications', () => {
            const foreground = new BrowserForeground();
            let reveils = 0;
            const subscription = foreground.returnToForeground$.subscribe(() => {
                reveils++;
            });

            subscription.unsubscribe();
            emitEveryWakeup();

            expect(reveils).toBe(0);
        });
    });

    describe('Étant donné une page encore masquée, quand un réveil arrive', () => {
        it("alors il n'est pas transmis : ce n'est pas un retour au premier plan", () => {
            const foreground = new BrowserForeground();

            const reveils = countWakeups(foreground, () => {
                withHiddenPage(emitEveryWakeup);
            });

            // Le filtre tient ici plutôt que chez chaque abonné : c'est la même
            // question que celle des trois événements — « ce réveil est-il vrai ? ».
            expect(reveils).toBe(0);
        });
    });

    describe("Étant donné personne d'abonné", () => {
        it("alors rien n'écoute le navigateur : le flux est froid", () => {
            const foreground = new BrowserForeground();
            let reveils = 0;

            emitEveryWakeup();
            const subscription = foreground.returnToForeground$.subscribe(() => {
                reveils++;
            });
            subscription.unsubscribe();

            // Les réveils émis avant l'abonnement ne sont pas rejoués : un
            // abonné ne se réveille que pour ce qui arrive pendant sa vie.
            expect(reveils).toBe(0);
        });
    });
});
