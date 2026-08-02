import { query, queryAll } from './shared/dom';

/**
 * Navigation entre les écrans de l'application.
 * Un seul écran est monté à la fois ; pas de routeur.
 *
 * La carte plein écran n'en fait pas partie : c'est une **superposition**, posée
 * par-dessus l'écran courant, qui reste visible dessous. Elle n'est donc pas un
 * écran et n'a pas à figurer ici.
 */

/**
 * Monte un écran-élément dans `#app`, ce qui détache le précédent.
 *
 * C'est le détachement — et rien d'autre — qui range ce que l'écran sortant
 * avait ouvert : sources de position arrêtées, verrou d'écran relâché, URL
 * d'objet des pages libérées, écouteurs retirés. Aucun appel de sortie à ne pas
 * oublier.
 */
export function goToScreen(screen: HTMLElement): void {
    hideStaticScreens();
    query('#app', HTMLElement).replaceChildren(screen);
}

/**
 * Le nom d'un écran **est** son id dans le document, au préfixe près.
 *
 * Transitoire : ne restent ici que les écrans encore écrits en closures,
 * soudés à `index.html`. Cette union, `goTo` et les `<section>` correspondantes
 * disparaissent quand le dernier devient un élément.
 */
export type ScreenName = 'list';

/**
 * Va sur un écran encore statique et y charge son contenu.
 *
 * L'écran apparaît avant la fin du chargement, à dessein — attendre laisserait
 * l'écran précédent figé, sans retour visuel au geste de l'utilisateur.
 */
export async function goTo(name: ScreenName, load: () => Promise<void>): Promise<void> {
    query('#app', HTMLElement).replaceChildren();
    showStaticScreen(name);
    await load();
}

function showStaticScreen(name: ScreenName): void {
    for (const screen of queryAll('.screen', HTMLElement)) {
        screen.hidden = screen.id !== `screen-${name}`;
    }
}

function hideStaticScreens(): void {
    for (const screen of queryAll('.screen', HTMLElement)) {
        screen.hidden = true;
    }
}
