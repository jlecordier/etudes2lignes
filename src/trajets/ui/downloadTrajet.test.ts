// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { requireElementAt } from '../../shared/array';
import { Coordonnee } from '../domain/Coordonnee';
import { FractionVerticale } from '../domain/FractionVerticale';
import { NomDeTrajet } from '../domain/NomDeTrajet';
import { Trajet } from '../domain/Trajet';
import { downloadTrajet } from './downloadTrajet';

function trajetNomme(nom: string): Trajet {
    const trajet = Trajet.create(NomDeTrajet.create(nom));
    const page = trajet.addImage({
        nom: 'page-1.png',
        blob: new Blob(['contenu de la page 1'], { type: 'image/png' }),
        largeur: 800,
        hauteur: 1200,
    });
    trajet.addPoint({
        imageId: page,
        fraction: FractionVerticale.create(0.5),
        coordonnee: Coordonnee.create(44.826, -0.556),
    });
    return trajet;
}

let enregistres: { nom: string; url: string }[];
let blobsParUrl: Map<string, Blob>;
let liberees: string[];

beforeEach(() => {
    // jsdom n'a ni URL d'objet ni téléchargement : les deux sont posés à la
    // main, et le test lit ainsi exactement ce que le navigateur recevrait.
    blobsParUrl = new Map();
    enregistres = [];
    liberees = [];
    URL.createObjectURL = (objet: Blob | MediaSource) => {
        if (!(objet instanceof Blob)) {
            throw new Error("Ce test n'attend que des Blob.");
        }
        const url = `blob:${String(blobsParUrl.size + 1)}`;
        blobsParUrl.set(url, objet);
        return url;
    };
    URL.revokeObjectURL = (url: string) => {
        liberees.push(url);
    };
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
        enregistres.push({ nom: this.download, url: this.getAttribute('href') ?? '' });
    };
});

/** Le fichier que le navigateur s'est vu proposer : son nom et son contenu. */
async function fichierPropose(): Promise<{ nom: string; contenu: unknown }> {
    const enregistre = requireElementAt(enregistres, 0);
    const blob = blobsParUrl.get(enregistre.url);
    if (blob === undefined) {
        throw new Error(`Aucun blob derrière « ${enregistre.url} ».`);
    }
    return { nom: enregistre.nom, contenu: JSON.parse(await blob.text()) };
}

describe('downloadTrajet', () => {
    describe('Étant donné un trajet, quand je le fais télécharger', () => {
        it('alors le fichier porte le nom du trajet et contient son export JSON', async () => {
            await downloadTrajet(trajetNomme('Paris → Bordeaux'));

            const { nom, contenu } = await fichierPropose();
            expect(nom).toBe('Paris → Bordeaux.json');
            expect(contenu).toMatchObject({
                application: 'etudes2lignes',
                version: 1,
                trajet: {
                    nom: 'Paris → Bordeaux',
                    images: [{ nom: 'page-1.png' }],
                    points: [{ image: 0 }],
                },
            });
        });

        it("alors l'URL de l'objet n'est pas libérée dans le tick courant", async () => {
            await downloadTrajet(trajetNomme('Paris → Bordeaux'));

            // Safari/iOS et Firefox lisent le blob après le tick courant : le
            // révoquer tout de suite annulerait le téléchargement qu'on vient
            // de proposer — d'où les deux assertions, et non la seule seconde.
            expect(enregistres).toHaveLength(1);
            expect(liberees).toEqual([]);
        });
    });

    describe('Étant donné un trajet dont le nom contient des caractères interdits dans un nom de fichier', () => {
        it('alors ils sont remplacés, et le nom reste reconnaissable', async () => {
            await downloadTrajet(trajetNomme('Paris/Bordeaux : étude n°2 <brouillon>'));

            const { nom } = await fichierPropose();
            expect(nom).toBe('Paris-Bordeaux - étude n°2 -brouillon-.json');
        });
    });
});
