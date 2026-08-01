/**
 * Ramène une valeur dans l'intervalle `[minimum, maximum]` : en dessous on
 * obtient le minimum, au-dessus le maximum, entre les deux la valeur elle-même.
 * Sert partout où une mesure venue de l'extérieur (position d'un clic, offset de
 * défilement, abscisse d'une projection) doit tenir dans un intervalle connu.
 */
export function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}
