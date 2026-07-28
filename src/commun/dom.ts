/**
 * `querySelector` qui lève si l'élément est absent OU n'est pas du type attendu.
 *
 * On passe le constructeur du type voulu (`HTMLInputElement`, …). Contrairement
 * à `querySelector<T>('#id')` — une assertion aveugle où rien ne garantit que
 * l'élément est bien du type annoncé — le type est ici réellement VÉRIFIÉ à
 * l'exécution par `instanceof`. Le générique relie donc une vraie entrée (le
 * constructeur) à la sortie, au lieu de n'être qu'un cast déguisé.
 */
export function requete<E extends Element>(
    selecteur: string,
    type: new () => E,
    racine: ParentNode = document,
): E {
    const element = racine.querySelector(selecteur);
    if (element === null) {
        throw new Error(`Élément introuvable pour le sélecteur « ${selecteur} ».`);
    }
    if (!(element instanceof type)) {
        throw new TypeError(
            `« ${selecteur} » n'est pas un ${type.name} (trouvé : ${element.nodeName}).`,
        );
    }
    return element;
}
