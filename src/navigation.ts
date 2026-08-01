import { queryAll } from './shared/dom';

/**
 * Navigation entre les écrans de l'application.
 * Un seul écran (section) est visible à la fois ; pas de routeur.
 *
 * La carte plein écran n'en fait pas partie : c'est une **superposition**, posée
 * par-dessus l'écran courant, qui reste visible dessous. Elle n'est donc pas un
 * écran et n'a pas à figurer ici.
 */

/**
 * Le nom d'un écran **est** son id dans le document, au préfixe près : le
 * gabarit de `showScreen` les relie. Renommer un membre de cette union sans
 * renommer l'id correspondant dans `index.html` éteint l'écran en silence —
 * aucun compilateur ne relit une chaîne.
 */
export type ScreenName = 'list' | 'editor' | 'suivi';

/**
 * Va sur un écran et y charge son contenu.
 *
 * La recette « rendre visible puis charger » était recopiée à chaque transition
 * dans le composition root : elle est nommée ici, une fois. L'écran apparaît
 * avant la fin du chargement, à dessein — attendre laisserait l'écran précédent
 * figé, sans retour visuel au geste de l'utilisateur.
 */
export async function goTo(name: ScreenName, load: () => Promise<void>): Promise<void> {
    showScreen(name);
    await load();
}

function showScreen(name: ScreenName): void {
    for (const screen of queryAll('.screen', HTMLElement)) {
        screen.hidden = screen.id !== `screen-${name}`;
    }
}
