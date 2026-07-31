// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { NavigateurPremierPlan } from './NavigateurPremierPlan';

/** Force la visibilité de la page : jsdom ne la pilote pas. */
function avecPageMasquee(verifier: () => void): void {
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

describe('NavigateurPremierPlan', () => {
    describe('Étant donné un abonné au retour au premier plan', () => {
        it('alors chacun des trois réveils du navigateur le notifie', () => {
            const premierPlan = new NavigateurPremierPlan();
            let reveils = 0;
            const seDesabonner = premierPlan.surRetourAuPremierPlan(() => {
                reveils++;
            });

            document.dispatchEvent(new Event('visibilitychange'));
            window.dispatchEvent(new Event('pageshow'));
            window.dispatchEvent(new Event('focus'));

            expect(reveils).toBe(3);
            seDesabonner();
        });

        it('alors le désabonnement rendu coupe les notifications', () => {
            const premierPlan = new NavigateurPremierPlan();
            let reveils = 0;
            const seDesabonner = premierPlan.surRetourAuPremierPlan(() => {
                reveils++;
            });

            seDesabonner();
            document.dispatchEvent(new Event('visibilitychange'));
            window.dispatchEvent(new Event('pageshow'));
            window.dispatchEvent(new Event('focus'));

            expect(reveils).toBe(0);
        });
    });

    describe('Étant donné une page visible', () => {
        it('alors elle est au premier plan', () => {
            expect(new NavigateurPremierPlan().estAuPremierPlan()).toBe(true);
        });
    });

    describe('Étant donné une page masquée', () => {
        it('alors elle n’est pas au premier plan', () => {
            avecPageMasquee(() => {
                expect(new NavigateurPremierPlan().estAuPremierPlan()).toBe(false);
            });
        });
    });
});
