/**
 * Navigation entre les écrans de l'application.
 * Un seul écran (section) est visible à la fois ; pas de routeur.
 */

export type NomEcran = 'liste' | 'editeur' | 'suivi' | 'carte';

export function afficherEcran(nom: NomEcran): void {
  for (const ecran of tousLesEcrans()) {
    ecran.hidden = ecran.id !== `ecran-${nom}`;
  }
}

function tousLesEcrans(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.ecran'));
}
