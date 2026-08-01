import { describe, expect, it } from 'vitest';
import { createQueue } from './queue';

/** Un travail dont le test décide du moment où il s'achève. */
function heldTask(
    log: string[],
    name: string,
): {
    task: () => Promise<void>;
    complete: () => void;
} {
    let release = (): void => undefined;
    const pending = new Promise<void>((resolve) => {
        release = resolve;
    });
    return {
        task: async () => {
            log.push(`début ${name}`);
            await pending;
            log.push(`fin ${name}`);
        },
        complete: () => {
            release();
        },
    };
}

async function flushMicrotasks(): Promise<void> {
    for (let turn = 0; turn < 4; turn++) {
        await Promise.resolve();
    }
}

describe('file d’attente', () => {
    describe('Étant donné deux travaux mis en file coup sur coup, quand le premier n’est pas fini', () => {
        it('alors le second n’a pas commencé', async () => {
            const log: string[] = [];
            const enqueue = createQueue();
            const first = heldTask(log, 'premier');
            const second = heldTask(log, 'second');

            void enqueue(first.task);
            void enqueue(second.task);
            await flushMicrotasks();

            expect(log).toEqual(['début premier']);
        });

        it('alors le second s’exécute une fois le premier achevé, dans l’ordre d’arrivée', async () => {
            const log: string[] = [];
            const enqueue = createQueue();
            const first = heldTask(log, 'premier');
            const second = heldTask(log, 'second');

            const firstDone = enqueue(first.task);
            const secondDone = enqueue(second.task);
            first.complete();
            second.complete();
            await firstDone;
            await secondDone;

            expect(log).toEqual(['début premier', 'fin premier', 'début second', 'fin second']);
        });
    });

    describe('Étant donné un travail qui échoue, quand je le mets en file', () => {
        it('alors son appelant reçoit l’échec', async () => {
            const enqueue = createQueue();

            await expect(
                enqueue(() => Promise.reject(new Error('Stockage plein'))),
            ).rejects.toThrow('Stockage plein');
        });

        it('alors les travaux suivants s’exécutent quand même', async () => {
            const log: string[] = [];
            const enqueue = createQueue();

            const failure = enqueue(() => Promise.reject(new Error('Stockage plein')));
            const next = enqueue(async () => {
                log.push('le geste suivant a bien eu lieu');
                await Promise.resolve();
            });

            await expect(failure).rejects.toThrow('Stockage plein');
            await next;
            expect(log).toEqual(['le geste suivant a bien eu lieu']);
        });
    });

    describe('Étant donné trois travaux immédiats, quand je les mets en file', () => {
        it('alors ils s’achèvent dans leur ordre d’arrivée', async () => {
            const log: string[] = [];
            const enqueue = createQueue();

            const tasks = ['a', 'b', 'c'].map((name) =>
                enqueue(async () => {
                    await Promise.resolve();
                    log.push(name);
                }),
            );
            await Promise.all(tasks);

            expect(log).toEqual(['a', 'b', 'c']);
        });
    });
});
