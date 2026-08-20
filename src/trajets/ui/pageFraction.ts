import { FractionVerticale } from '../domain/FractionVerticale';

/**
 * La fraction qu'une hauteur d'écran désigne dans la zone d'une page.
 *
 * C'est la zone qui mesure sa propre boîte : ni l'écran ni un geste n'ont à le
 * faire à sa place, ils ne connaissent que la fraction.
 */
export function fractionInArea(area: HTMLElement, clientY: number): FractionVerticale {
    const frame = area.getBoundingClientRect();
    return FractionVerticale.fromHeight(clientY - frame.top, frame.height);
}

/**
 * Pose un élément à une hauteur relative dans une zone, en l'y déplaçant s'il
 * était ailleurs.
 *
 * Partagé par le repère qu'un glisser déplace et par le fantôme qu'un appui long
 * traîne : les deux traversent les pages, et deux copies de cette règle
 * finiraient par ne plus dire la même chose.
 */
export function placeAt(
    element: HTMLElement,
    area: HTMLElement,
    fraction: FractionVerticale,
): void {
    if (element.parentElement !== area) {
        area.append(element);
    }
    element.style.top = `${String(fraction.value * 100)}%`;
}
