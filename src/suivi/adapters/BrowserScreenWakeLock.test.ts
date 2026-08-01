import { describe, expect, it } from 'vitest';
import { FakeForeground } from './fakeForeground';
import {
    BrowserScreenWakeLock,
    type WakeLockProvider,
    type WakeLockHandle,
} from './BrowserScreenWakeLock';

class FakeWakeLockHandle implements WakeLockHandle {
    released = false;

    release(): Promise<void> {
        this.released = true;
        return Promise.resolve();
    }
}

/** Le wake lock de la plateforme, à la main : lent quand le test le veut. */
class FakeWakeLockProvider implements WakeLockProvider {
    private readonly delivered: FakeWakeLockHandle[] = [];
    private completeActiveRequest: (() => void) | null = null;
    private retenir = false;

    /** Les demandes n'aboutiront qu'à l'appel d'`completeRequest`. */
    holdRequests(): void {
        this.retenir = true;
    }

    completeRequest(): void {
        this.completeActiveRequest?.();
        this.completeActiveRequest = null;
    }

    async demander(): Promise<WakeLockHandle | null> {
        if (this.retenir) {
            await new Promise<void>((resolve) => {
                this.completeActiveRequest = resolve;
            });
        }
        const lock = new FakeWakeLockHandle();
        this.delivered.push(lock);
        return lock;
    }

    /** Combien de fois la plateforme a été sollicitée. */
    requests(): number {
        return this.delivered.length;
    }

    /** Combien de verrous gardent encore l'écran allumé. */
    heldLocks(): number {
        return this.delivered.filter((lock) => !lock.released).length;
    }

    /** Ce que fait le système quand la page passe en arrière-plan. */
    releaseFromSystem(): void {
        for (const lock of this.delivered) {
            lock.released = true;
        }
    }
}

/** iOS avant 18.4, contexte non sécurisé : l'API répond, sans verrou à donner. */
class ProviderWithoutLock implements WakeLockProvider {
    requests = 0;

    demander(): Promise<WakeLockHandle | null> {
        this.requests++;
        return Promise.resolve(null);
    }
}

async function letRequestsSettle(): Promise<void> {
    for (let tour = 0; tour < 6; tour++) {
        await Promise.resolve();
    }
}

function testBed(): {
    foreground: FakeForeground;
    provider: FakeWakeLockProvider;
    screenWakeLock: BrowserScreenWakeLock;
} {
    const foreground = new FakeForeground();
    const provider = new FakeWakeLockProvider();
    return {
        foreground,
        provider,
        screenWakeLock: new BrowserScreenWakeLock({
            foreground,
            wakeLockProvider: provider,
        }),
    };
}

