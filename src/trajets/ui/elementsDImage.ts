import type { ImageDeTrajet } from '../domain/Trajet';

/**
 * Crée l'élément <img> d'une page de trajet, en pleine largeur.
 * Les dimensions sont réservées : la mise en page est figée avant tout
 * décodage, les hauteurs restent stables quand les images chargent en différé.
 * L'URL créée est ajoutée à `urlsARevoquer` (à révoquer en quittant l'écran).
 */
export function elementImagePleineLargeur(
    image: ImageDeTrajet,
    urlsARevoquer: string[],
): HTMLImageElement {
    const url = URL.createObjectURL(image.blob);
    urlsARevoquer.push(url);
    const element = document.createElement('img');
    element.src = url;
    element.alt = image.nom;
    element.width = image.largeur;
    element.height = image.hauteur;
    element.loading = 'lazy';
    element.decoding = 'async';
    element.dataset['imageId'] = image.id;
    return element;
}

export function revoquerLesUrls(urls: string[]): void {
    for (const url of urls) {
        URL.revokeObjectURL(url);
    }
    urls.length = 0;
}
