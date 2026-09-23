import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import {
    ajouterUnPoint,
    isLargeScreen,
    ouvrirUnTrajetAvecUnePage,
    preparerLApplication,
} from './helpers';

/**
 * Les trois apparences que le palier sémantique distingue
 * (`src/styles/tokens/semantic.css`) : claire, sombre, et contraste élevé —
 * ce dernier gardé en apparence claire, `prefers-contrast: more` étant
 * indépendant de `prefers-color-scheme` (même choix que `e2e/ombres.spec.ts`).
 *
 * `contrast` est répété à **chaque** entrée, jamais omis : Playwright
 * conserve l'émulation d'un appel à l'autre, et l'omettre laisse traîner la
 * valeur précédente — mesuré en partie 1, où deux relevés en avaient été
 * faussés par cet oubli.
 */
const APPARENCES: readonly {
    readonly nom: string;
    readonly media: Parameters<Page['emulateMedia']>[0];
}[] = [
    { nom: 'clair', media: { colorScheme: 'light', contrast: 'no-preference' } },
    { nom: 'sombre', media: { colorScheme: 'dark', contrast: 'no-preference' } },
    { nom: 'contraste', media: { colorScheme: 'light', contrast: 'more' } },
];

/** Un trajet géo-référencé, prêt pour le suivi : une page, un point en bas
 *  (80 %) et un point en haut (20 %) — lecture bas → haut, comme
 *  `e2e/suivi.spec.ts`. */
async function ouvrirUnTrajetGeoreference(page: Page): Promise<void> {
    await ouvrirUnTrajetAvecUnePage(page);
    await ajouterUnPoint(page, 0.8, 0);
    await ajouterUnPoint(page, 0.2, 150);
}

/** Ouvre l'écran de suivi d'un trajet géo-référencé. */
async function ouvrirLeSuivi(page: Page): Promise<void> {
    await ouvrirUnTrajetGeoreference(page);
    await page.getByRole('button', { name: 'Suivre' }).click();
    await expect(page.locator('suivi-screen')).toBeVisible();
}

/**
 * Ouvre la carte plein écran (`#screen-carte`) par le bouton « Simuler » du
 * suivi : seul point d'entrée qui l'ouvre quelle que soit la largeur d'écran
 * — contrairement au choix de coordonnée d'un point, qui reste inline sur
 * grand écran (`choisirUneCoordonneePourUnPoint`, `e2e/helpers.ts`), donc
 * absent sur les projets desktop de cette suite.
 */
async function ouvrirLaCartePleinEcran(page: Page): Promise<void> {
    await ouvrirLeSuivi(page);
    await page.getByRole('button', { name: 'Simuler', exact: true }).click();
    await expect(page.locator('#screen-carte')).toBeVisible();
}

/** Déplie l'aperçu du trajet : déjà là sur grand écran, un bouton flottant
 *  ailleurs — comme `e2e/suivi.spec.ts`. */
async function afficherLApercu(page: Page): Promise<void> {
    if (!(await isLargeScreen(page))) {
        await page.getByRole('button', { name: 'Aperçu du trajet' }).click();
    }
    await expect(page.locator('#trajet-overview')).toBeVisible();
}

interface Vue {
    /** Le nom qui préfixe chaque fichier de référence et qui nomme la capture. */
    readonly nom: string;
    readonly description: string;
    readonly ouvrir: (page: Page) => Promise<void>;
}

/** Les six vues du système, chacune une porte d'entrée distincte de
 *  l'application plutôt qu'une variation de l'une des cinq autres. */
