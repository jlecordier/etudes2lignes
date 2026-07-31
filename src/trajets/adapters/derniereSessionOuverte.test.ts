import { describe, expect, it } from 'vitest';
import { nouveauTrajetId } from '../domain/ids';
import { creerDerniereSessionOuverte, type StockageDeSession } from './derniereSessionOuverte';

/** Stockage en mémoire, écrit à la main. */
class StockageEnMemoire implements StockageDeSession {
    private readonly valeurs = new Map<string, string>();

    lire(cle: string): string | null {
        return this.valeurs.get(cle) ?? null;
    }

    ecrire(cle: string, valeur: string): void {
        this.valeurs.set(cle, valeur);
    }

    effacer(cle: string): void {
        this.valeurs.delete(cle);
    }

    /** Ce que le stockage contient réellement, pour poser un état de départ. */
    poser(cle: string, valeur: string): void {
        this.valeurs.set(cle, valeur);
    }

    contient(cle: string): boolean {
        return this.valeurs.has(cle);
    }
}

/** Stockage indisponible : navigation privée d'anciens Safari, stockage refusé. */
class StockageQuiRefuse implements StockageDeSession {
    lire(): string | null {
        throw new Error('Stockage indisponible');
    }

    ecrire(): void {
        throw new Error('Stockage indisponible');
    }

    effacer(): void {
        throw new Error('Stockage indisponible');
    }
}

describe('derniereSessionOuverte', () => {
    describe('Étant donné un trajet mémorisé, quand je restaure', () => {
        it('alors je retrouve son identifiant', () => {
            const stockage = new StockageEnMemoire();
            const session = creerDerniereSessionOuverte(stockage);
            const identifiant = nouveauTrajetId();

            session.memoriser(identifiant);

            expect(session.restaurer()).toBe(identifiant);
        });

        it('alors il est rangé sous la clé attendue, que les versions précédentes ont déjà écrite', () => {
            const stockage = new StockageEnMemoire();
            const identifiant = nouveauTrajetId();

            creerDerniereSessionOuverte(stockage).memoriser(identifiant);

            // La clé fait partie du contrat avec le passé : en changer perdrait
            // la session des utilisateurs déjà installés.
            expect(stockage.lire('dernierTrajetId')).toBe(identifiant);
        });
    });

    describe('Étant donné aucune mémoire, quand je restaure', () => {
        it('alors je n’obtiens rien', () => {
            const session = creerDerniereSessionOuverte(new StockageEnMemoire());

            expect(session.restaurer()).toBeNull();
        });
    });

    describe('Étant donné un trajet mémorisé puis oublié, quand je restaure', () => {
        it('alors je n’obtiens rien, et la clé a disparu du stockage', () => {
            const stockage = new StockageEnMemoire();
            const session = creerDerniereSessionOuverte(stockage);
            session.memoriser(nouveauTrajetId());

            session.oublier();

            expect(session.restaurer()).toBeNull();
            expect(stockage.contient('dernierTrajetId')).toBe(false);
        });
    });

    describe('Étant donné un stockage trafiqué, quand je restaure', () => {
        it.each([
            ['un texte quelconque', 'le-dernier'],
            ['une chaîne vide', ''],
            ['du JSON', '{"id":"abc"}'],
        ])('alors %s est refusé au lieu d’être pris pour un identifiant', (_cas, valeur) => {
            const stockage = new StockageEnMemoire();
            stockage.poser('dernierTrajetId', valeur);
            const session = creerDerniereSessionOuverte(stockage);

            expect(session.restaurer()).toBeNull();
        });
    });

    describe('Étant donné un stockage indisponible, quand je m’en sers', () => {
        it('alors se souvenir échoue en silence : l’application démarre quand même', () => {
            const session = creerDerniereSessionOuverte(new StockageQuiRefuse());

            expect(() => {
                session.memoriser(nouveauTrajetId());
            }).not.toThrow();
            expect(() => {
                session.oublier();
            }).not.toThrow();
            expect(session.restaurer()).toBeNull();
        });
    });
});
