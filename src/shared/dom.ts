/**
 * `querySelector` qui lève si l'élément est absent OU n'est pas du type attendu.
 *
 * On passe le constructeur du type voulu (`HTMLInputElement`, …). Contrairement
 * à `querySelector<T>('#id')` — une assertion aveugle où rien ne garantit que
 * l'élément est bien du type annoncé — le type est ici réellement VÉRIFIÉ à
 * l'exécution par `instanceof`. Le générique relie donc une vraie entrée (le
 * constructeur) à la sortie, au lieu de n'être qu'un cast déguisé.
 */
export function query<E extends Element>(
    selector: string,
    type: new () => E,
    racine: ParentNode = document,
): E {
    const element = racine.querySelector(selector);
    if (element === null) {
        throw new Error(`Élément introuvable pour le sélecteur « ${selector} ».`);
    }
    if (!(element instanceof type)) {
        throw new TypeError(
            `« ${selector} » n'est pas un ${type.name} (trouvé : ${element.nodeName}).`,
        );
    }
    return element;
}

/**
 * Le pendant pluriel de `query`, sur le même principe du constructeur-témoin.
 *
 * `querySelectorAll<T>('…')` serait un générique à sens unique : rien ne
 * garantit à l'exécution que les éléments trouvés sont du type annoncé — c'est
 * un cast déguisé. Ici chaque élément est réellement vérifié par `instanceof`.
 */
export function queryAll<E extends Element>(
    selector: string,
    type: new () => E,
    racine: ParentNode = document,
): E[] {
    return Array.from(racine.querySelectorAll(selector), (element) => {
        if (!(element instanceof type)) {
            throw new TypeError(
                `« ${selector} » a trouvé un ${element.nodeName} au lieu d'un ${type.name}.`,
            );
        }
        return element;
    });
}

/**
 * Ce qu'un custom element a reçu avant d'être attaché, ou l'échec de le dire.
 *
 * Le navigateur construit lui-même les custom elements : on ne peut rien leur
 * passer par le constructeur, donc leur configuration arrive par propriété. Sa
 * fabrique étant le seul moyen d'en obtenir un, et posant la propriété avant de
 * rendre l'élément, cette garde est **inatteignable** — elle n'existe que parce
 * que `!` est banni ([ADR 0002](../../docs/adr/0002-lint-type-aware-strict.md)),
 * et elle survivra donc toujours aux tests de mutation.
 */
export function requireConfiguration<T>(value: T | null, element: HTMLElement): T {
    if (value === null) {
        throw new Error(
            `« ${element.localName} » a été utilisé sans sa configuration : sa fabrique est le seul moyen d'en obtenir un.`,
        );
    }
    return value;
}
