/**
 * Faire enregistrer un trajet par le navigateur, dans un fichier JSON autonome.
 *
 * Le geste vivait dans la liste des trajets, seul endroit d'où l'on exportait.
 * L'éditeur exporte à son tour : le geste est ici, entier, plutôt que recopié —
 * la révocation différée est le genre de détail qu'une copie perd en silence.
 */
import type { Trajet } from '../domain/Trajet';
import { exportTrajetToJson } from '../serialization/trajetJson';

export async function downloadTrajet(trajet: Trajet): Promise<void> {
    download(await exportTrajetToJson(trajet), `${fileNameFrom(trajet.nom.value)}.json`);
}

/** Délai avant de libérer l'URL blob d'un téléchargement (une minute). */
const REVOCATION_DELAY_MS = 60_000;

/** Déclenche le téléchargement d'un fichier texte par le navigateur. */
function download(content: string, fileName: string): void {
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = fileName;
    lien.click();
    // Révocation différée : Safari/iOS et Firefox lisent le blob après le tick
    // courant ; le révoquer tout de suite annulerait le téléchargement.
    setTimeout(() => {
        URL.revokeObjectURL(url);
    }, REVOCATION_DELAY_MS);
}

/** Un nom de trajet peut contenir des caractères interdits dans un nom de fichier. */
function fileNameFrom(nom: string): string {
    return nom.replace(/[/\\:*?"<>|]/g, '-');
}
