import { Subject, defer, filter, finalize, type Observable } from 'rxjs';
import type { Foreground } from '../ports/Foreground';

/**
 * Faux premier plan écrit à la main, pour les tests : la visibilité de la page
 * et ses réveils, pilotés à la main, sans navigateur ni jsdom.
 */
export class FakeForeground implements Foreground {
    private readonly wakeups = new Subject<void>();
    private visible = true;
    private openSubscriptions = 0;

    /**
     * Comme le vrai : un réveil page masquée n'en est pas un.
     *
     * Les abonnements sont comptés au passage — c'est ce que les tests
     * surveillent, et le compte se tient ici plutôt que de s'aller lire dans les
     * entrailles du `Subject`.
     */
    readonly returnToForeground$: Observable<void> = defer(() => {
        this.openSubscriptions++;
        return this.wakeups.pipe(filter(() => this.visible));
    }).pipe(
        finalize(() => {
            this.openSubscriptions--;
        }),
    );

    /** Combien d'abonnements l'abonné laisse ouverts. */
    subscriptions(): number {
        return this.openSubscriptions;
    }

    hidePage(): void {
        this.visible = false;
    }

    returnToForeground(): void {
        this.visible = true;
        this.emitWakeup();
    }

    /** Un réveil brut, sans supposer que la page soit redevenue visible. */
    emitWakeup(): void {
        this.wakeups.next();
    }
}
