import { Coordonnee } from '../domain/Coordonnee';
import { FractionVerticale } from '../domain/FractionVerticale';
import { NomDeTrajet } from '../domain/NomDeTrajet';
import { Trajet } from '../domain/Trajet';
import { estUnNombreFini, estUnObjet, estUnTableau, estUneChaine } from './predicats';

/**
 * Export/import d'un trajet au format JSON autonome : le fichier contient
 * tout (nom, images en base64, points). Les points désignent leur image par
 * son index dans le fichier ; les identifiants sont régénérés à l'import,
 * qui crée donc toujours un nouveau trajet.
 */

const APPLICATION = 'etudes2lignes';
const VERSION = 1;

interface ImageExportee {
    nom: string;
    type: string;
    largeur: number;
    hauteur: number;
    donneesBase64: string;
}

interface PointExporte {
    /** Index de l'image dans le tableau `images` du fichier. */
    image: number;
    fraction: number;
    latitude: number;
    longitude: number;
}

export async function exporterTrajetEnJson(trajet: Trajet): Promise<string> {
    const images: ImageExportee[] = [];
    for (const image of trajet.images) {
        images.push({
            nom: image.nom,
            type: image.blob.type,
            largeur: image.largeur,
            hauteur: image.hauteur,
            donneesBase64: enBase64(await image.blob.arrayBuffer()),
        });
    }
    const indexParImage = new Map(trajet.images.map((image, index) => [image.id, index]));
    const points: PointExporte[] = trajet.ordreVoyageDesPoints().map((point) => {
        const image = indexParImage.get(point.imageId);
        if (image === undefined) {
            throw new Error('Incohérence interne : un point du trajet vise une image absente.');
        }
        return {
            image,
            fraction: point.fraction.valeur,
            latitude: point.coordonnee.latitude,
            longitude: point.coordonnee.longitude,
        };
    });
    return JSON.stringify(
        {
            application: APPLICATION,
            version: VERSION,
            trajet: { nom: trajet.nom.valeur, images, points },
        },
        null,
        2,
    );
}

export function importerTrajetDepuisJson(texte: string): Trajet {
    const contenu = analyserLeJson(texte);
    const donnees = validerLEnveloppe(contenu);

    const trajet = Trajet.creer(NomDeTrajet.creer(chaine(donnees['nom'], 'nom')));
    const idsDesImages = tableau(donnees['images'], 'images').map((image, index) => {
        const champs = objet(image, `images[${index}]`);
        const donneesBase64 = chaine(champs['donneesBase64'], 'données d’image');
        if (donneesBase64 === '') {
            throw new Error('Fichier incomplet : données d’image manquantes.');
        }
        return trajet.ajouterImage({
            nom: chaine(champs['nom'], 'nom d’image'),
            blob: new Blob([depuisBase64(donneesBase64)], {
                type: chaine(champs['type'], 'type d’image'),
            }),
            largeur: nombre(champs['largeur'], 'largeur'),
            hauteur: nombre(champs['hauteur'], 'hauteur'),
        });
    });
    for (const [index, point] of tableau(donnees['points'], 'points').entries()) {
        const champs = objet(point, `points[${index}]`);
        const imageId = idsDesImages[nombre(champs['image'], 'index d’image')];
        if (imageId === undefined) {
            throw new Error('Fichier incohérent : un point vise une image absente du fichier.');
        }
        trajet.ajouterPoint({
            imageId,
            fraction: FractionVerticale.creer(nombre(champs['fraction'], 'fraction')),
            coordonnee: Coordonnee.creer(
                nombre(champs['latitude'], 'latitude'),
                nombre(champs['longitude'], 'longitude'),
            ),
        });
    }
    return trajet;
}

// --- Validation de l'enveloppe --------------------------------------------------

function analyserLeJson(texte: string): unknown {
    try {
        return JSON.parse(texte);
    } catch {
        throw new Error('Fichier illisible : ce n’est pas un fichier JSON.');
    }
}

function validerLEnveloppe(contenu: unknown): Record<string, unknown> {
    const enveloppe = objet(contenu, 'fichier');
    if (enveloppe['application'] !== APPLICATION) {
        throw new Error('Ce fichier ne vient pas d’Etudes2Lignes.');
    }
    if (enveloppe['version'] !== VERSION) {
        throw new Error(
            `Version de fichier inconnue (${String(enveloppe['version'])}) : ` +
                `cette application lit la version ${VERSION}.`,
        );
    }
    return objet(enveloppe['trajet'], 'trajet');
}

function objet(valeur: unknown, quoi: string): Record<string, unknown> {
    if (!estUnObjet(valeur)) {
        throw new Error(`Fichier incomplet : ${quoi} manquant ou invalide.`);
    }
    return valeur;
}

function tableau(valeur: unknown, quoi: string): unknown[] {
    if (!estUnTableau(valeur)) {
        throw new Error(`Fichier incomplet : ${quoi} manquant ou invalide.`);
    }
    return valeur;
}

function chaine(valeur: unknown, quoi: string): string {
    if (!estUneChaine(valeur)) {
        throw new Error(`Fichier incomplet : ${quoi} manquant ou invalide.`);
    }
    return valeur;
}

function nombre(valeur: unknown, quoi: string): number {
    if (!estUnNombreFini(valeur)) {
        throw new Error(`Fichier incomplet : ${quoi} manquant ou invalide.`);
    }
    return valeur;
}

// --- Base64 ---------------------------------------------------------------------

/** Encode par tranches : String.fromCharCode sature la pile sur une page entière. */
function enBase64(tampon: ArrayBuffer): string {
    const octets = new Uint8Array(tampon);
    const TAILLE_DE_TRANCHE = 0x8000;
    let binaire = '';
    for (let position = 0; position < octets.length; position += TAILLE_DE_TRANCHE) {
        binaire += String.fromCharCode(...octets.subarray(position, position + TAILLE_DE_TRANCHE));
    }
    return btoa(binaire);
}

function depuisBase64(donnees: string): Uint8Array<ArrayBuffer> {
    let binaire: string;
    try {
        binaire = atob(donnees);
    } catch {
        throw new Error('Fichier incomplet : données d’image illisibles.');
    }
    const octets = new Uint8Array(new ArrayBuffer(binaire.length));
    for (let position = 0; position < binaire.length; position++) {
        octets[position] = binaire.charCodeAt(position);
    }
    return octets;
}
