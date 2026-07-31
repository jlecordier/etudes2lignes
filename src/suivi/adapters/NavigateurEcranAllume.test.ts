import { describe, expect, it } from 'vitest';
import { FauxPremierPlan } from './fauxPremierPlan';
import { NavigateurEcranAllume } from './NavigateurEcranAllume';

// La plateforme de test n'offre aucun wake lock : c'est exactement le cas
// « best effort échoué » (iOS < 18.4, contexte non sécurisé) que le port tolère.
describe('NavigateurEcranAllume', () => {
    describe('Étant donné un appareil sans wake lock, quand je demande à garder l’écran allumé', () => {
        it('alors l’échec est avalé et le retour au premier plan est surveillé', async () => {
            const premierPlan = new FauxPremierPlan();
            const ecranAllume = new NavigateurEcranAllume({ premierPlan });

            await ecranAllume.maintenir();

            expect(premierPlan.abonnements()).toBe(1);
        });
    });

    describe('Étant donné un maintien demandé deux fois', () => {
        it('alors un seul abonnement au premier plan est ouvert', async () => {
            const premierPlan = new FauxPremierPlan();
            const ecranAllume = new NavigateurEcranAllume({ premierPlan });

            await ecranAllume.maintenir();
            await ecranAllume.maintenir();

            expect(premierPlan.abonnements()).toBe(1);
        });
    });

    describe('Étant donné un écran maintenu puis relâché', () => {
        it('alors plus rien ne surveille le premier plan', async () => {
            const premierPlan = new FauxPremierPlan();
            const ecranAllume = new NavigateurEcranAllume({ premierPlan });
            await ecranAllume.maintenir();

            await ecranAllume.relacher();

            expect(premierPlan.abonnements()).toBe(0);
        });
    });

    describe('Étant donné un écran relâché, quand la page revient au premier plan', () => {
        it('alors le réveil ne réveille plus personne', async () => {
            const premierPlan = new FauxPremierPlan();
            const ecranAllume = new NavigateurEcranAllume({ premierPlan });
            await ecranAllume.maintenir();
            await ecranAllume.relacher();

            premierPlan.revenirAuPremierPlan();

            expect(premierPlan.abonnements()).toBe(0);
        });
    });
});
