import { Coordonnee } from '../domain/Coordonnee';
import { FractionVerticale } from '../domain/FractionVerticale';
import { NomDeTrajet } from '../domain/NomDeTrajet';
import { Trajet } from '../domain/Trajet';
import { isFiniteNumber, isObject, isArray, isString } from './predicats';

/**
 * Export/import d'un trajet au format JSON autonome : le fichier contient
 * tout (nom, images en base64, points). Les points désignent leur image par
 * son index dans le fichier ; les identifiants sont régénérés à l'import,
 * qui crée donc toujours un nouveau trajet.
 */

const APPLICATION = 'etudes2lignes';
const VERSION = 1;

interface ExportedImage {
    nom: string;
    type: string;
    largeur: number;
    hauteur: number;
    donneesBase64: string;
}

interface ExportedPoint {
    /** Index de l'image dans le tableau `images` du fichier. */
    image: number;
    fraction: number;
    latitude: number;
    longitude: number;
}

export async function exportTrajetToJson(trajet: Trajet): Promise<string> {
    const images: ExportedImage[] = [];
    for (const image of trajet.images) {
        images.push({
            nom: image.nom,
            type: image.blob.type,
            largeur: image.largeur,
            hauteur: image.hauteur,
            donneesBase64: toBase64(await image.blob.arrayBuffer()),
        });
    }
    const indexByImage = new Map(trajet.images.map((image, index) => [image.id, index]));
    const points: ExportedPoint[] = trajet.pointsInOrdreDuVoyage().map((point) => {
        const image = indexByImage.get(point.imageId);
        // Inatteignable : l'agrégat garantit qu'un point vise une image du
        // trajet. La garde n'est là que parce que `!` est banni (ADR 0002) — nul
        // test ne peut donc l'exercer, et les tests de mutation signaleront
        // toujours cette ligne comme non couverte. C'est attendu.
        if (image === undefined) {
            throw new Error('Incohérence interne : un point du trajet vise une image absente.');
        }
        return {
            image,
            fraction: point.fraction.value,
            latitude: point.coordonnee.latitude,
            longitude: point.coordonnee.longitude,
        };
    });
    return JSON.stringify(
        {
            application: APPLICATION,
            version: VERSION,
            trajet: { nom: trajet.nom.value, images, points },
        },
        null,
        2,
    );
}

export function importTrajetFromJson(text: string): Trajet {
    const content = parseJson(text);
    const donnees = validateEnvelope(content);

    const trajet = Trajet.create(NomDeTrajet.create(string(donnees['nom'], 'nom')));
    const imageIds = tableau(donnees['images'], 'images').map((image, index) => {
        const inputs = objet(image, `images[${index}]`);
        const donneesBase64 = string(inputs['donneesBase64'], "données d'image");
        if (donneesBase64 === '') {
            throw new Error("Fichier incomplet : données d'image manquantes.");
        }
        return trajet.addImage({
            nom: string(inputs['nom'], "nom d'image"),
            blob: new Blob([fromBase64(donneesBase64)], {
                type: string(inputs['type'], "type d'image"),
            }),
            largeur: nombre(inputs['largeur'], 'largeur'),
            hauteur: nombre(inputs['hauteur'], 'hauteur'),
        });
    });
    for (const [index, point] of tableau(donnees['points'], 'points').entries()) {
        const inputs = objet(point, `points[${index}]`);
        const imageId = imageIds[nombre(inputs['image'], "index d'image")];
        if (imageId === undefined) {
            throw new Error('Fichier incohérent : un point vise une image absente du fichier.');
        }
        trajet.addPoint({
            imageId,
            fraction: FractionVerticale.create(nombre(inputs['fraction'], 'fraction')),
            coordonnee: Coordonnee.create(
                nombre(inputs['latitude'], 'latitude'),
                nombre(inputs['longitude'], 'longitude'),
            ),
        });
    }
    return trajet;
}

// --- Validation de l'enveloppe --------------------------------------------------

function parseJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        throw new Error("Fichier illisible : ce n'est pas un fichier JSON.");
    }
}

function validateEnvelope(content: unknown): Record<string, unknown> {
    const enveloppe = objet(content, 'fichier');
    if (enveloppe['application'] !== APPLICATION) {
        throw new Error("Ce fichier ne vient pas d'Etudes2Lignes.");
    }
    if (enveloppe['version'] !== VERSION) {
        throw new Error(
            `Version de fichier inconnue (${String(enveloppe['version'])}) : ` +
                `cette application lit la version ${VERSION}.`,
        );
    }
    return objet(enveloppe['trajet'], 'trajet');
}

function objet(value: unknown, label: string): Record<string, unknown> {
    if (!isObject(value)) {
        throw new Error(`Fichier incomplet : ${label} manquant ou invalide.`);
    }
    return value;
}

function tableau(value: unknown, label: string): unknown[] {
    if (!isArray(value)) {
        throw new Error(`Fichier incomplet : ${label} manquant ou invalide.`);
    }
    return value;
}

function string(value: unknown, label: string): string {
    if (!isString(value)) {
        throw new Error(`Fichier incomplet : ${label} manquant ou invalide.`);
    }
    return value;
}

function nombre(value: unknown, label: string): number {
    if (!isFiniteNumber(value)) {
        throw new Error(`Fichier incomplet : ${label} manquant ou invalide.`);
    }
    return value;
}

// --- Base64 ---------------------------------------------------------------------

/** Encode par tranches : String.fromCharCode sature la pile sur une page entière. */
function toBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    const CHUNK_SIZE = 0x8000;
    let binaire = '';
    for (let position = 0; position < bytes.length; position += CHUNK_SIZE) {
        binaire += String.fromCharCode(...bytes.subarray(position, position + CHUNK_SIZE));
    }
    return btoa(binaire);
}

function fromBase64(donnees: string): Uint8Array<ArrayBuffer> {
    let binaire: string;
    try {
        binaire = atob(donnees);
    } catch {
        throw new Error("Fichier incomplet : données d'image illisibles.");
    }
    const bytes = new Uint8Array(new ArrayBuffer(binaire.length));
    for (let position = 0; position < binaire.length; position++) {
        bytes[position] = binaire.charCodeAt(position);
    }
    return bytes;
}