const VUES: readonly Vue[] = [
    {
        nom: 'planche',
        description: 'la planche de référence',
        ouvrir: async (page) => {
            await page.goto('/design/');
        },
    },
    {
        nom: 'liste',
        description: 'la liste des trajets',
        ouvrir: preparerLApplication,
    },
    {
        nom: 'editeur',
        description: "l'éditeur, un point posé",
        ouvrir: async (page) => {
            await ouvrirUnTrajetAvecUnePage(page);
            await ajouterUnPoint(page, 0.5, 0);
        },
    },
    {
        nom: 'carte',
        description: 'la carte plein écran',
        ouvrir: ouvrirLaCartePleinEcran,
    },
    {
        nom: 'suivi',
        description: 'le suivi',
        ouvrir: ouvrirLeSuivi,
    },
    {
        nom: 'apercu',
        description: "l'aperçu du trajet",
        ouvrir: async (page) => {
            await ouvrirLeSuivi(page);
            await afficherLApercu(page);
        },
    },
];

/**
 * Les références n'existent que là où quelqu'un les a générées.
 *
 * Playwright suffixe chaque capture par plateforme, et la CI tourne sur
 * `ubuntu-latest` (`.github/workflows/deploy.yml`) : des références produites
 * sur macOS ne s'y compareraient jamais. Elles se génèrent donc sous Linux,
 * dans le dev container, par un geste délibéré :
 *
 *     pnpm exec playwright test e2e/visuel.spec.ts --update-snapshots
 *
 * Ce suffixe s'arrête à la plateforme : il ne dit rien de l'architecture, ni
 * du jeu de polices installé. Les références présentes sont nées en arm64,
 * dans l'image `mcr.microsoft.com/playwright:v1.61.1-noble`, quand la CI les
 * compare en amd64 sur un runner nu qui n'a ni la même image ni les mêmes
 * polices. Le `maxDiffPixelRatio` plus bas est le prix de cet écart, et les
 * régénérer ailleurs qu'en arm64 rouvrirait un diff qui ne signale aucune
 * régression.
 *
 * Tant qu'elles manquent, ce fichier ferait échouer toute la suite — mesuré :
 * trente échecs, `pnpm test:e2e` en code 1. D'où la garde ci-dessous, et son
 * asymétrie, qui est l'essentiel :
 *
 * - **sur la plateforme de la CI, l'absence est une erreur** : quelqu'un a
 *   oublié de committer les références, et le dire tôt vaut mieux que laisser
 *   six vues sans filet ;
 * - **ailleurs, elle est une abstention** : un développeur sur macOS n'a pas à
 *   être bloqué par des références qu'il ne doit pas produire.
 *
 * Sans cette asymétrie, la garde serait un témoin vide de plus : un `skip`
 * inconditionnel resterait silencieux pour toujours, y compris le jour où les
 * références disparaîtraient du dépôt.
 */
// Assemblé par `join`, et non par `new URL('./…', import.meta.url)` : ce
// second geste ressemble à un import, et l'analyse de code mort du dépôt le
// lit comme tel — « unresolved import », porte de qualité en échec. Elle a
// raison de ne pas savoir le résoudre : le dossier n'existe pas tant que
// personne n'a généré les références.
const DOSSIER_DES_REFERENCES = join(
    dirname(fileURLToPath(import.meta.url)),
    'visuel.spec.ts-snapshots',
);
const referencesPresentes =
    existsSync(DOSSIER_DES_REFERENCES) && readdirSync(DOSSIER_DES_REFERENCES).length > 0;

/**
 * Ce que la capture doit attendre, et ce qu'elle ne doit jamais attendre.
 *
 * `toHaveScreenshot` sait patienter jusqu'à ce que deux prises consécutives
 * soient identiques, et il attend les polices. Il n'attend **pas** les
 * images : une page dont le schéma n'est pas encore décodé est parfaitement
 * stable, simplement vide. Mesuré le 24 septembre 2026 : la même référence
 * pesait 307 Ko avec l'image et 36 Ko sans, et la CI comparait l'une à
 * l'autre — 37 % des pixels, un écart qu'aucune tolérance ne distingue d'une
 * régression, et qui n'en était pas une.
 */
