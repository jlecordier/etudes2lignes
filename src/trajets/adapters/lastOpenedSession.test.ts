import { describe, expect, it } from 'vitest';
import { newTrajetId } from '../domain/ids';
import { createLastOpenedSession, type KeyValueStorage } from './lastOpenedSession';

/** Stockage en mémoire, écrit à la main. */
class InMemoryStorage implements KeyValueStorage {
    private readonly values = new Map<string, string>();

    read(key: string): string | null {
        return this.values.get(key) ?? null;
    }

    write(key: string, value: string): void {
        this.values.set(key, value);
    }

    clear(key: string): void {
        this.values.delete(key);
    }

    /** Ce que le stockage contient réellement, pour poser un état de départ. */
    poser(key: string, value: string): void {
        this.values.set(key, value);
    }

    contient(key: string): boolean {
        return this.values.has(key);
    }
}

/** Stockage indisponible : navigation privée d'anciens Safari, stockage refusé. */
class FailingStorage implements KeyValueStorage {
    read(): string | null {
        throw new Error('Stockage indisponible');
    }

    write(): void {
        throw new Error('Stockage indisponible');
    }

    clear(): void {
        throw new Error('Stockage indisponible');
    }
}

describe('derniereSessionOuverte', () => {
    describe('Étant donné un trajet mémorisé, quand je restaure', () => {
        it('alors je retrouve son identifiant', () => {
            const storage = new InMemoryStorage();
            const session = createLastOpenedSession(storage);
            const identifier = newTrajetId();

            session.remember(identifier);

            expect(session.restore()).toBe(identifier);
        });

        it('alors il est rangé sous la clé attendue, que les versions précédentes ont déjà écrite', () => {
            const storage = new InMemoryStorage();
            const identifier = newTrajetId();

            createLastOpenedSession(storage).remember(identifier);

            // La clé fait partie du contrat avec le passé : en changer perdrait
            // la session des utilisateurs déjà installés.
            expect(storage.read('dernierTrajetId')).toBe(identifier);
        });
    });

    describe('Étant donné aucune mémoire, quand je restaure', () => {
        it('alors je n’obtiens rien', () => {
            const session = createLastOpenedSession(new InMemoryStorage());

            expect(session.restore()).toBeNull();
        });
    });

    describe('Étant donné un trajet mémorisé puis oublié, quand je restaure', () => {
        it('alors je n’obtiens rien, et la clé a disparu du stockage', () => {
            const storage = new InMemoryStorage();
            const session = createLastOpenedSession(storage);
            session.remember(newTrajetId());

            session.forget();

            expect(session.restore()).toBeNull();
            expect(storage.contient('dernierTrajetId')).toBe(false);
        });
    });

    describe('Étant donné un stockage trafiqué, quand je restaure', () => {
        it.each([
            ['un texte quelconque', 'le-dernier'],
            ['une chaîne vide', ''],
            ['du JSON', '{"id":"abc"}'],
        ])('alors %s est refusé au lieu d’être pris pour un identifiant', (_case, value) => {
            const storage = new InMemoryStorage();
            storage.poser('dernierTrajetId', value);
            const session = createLastOpenedSession(storage);

            expect(session.restore()).toBeNull();
        });
    });

    describe('Étant donné un stockage indisponible, quand je m’en sers', () => {
        it('alors se souvenir échoue en silence : l’application démarre quand même', () => {
            const session = createLastOpenedSession(new FailingStorage());

            expect(() => {
                session.remember(newTrajetId());
            }).not.toThrow();
            expect(() => {
                session.forget();
            }).not.toThrow();
            expect(session.restore()).toBeNull();
        });
    });
});
