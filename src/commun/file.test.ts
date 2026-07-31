import { describe, expect, it } from 'vitest';
import { creerFileDAttente } from './file';

/** Un travail dont le test décide du moment où il s'achève. */
function travailRetenu(
    journal: string[],
    nom: string,
): {
    travail: () => Promise<void>;
    achever: () => void;
} {
    let libere = (): void => undefined;
    const attente = new Promise<void>((resoudre) => {
        libere = resoudre;
    });
    return {
        travail: async () => {
            journal.push(`début ${nom}`);
            await attente;
            journal.push(`fin ${nom}`);
        },
        achever: () => {
            libere();
        },
    };
}

async function laisserTournerLesMicrotaches(): Promise<void> {
    for (let tour = 0; tour < 4; tour++) {
        await Promise.resolve();
    }
}

describe('file d’attente', () => {
    describe('Étant donné deux travaux mis en file coup sur coup, quand le premier n’est pas fini', () => {
        it('alors le second n’a pas commencé', async () => {
            const journal: string[] = [];
            const enFile = creerFileDAttente();
            const premier = travailRetenu(journal, 'premier');
            const second = travailRetenu(journal, 'second');

            void enFile(premier.travail);
            void enFile(second.travail);
            await laisserTournerLesMicrotaches();

            expect(journal).toEqual(['début premier']);
        });

        it('alors le second s’exécute une fois le premier achevé, dans l’ordre d’arrivée', async () => {
            const journal: string[] = [];
            const enFile = creerFileDAttente();
            const premier = travailRetenu(journal, 'premier');
            const second = travailRetenu(journal, 'second');

            const attentePremier = enFile(premier.travail);
            const attenteSecond = enFile(second.travail);
            premier.achever();
            second.achever();
            await attentePremier;
            await attenteSecond;

            expect(journal).toEqual(['début premier', 'fin premier', 'début second', 'fin second']);
        });
    });

    describe('Étant donné un travail qui échoue, quand je le mets en file', () => {
        it('alors son appelant reçoit l’échec', async () => {
            const enFile = creerFileDAttente();

            await expect(enFile(() => Promise.reject(new Error('Stockage plein')))).rejects.toThrow(
                'Stockage plein',
            );
        });

        it('alors les travaux suivants s’exécutent quand même', async () => {
            const journal: string[] = [];
            const enFile = creerFileDAttente();

            const echec = enFile(() => Promise.reject(new Error('Stockage plein')));
            const suivant = enFile(async () => {
                journal.push('le geste suivant a bien eu lieu');
                await Promise.resolve();
            });

            await expect(echec).rejects.toThrow('Stockage plein');
            await suivant;
            expect(journal).toEqual(['le geste suivant a bien eu lieu']);
        });
    });

    describe('Étant donné trois travaux immédiats, quand je les mets en file', () => {
        it('alors ils s’achèvent dans leur ordre d’arrivée', async () => {
            const journal: string[] = [];
            const enFile = creerFileDAttente();

            const travaux = ['a', 'b', 'c'].map((nom) =>
                enFile(async () => {
                    await Promise.resolve();
                    journal.push(nom);
                }),
            );
            await Promise.all(travaux);

            expect(journal).toEqual(['a', 'b', 'c']);
        });
    });
});
