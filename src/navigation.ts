import { query } from './shared/dom';

/**
 * Navigation entre les écrans de l'application.
 * Un seul écran est monté à la fois ; pas de routeur.
 *
 * La carte plein écran n'en fait pas partie : c'est une **superposition**, posée
 * par-dessus l'écran courant, qui reste visible dessous. Elle n'est donc pas un
 * écran et n'a pas à figurer ici.
 */

/**
 * Monte un écran dans `#app`, ce qui détache le précédent.
 *
 * C'est le détachement — et rien d'autre — qui range ce que l'écran sortant
 * avait ouvert : sources de position arrêtées, verrou d'écran relâché, carte
 * démontée, URL d'objet des pages libérées, écouteurs retirés. Aucun appel de
 * sortie à ne pas oublier, et donc aucun à oublier.
 */
export function goToScreen(screen: HTMLElement): void {
    query('#app', HTMLElement).replaceChildren(screen);
}
