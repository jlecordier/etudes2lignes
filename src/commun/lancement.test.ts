import { describe, expect, it } from 'vitest';
import { creerLanceur } from './lancement';

/** Recueille les messages destinés à l'utilisateur, au lieu de les afficher. */
function bancDEssai(): { messages: string[]; lancer: ReturnType<typeof creerLanceur> } {
    const messages: string[] = [];
    return {
        messages,
        lancer: creerLanceur((message) => {
            messages.push(message);
        }),
    };
}

/** `lancer` ne rend pas de promesse : on laisse les microtâches se dérouler. */
async function laisserLesEchecsRemonter(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

describe('lancement', () => {
    describe('Étant donné un travail qui aboutit, quand je le lance', () => {
        it('alors rien n’est signalé à l’utilisateur', async () => {
            const { messages, lancer } = bancDEssai();

            lancer(Promise.resolve(), 'l’enregistrement du trajet');
            await laisserLesEchecsRemonter();

            expect(messages).toEqual([]);
        });
    });

    describe('Étant donné un travail qui échoue avec un message français, quand je le lance', () => {
        it('alors le signalement nomme l’action et reprend le message', async () => {
            const { messages, lancer } = bancDEssai();

            lancer(
                Promise.reject(new Error('Trajet illisible : une image est introuvable')),
                'l’ouverture du trajet',
            );
            await laisserLesEchecsRemonter();

            expect(messages).toEqual([
                'Échec de l’ouverture du trajet : Trajet illisible : une image est introuvable.',
            ]);
        });
    });

    describe('Étant donné un stockage plein, quand je lance un enregistrement', () => {
        it('alors le signalement explique comment faire de la place', async () => {
            const { messages, lancer } = bancDEssai();

            lancer(
                Promise.reject(new DOMException('trop gros', 'QuotaExceededError')),
                'l’ajout des pages',
            );
            await laisserLesEchecsRemonter();

            expect(messages).toEqual([
                'Échec de l’ajout des pages : l’espace de stockage de l’appareil est plein. ' +
                    'Supprimez un trajet ou des pages, puis réessayez.',
            ]);
        });
    });

    describe('Étant donné un rejet sans message lisible, quand je le lance', () => {
        it('alors le signalement nomme au moins l’action qui a échoué', async () => {
            const { messages, lancer } = bancDEssai();

            lancer(Promise.reject(new Error('')), 'la suppression du trajet');
            await laisserLesEchecsRemonter();

            expect(messages).toEqual(['Échec de la suppression du trajet.']);
        });
    });

    describe('Étant donné plusieurs travaux dont un seul échoue, quand je les lance', () => {
        it('alors seul l’échec est signalé, une seule fois', async () => {
            const { messages, lancer } = bancDEssai();

            lancer(Promise.resolve(), 'l’ouverture du trajet');
            lancer(Promise.reject(new Error('Base indisponible')), 'l’enregistrement du trajet');
            lancer(Promise.resolve(), 'la mise à jour de la carte');
            await laisserLesEchecsRemonter();

            expect(messages).toEqual(['Échec de l’enregistrement du trajet : Base indisponible.']);
        });
    });
});