async function attendreLesImages(page: Page): Promise<void> {
    await page.evaluate(async () => {
        await Promise.all(
            [...document.images].map((image) =>
                // `decode()` et non `complete` : une image peut être reçue
                // sans être encore peinte. L'échec est avalé — une image
                // cassée est un défaut que d'autres témoins doivent dénoncer,
                // pas de quoi faire tomber une capture.
                image.decode().catch(() => undefined),
            ),
        );
    });
}

test.describe('Les six vues du système, dans les trois apparences', () => {
    test.skip(
        !referencesPresentes && process.platform !== 'linux',
        "Références de capture absentes : elles se génèrent sous Linux, dans le dev container, par `pnpm exec playwright test e2e/visuel.spec.ts --update-snapshots`. Sur la plateforme de la CI, cette absence échoue au lieu d'être ignorée.",
    );

    for (const vue of VUES) {
        test(`Étant donné ${vue.description}, quand l'apparence change, alors sa capture correspond à la référence`, async ({
            page,
        }) => {
            await vue.ouvrir(page);

            for (const apparence of APPARENCES) {
                await page.emulateMedia(apparence.media);
                await attendreLesImages(page);
                await expect(page).toHaveScreenshot(`${vue.nom}-${apparence.nom}.png`, {
                    // Animations et transitions figées à l'instant de l'obturateur :
                    // sans quoi une capture prise en plein fondu ne se
                    // reproduirait jamais deux fois à l'identique.
                    animations: 'disabled',
                    // Le texte d'état GPS dépend du moment et du moteur (accès
                    // refusé, en attente…) : masqué plutôt que stabilisé par une
                    // géolocalisation simulée, pour ne pas dépendre du régime de
                    // permission de chaque navigateur (Firefox ne délivre par
                    // exemple aucun callback d'erreur sur refus, voir
                    // `e2e/suivi.spec.ts`). `#carte-position-status` est
                    // l'équivalent sur la carte plein écran
                    // (`LeafletCoordonneeSelector.ts`) ; ni l'un ni l'autre
                    // n'existe sur les vues qui ne les affichent pas, où le
                    // masque ne trouve simplement rien.
                    // `.leaflet-tile-pane` rejoint les deux textes d'état pour
                    // la même raison qu'eux : ce qu'il montre ne dépend pas de
                    // cette application. Les tuiles viennent d'un serveur
                    // tiers, arrivent quand elles peuvent et changent quand
                    // leur éditeur le décide — sur le runner elles n'arrivent
                    // pas du tout, et la référence du 24 septembre 2026 a figé
                    // une carte vide que le run suivant a comparée à une carte
                    // pleine. Les marqueurs vivent dans `.leaflet-marker-pane`
                    // et restent donc visibles : c'est le fond qui part, pas
                    // ce que l'application y pose.
                    mask: [
                        page.locator('#suivi-status'),
                        page.locator('#carte-position-status'),
                        page.locator('.leaflet-tile-pane'),
                    ],
                    // Échelle de pixel fixée en CSS plutôt qu'en pixels
                    // matériels : sans quoi une référence générée sur un
                    // projet à `deviceScaleFactor` élevé (les projets mobiles)
                    // ne se comparerait plus à sa propre géométrie CSS d'un
                    // moteur à l'autre.
                    scale: 'css',
                    // Une comparaison au pixel près supposerait que la
                    // référence et la CI rendent le texte identiquement, ce
                    // que l'écart arm64 / amd64 décrit plus haut interdit.
                    // 1 % des pixels absorbe cet antialiasing — et, dit
                    // franchement, laisse aussi passer l'équivalent d'un
                    // carré de 96 × 96 sur une capture de bureau
                    // (1280 × 720). À resserrer le jour où une régression y
                    // échappe ; l'élargir serait renoncer au filet.
                    maxDiffPixelRatio: 0.01,
                });
            }
        });
    }
});
