import '../src/styles/index.css';
import './gallery.css';

/** Les noms de propriete personnalisee que declare une regle de style, ajoutes
 *  a l'ensemble en cours de constitution. */
function jetonsDeLaRegle(regle: CSSStyleRule, dans: Set<string>): void {
    for (const propriete of Array.from(regle.style)) {
        if (propriete.startsWith('--')) {
            dans.add(propriete);
        }
    }
}

/**
 * Les noms de jetons declares par les feuilles chargees.
 *
 * On descend dans les regles groupantes — `@layer`, `@media`, `@supports`
 * heritent tous de `CSSGroupingRule` —, sans quoi on ne verrait rien : tout le
 * systeme vit dans des couches.
 */
function nomsDesJetons(regles: CSSRuleList, dans: Set<string>): void {
    for (const regle of Array.from(regles)) {
        if (regle instanceof CSSStyleRule) {
            jetonsDeLaRegle(regle, dans);
        } else if (regle instanceof CSSGroupingRule) {
            nomsDesJetons(regle.cssRules, dans);
        }
    }
}

function jetonsDuSysteme(): string[] {
    const noms = new Set<string>();
    for (const feuille of Array.from(document.styleSheets)) {
        // Une feuille d'une autre origine leve a la lecture ; ici il n'y en a
        // pas, mais la garde evite qu'une future en casse la planche entiere.
        try {
            nomsDesJetons(feuille.cssRules, noms);
        } catch {
            continue;
        }
    }
    return [...noms].sort();
}

function valeurResolue(nom: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(nom).trim();
}

/** L'apercu d'un jeton : un pave de la couleur resolue, ou une reglette a sa
 *  largeur resolue — rien quand la valeur n'est ni l'un ni l'autre. */
function apercuDeLaValeur(valeur: string): HTMLElement {
    const apercu = document.createElement('span');
    apercu.className = 'planche-apercu';
    if (/^(rgb|#|light-dark|color)/.test(valeur)) {
        apercu.style.background = valeur;
    } else if (valeur.endsWith('px')) {
        apercu.style.inlineSize = valeur;
        apercu.classList.add('planche-reglette');
    }
    return apercu;
}

/** Une pastille par jeton : son nom, ce que le navigateur en a fait, et un
 *  apercu quand la valeur est une couleur. */
function pastille(nom: string): HTMLElement {
    const valeur = valeurResolue(nom);
    const element = document.createElement('figure');
    element.className = 'planche-pastille';
    element.dataset['jeton'] = nom;
    element.classList.toggle('planche-manquant', valeur === '');

    const legende = document.createElement('figcaption');
    legende.textContent = nom;
    const mesure = document.createElement('code');
    // La valeur **resolue**, pas celle qu'on croit avoir ecrite : c'est la
    // difference entre une planche et une liste.
    mesure.textContent = valeur === '' ? 'vide' : valeur;

    element.append(apercuDeLaValeur(valeur), legende, mesure);
    return element;
}

const STYLES_DE_TEXTE = [
    'large-title',
    'title-1',
    'title-2',
    'title-3',
    'headline',
    'body',
    'callout',
    'subheadline',
    'footnote',
    'caption-1',
    'caption-2',
];

/** Un echantillon par style, avec ses trois metriques **mesurees**. */
function echantillonDeTexte(nom: string): HTMLElement {
    const element = document.createElement('section');
    element.className = 'planche-texte';
    element.dataset['styleDeTexte'] = nom;

    const exemple = document.createElement('p');
    exemple.className = `text-${nom}`;
    exemple.textContent = 'Paris → Bordeaux, kilometre 246,8';
    element.append(exemple);

    const mesures = document.createElement('code');
    element.append(mesures);
    // Apres insertion : sans mise en page, il n'y a rien a mesurer.
    requestAnimationFrame(() => {
        const style = getComputedStyle(exemple);
        mesures.textContent = `${nom} — ${style.fontSize} / ${style.lineHeight} / ${style.letterSpacing}`;
    });

    return element;
}

function section(titre: string, contenu: HTMLElement[]): HTMLElement {
    const element = document.createElement('section');
    element.className = 'planche-section';
    const entete = document.createElement('h2');
    entete.textContent = titre;
    const grille = document.createElement('div');
    grille.className = 'planche-grille';
    grille.append(...contenu);
    element.append(entete, grille);
    return element;
}

function rendre(): void {
    const racine = document.querySelector('#planche');
    if (!(racine instanceof HTMLElement)) {
        return;
    }

    const jetons = jetonsDuSysteme();
    const par = (prefixe: string): HTMLElement[] =>
        jetons.filter((nom) => nom.startsWith(prefixe)).map(pastille);

    racine.replaceChildren(
        section('Roles de couleur', par('--color-')),
        section('Materiaux et ombres', [...par('--material-'), ...par('--shadow-')]),
        section('Rampes brutes', [
            ...par('--blue'),
            ...par('--red'),
            ...par('--grey'),
            ...par('--orange'),
            ...par('--green'),
        ]),
        section('Espacement', par('--space-')),
        section('Rayons', par('--radius-')),
        section('Styles de texte', STYLES_DE_TEXTE.map(echantillonDeTexte)),
        section('Mesures de systeme', [
            ...par('--hit-target'),
            ...par('--screen-margin'),
            ...par('--blur-'),
        ]),
    );
}

for (const bouton of Array.from(document.querySelectorAll('[data-apparence]'))) {
    bouton.addEventListener('click', () => {
        const choix = bouton instanceof HTMLElement ? bouton.dataset['apparence'] : undefined;
        if (choix === 'auto' || choix === undefined) {
            delete document.documentElement.dataset['apparence'];
            document.documentElement.style.colorScheme = 'light dark';
        } else {
            document.documentElement.dataset['apparence'] = choix;
            document.documentElement.style.colorScheme = choix;
        }
        rendre();
    });
}

const bascule = document.querySelector('[data-cibles]');
if (bascule instanceof HTMLInputElement) {
    bascule.addEventListener('change', () => {
        document.body.classList.toggle('planche-cibles', bascule.checked);
    });
}

// L'appel initial attend le chargement complet : le script module,
// bundle en tete de `<head>`, peut s'executer avant que les
// `<link rel="stylesheet">` qui le suivent n'aient fini de charger — rien ne
// garantit l'ordre entre les deux. Lancer `rendre()` sur `load` (au lieu
// d'un appel synchrone a l'import) attend que `document.styleSheets`
// soit complet, faute de quoi la premiere pastille peinte dependrait d'une
// course gagnee par chance plutot que d'une garantie.
if (document.readyState === 'complete') {
    rendre();
} else {
    window.addEventListener('load', rendre, { once: true });
}
