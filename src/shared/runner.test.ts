import { describe, expect, it } from 'vitest';
import { createRunner } from './runner';

/** Recueille les messages destinés à l'utilisateur, au lieu de les afficher. */
function testBed(): { messages: string[]; run: ReturnType<typeof createRunner> } {
    const messages: string[] = [];
    return {
        messages,
        run: createRunner((message) => {
            messages.push(message);
        }),
    };
}

/** `run` ne rend pas de promesse : on laisse les microtâches se dérouler. */
async function flushMicrotasks(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

describe('lancement', () => {
    describe('Étant donné un travail qui aboutit, quand je le lance', () => {
        it("alors rien n'est signalé à l'utilisateur", async () => {
            const { messages, run } = testBed();

            run(Promise.resolve(), "l'enregistrement du trajet");
            await flushMicrotasks();

            expect(messages).toEqual([]);
        });
    });

    describe('Étant donné un travail qui échoue avec un message français, quand je le lance', () => {
        it("alors le signalement nomme l'action et reprend le message", async () => {
            const { messages, run } = testBed();

            run(
                Promise.reject(new Error('Trajet illisible : une image est introuvable')),
                "l'ouverture du trajet",
            );
            await flushMicrotasks();

            expect(messages).toEqual([
                "Échec de l'ouverture du trajet : Trajet illisible : une image est introuvable.",
            ]);
        });
    });

    describe('Étant donné un stockage plein, quand je lance un enregistrement', () => {
        it('alors le signalement explique comment faire de la place', async () => {
            const { messages, run } = testBed();

            run(
                Promise.reject(new DOMException('trop gros', 'QuotaExceededError')),
                "l'ajout des pages",
            );
            await flushMicrotasks();

            expect(messages).toEqual([
                "Échec de l'ajout des pages : l'espace de stockage de l'appareil est plein. " +
                    'Supprimez un trajet ou des pages, puis réessayez.',
            ]);
        });
    });

    describe('Étant donné un message qui se termine déjà par un point', () => {
        it("alors il n'en reçoit pas un second — le cas de tous les messages du dépôt", async () => {
            const { messages, run } = testBed();

            run(
                Promise.reject(new Error('Trajet illisible : le champ « largeur » est invalide.')),
                "l'ouverture du trajet",
            );
            await flushMicrotasks();

            expect(messages).toEqual([
                "Échec de l'ouverture du trajet : Trajet illisible : le champ « largeur » est invalide.",
            ]);
        });
    });

    describe("Étant donné une panne du navigateur qui n'est pas un débordement de quota", () => {
        it("alors on ne lui fait pas dire que l'espace de stockage est plein", async () => {
            const { messages, run } = testBed();

            run(
                Promise.reject(new DOMException('magasin absent', 'NotFoundError')),
                "l'ouverture du trajet",
            );
            await flushMicrotasks();

            expect(messages).toEqual(["Échec de l'ouverture du trajet : magasin absent."]);
        });
    });

    describe('Étant donné un rejet sans message lisible, quand je le lance', () => {
        it("alors le signalement nomme au moins l'action qui a échoué", async () => {
            const { messages, run } = testBed();

            run(Promise.reject(new Error('')), 'la suppression du trajet');
            await flushMicrotasks();

            expect(messages).toEqual(['Échec de la suppression du trajet.']);
        });
    });

    describe('Étant donné plusieurs travaux dont un seul échoue, quand je les lance', () => {
        it("alors seul l'échec est signalé, une seule fois", async () => {
            const { messages, run } = testBed();

            run(Promise.resolve(), "l'ouverture du trajet");
            run(Promise.reject(new Error('Base indisponible')), "l'enregistrement du trajet");
            run(Promise.resolve(), 'la mise à jour de la carte');
            await flushMicrotasks();

            expect(messages).toEqual(["Échec de l'enregistrement du trajet : Base indisponible."]);
        });
    });
});