describe('BrowserScreenWakeLock', () => {
    describe('Étant donné un appareil sans wake lock, quand je demande à garder l’écran allumé', () => {
        it('alors l’échec est avalé et le retour au premier plan est surveillé', async () => {
            // Aucun fournisseur injecté : la plateforme de test n'offre pas de
            // wake lock, exactement le cas « best effort échoué » que le port tolère.
            const foreground = new FakeForeground();
            const screenWakeLock = new BrowserScreenWakeLock({ foreground });

            await screenWakeLock.acquire();

            expect(foreground.subscriptions()).toBe(1);
        });
    });

    describe('Étant donné une plateforme qui n’accorde aucun verrou', () => {
        it('alors rien n’est tenu et rien ne casse : l’appli marche sans verrou', async () => {
            const foreground = new FakeForeground();
            const provider = new ProviderWithoutLock();
            const screenWakeLock = new BrowserScreenWakeLock({
                foreground,
                wakeLockProvider: provider,
            });

            await screenWakeLock.acquire();
            await screenWakeLock.release();

            expect(provider.requests).toBe(1);
            expect(foreground.subscriptions()).toBe(0);
        });
    });

    describe('Étant donné un maintien demandé deux fois', () => {
        it('alors un seul abonnement au premier plan est ouvert', async () => {
            const { foreground, screenWakeLock } = testBed();

            await screenWakeLock.acquire();
            await screenWakeLock.acquire();

            expect(foreground.subscriptions()).toBe(1);
        });

        it('alors un seul verrou est tenu : le second maintien ne redemande rien', async () => {
            const { provider, screenWakeLock } = testBed();

            await screenWakeLock.acquire();
            await screenWakeLock.acquire();

            expect(provider.requests()).toBe(1);
            expect(provider.heldLocks()).toBe(1);
        });
    });

    describe('Étant donné un écran maintenu puis relâché', () => {
        it('alors plus rien ne surveille le premier plan', async () => {
            const { foreground, screenWakeLock } = testBed();
            await screenWakeLock.acquire();

            await screenWakeLock.release();

            expect(foreground.subscriptions()).toBe(0);
        });

        it('alors le verrou est libéré : l’écran peut s’éteindre', async () => {
            const { provider, screenWakeLock } = testBed();
            await screenWakeLock.acquire();

            await screenWakeLock.release();

            expect(provider.heldLocks()).toBe(0);
        });
    });

    describe('Étant donné un écran relâché, quand la page revient au premier plan', () => {
        it('alors le réveil ne réveille plus personne', async () => {
            const { foreground, screenWakeLock } = testBed();
            await screenWakeLock.acquire();
            await screenWakeLock.release();

            foreground.returnToForeground();

            expect(foreground.subscriptions()).toBe(0);
        });
    });

    describe('Étant donné un retour au premier plan, que trois événements annoncent à la fois', () => {
        it('alors un seul verrou est demandé, et un seul est tenu', async () => {
            const { foreground, provider, screenWakeLock } = testBed();
            await screenWakeLock.acquire();
            // La page passe en arrière-plan : le système reprend le verrou.
            foreground.hidePage();
            provider.releaseFromSystem();

            // Un même retour déclenche visibilitychange, pageshow et focus.
            foreground.returnToForeground();
            foreground.emitWakeup();
            foreground.emitWakeup();
            await letRequestsSettle();

            // Une demande au maintien, une seule pour le retour — pas trois.
            expect(provider.requests()).toBe(2);
            expect(provider.heldLocks()).toBe(1);
        });

        it('alors relâcher libère bien le verrou repris, sans en laisser d’orphelin', async () => {
            const { foreground, provider, screenWakeLock } = testBed();
            await screenWakeLock.acquire();
            foreground.hidePage();
            provider.releaseFromSystem();
            foreground.returnToForeground();
            foreground.emitWakeup();
            await letRequestsSettle();

            await screenWakeLock.release();

            expect(provider.heldLocks()).toBe(0);
        });
    });

    describe('Étant donné un relâchement pendant qu’une demande de verrou est en vol', () => {
        it('alors relâcher attend ce verrou pour le libérer : aucun ne reste allumé', async () => {
            const { provider, screenWakeLock } = testBed();
            provider.holdRequests();
            // `maintenir` n'est pas attendu : c'est ainsi que l'écran de suivi
            // l'appelle, et la demande reste donc en vol.
            const maintien = screenWakeLock.acquire();
            await letRequestsSettle();

            const liberation = screenWakeLock.release();
            provider.completeRequest();
            await maintien;
            await liberation;

            expect(provider.requests()).toBe(1);
            expect(provider.heldLocks()).toBe(0);
        });
    });

    describe('Étant donné un réveil reçu alors que la page est encore masquée', () => {
        it('alors aucun verrou n’est demandé : l’API l’exigerait visible', async () => {
            const { foreground, provider, screenWakeLock } = testBed();
            await screenWakeLock.acquire();
            foreground.hidePage();
            provider.releaseFromSystem();

            foreground.emitWakeup();
            await letRequestsSettle();

            expect(provider.requests()).toBe(1);
        });
    });
});
