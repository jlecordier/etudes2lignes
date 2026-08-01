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
