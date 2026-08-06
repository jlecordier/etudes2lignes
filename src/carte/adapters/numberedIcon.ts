import * as L from 'leaflet';

/**
 * La pastille rouge numérotée, commune à toutes les cartes de l'appli.
 *
 * La géométrie du symbole n'est pas ici : la feuille de style lui donne sa taille
 * (`--point-badge-size`) et le centre sur sa coordonnée (la marge négative de
 * `.carte-marker`), parce que la même pastille est posée sur le schéma et qu'une
 * taille écrite deux fois finit par donner deux pastilles différentes.
 *
 * D'où l'`iconSize: undefined`, qui n'est pas un oubli : `DivIcon` vaut `[12, 12]`
 * par défaut, et Leaflet inscrit cette taille en style inline — lequel gagne
 * contre la feuille. Neutralisée, il n'écrit ni taille ni marge et laisse le CSS
 * faire, comme sa propre documentation le prévoit. Le témoin de tout ceci est le
 * test qui compare les deux pastilles (GR-13) : si Leaflet cessait de l'accepter,
 * celle de la carte retomberait à 12 px et le test le dirait.
 */
export function numberedIcon(number: number): L.DivIcon {
    return L.divIcon({
        className: 'carte-marker',
        html: String(number),
        iconSize: undefined,
    });
}
