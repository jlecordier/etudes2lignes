import { describe, expect, it } from 'vitest';
import { FauxPremierPlan } from './fauxPremierPlan';
import {
    NavigateurEcranAllume,
    type FournisseurDeVerrouDEcran,
    type VerrouDEcran,
} from './NavigateurEcranAllume';

class FauxVerrou implements VerrouDEcran {
    released = false;

    release(): Promise<void> {
        this.released = true;
        return Promise.resolve();
    }
}

/** Le wake lock de la plateforme, à la main : lent quand le test le veut. */
class FauxFournisseurDeVerrou implements FournisseurDeVerrouDEcran {
    private readonly delivres: FauxVerrou[] = [];
    private acheverLaDemandeEnCours: (() => void) | null = null;
    private retenir = false;

    /** Les demandes n'aboutiront qu'à l'appel d'`acheverLaDemande`. */
    retenirLesDemandes(): void {
        this.retenir = true;
    }

    acheverLaDemande(): void {
        this.acheverLaDemandeEnCours?.();
        this.acheverLaDemandeEnCours = null;
    }

    async demander(): Promise<VerrouDEcran | null> {
        if (this.retenir) {
            await new Promise<void>((resoudre) => {
                this.acheverLaDemandeEnCours = resoudre;
            });
        }
        const verrou = new FauxVerrou();
        this.delivres.push(verrou);
        return verrou;
    }

    /** Combien de fois la plateforme a été sollicitée. */
    demandes(): number {
        return this.delivres.length;
    }

    /** Combien de verrous gardent encore l'écran allumé. */
    verrousTenus(): number {
        return this.delivres.filter((verrou) => !verrou.released).length;
    }

    /** Ce que fait le système quand la page passe en arrière-plan. */
    libererDepuisLeSysteme(): void {
        for (const verrou of this.delivres) {
            verrou.released = true;
        }
    }
}

async function laisserLesDemandesAboutir(): Promise<void> {
    for (let tour = 0; tour < 6; tour++) {
        await Promise.resolve();
    }
}

function banc(): {
    premierPlan: FauxPremierPlan;
    fournisseur: FauxFournisseurDeVerrou;
    ecranAllume: NavigateurEcranAllume;
} {
    const premierPlan = new FauxPremierPlan();
    const fournisseur = new FauxFournisseurDeVerrou();
    return {
        premierPlan,
        fournisseur,
        ecranAllume: new NavigateurEcranAllume({
            premierPlan,
            fournisseurDeVerrou: fournisseur,
        }),
    };
}

describe('NavigateurEcranAllume', () => {
    describe('Étant donné un appareil sans wake lock, quand je demande à garder l’écran allumé', () => {
        it('alors l’échec est avalé et le retour au premier plan est surveillé', async () => {
            // Aucun fournisseur injecté : la plateforme de test n'offre pas de
            // wake lock, exactement le cas « best effort échoué » que le port tolère.
            const premierPlan = new FauxPremierPlan();
            const ecranAllume = new NavigateurEcranAllume({ premierPlan });

            await ecranAllume.maintenir();

            expect(premierPlan.abonnements()).toBe(1);
        });
    });

    describe('Étant donné un maintien demandé deux fois', () => {
        it('alors un seul abonnement au premier plan est ouvert', async () => {
            const { premierPlan, ecranAllume } = banc();

            await ecranAllume.maintenir();
            await ecranAllume.maintenir();

            expect(premierPlan.abonnements()).toBe(1);
        });

        it('alors un seul verrou est tenu : le second maintien ne redemande rien', async () => {
            const { fournisseur, ecranAllume } = banc();

            await ecranAllume.maintenir();
            await ecranAllume.maintenir();

            expect(fournisseur.demandes()).toBe(1);
            expect(fournisseur.verrousTenus()).toBe(1);
        });
    });

    describe('Étant donné un écran maintenu puis relâché', () => {
        it('alors plus rien ne surveille le premier plan', async () => {
            const { premierPlan, ecranAllume } = banc();
            await ecranAllume.maintenir();

            await ecranAllume.relacher();

            expect(premierPlan.abonnements()).toBe(0);
        });

        it('alors le verrou est libéré : l’écran peut s’éteindre', async () => {
            const { fournisseur, ecranAllume } = banc();
            await ecranAllume.maintenir();

            await ecranAllume.relacher();

            expect(fournisseur.verrousTenus()).toBe(0);
        });
    });

    describe('Étant donné un écran relâché, quand la page revient au premier plan', () => {
        it('alors le réveil ne réveille plus personne', async () => {
            const { premierPlan, ecranAllume } = banc();
            await ecranAllume.maintenir();
            await ecranAllume.relacher();

            premierPlan.revenirAuPremierPlan();

            expect(premierPlan.abonnements()).toBe(0);
        });
    });

    describe('Étant donné un retour au premier plan, que trois événements annoncent à la fois', () => {
        it('alors un seul verrou est demandé, et un seul est tenu', async () => {
            const { premierPlan, fournisseur, ecranAllume } = banc();
            await ecranAllume.maintenir();
            // La page passe en arrière-plan : le système reprend le verrou.
            premierPlan.masquerLaPage();
            fournisseur.libererDepuisLeSysteme();

            // Un même retour déclenche visibilitychange, pageshow et focus.
            premierPlan.revenirAuPremierPlan();
            premierPlan.emettreUnReveil();
            premierPlan.emettreUnReveil();
            await laisserLesDemandesAboutir();

            // Une demande au maintien, une seule pour le retour — pas trois.
            expect(fournisseur.demandes()).toBe(2);
            expect(fournisseur.verrousTenus()).toBe(1);
        });

        it('alors relâcher libère bien le verrou repris, sans en laisser d’orphelin', async () => {
            const { premierPlan, fournisseur, ecranAllume } = banc();
            await ecranAllume.maintenir();
            premierPlan.masquerLaPage();
            fournisseur.libererDepuisLeSysteme();
            premierPlan.revenirAuPremierPlan();
            premierPlan.emettreUnReveil();
            await laisserLesDemandesAboutir();

            await ecranAllume.relacher();

            expect(fournisseur.verrousTenus()).toBe(0);
        });
    });

    describe('Étant donné un relâchement pendant qu’une demande de verrou est en vol', () => {
        it('alors relâcher attend ce verrou pour le libérer : aucun ne reste allumé', async () => {
            const { fournisseur, ecranAllume } = banc();
            fournisseur.retenirLesDemandes();
            // `maintenir` n'est pas attendu : c'est ainsi que l'écran de suivi
            // l'appelle, et la demande reste donc en vol.
            const maintien = ecranAllume.maintenir();
            await laisserLesDemandesAboutir();

            const liberation = ecranAllume.relacher();
            fournisseur.acheverLaDemande();
            await maintien;
            await liberation;

            expect(fournisseur.demandes()).toBe(1);
            expect(fournisseur.verrousTenus()).toBe(0);
        });
    });

    describe('Étant donné un réveil reçu alors que la page est encore masquée', () => {
        it('alors aucun verrou n’est demandé : l’API l’exigerait visible', async () => {
            const { premierPlan, fournisseur, ecranAllume } = banc();
            await ecranAllume.maintenir();
            premierPlan.masquerLaPage();
            fournisseur.libererDepuisLeSysteme();

            premierPlan.emettreUnReveil();
            await laisserLesDemandesAboutir();

            expect(fournisseur.demandes()).toBe(1);
        });
    });
});
