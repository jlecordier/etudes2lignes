import * as L from 'leaflet';
import { createIcon } from '../../shared/icons';
import { centerOnCoordonnee } from './fitting';
import type { PositionLayers } from './positionLayers';

/**
 * Le contrôle « Ma position » : un bouton posé **sur** la carte.
 *
 * Il y était auparavant à côté — dans la barre de l'éditeur et dans celle de la
 * carte plein écran —, ce qui obligeait chaque écran à retenir la dernière
 * coordonnée et l'état actif du bouton. Or recentrer ne demande rien à l'écran :
 * la coordonnée est déjà dans `PositionLayers` et le cadrage dans `fitting`. Le
 * déplacer ici **supprime** donc de l'état au lieu d'en ajouter, et le range là
 * où la plateforme le met.
 *
 * Il rejoint par la même occasion ce que les deux cartes partagent déjà —
 * `PositionLayers`, `fitting`, `numberedIcon` —, et c'est ce qui les empêche de
 * diverger : les deux écrans avaient chacun leur copie du même geste.
 *
 * L'identifiant est un paramètre parce que les deux cartes **coexistent** dans
 * le document : la carte plein écran recouvre l'éditeur sans le démonter, et
 * deux fois le même `id` n'est pas un HTML valide.
 */
export class PositionControl {
    private readonly button: HTMLButtonElement;
    private carte: L.Map | null = null;

    constructor(
        private readonly id: string,
        private readonly layers: PositionLayers,
    ) {
        this.button = this.createButton();
    }

    addTo(carte: L.Map): void {
        this.carte = carte;
        const button = this.button;
        const control = new L.Control({ position: 'topright' });
        // Leaflet ne prend pas un élément : il appelle `onAdd` et prend ce qu'on
        // rend. Le conteneur porte les classes de Leaflet pour hériter de son
        // placement parmi les autres contrôles.
        control.onAdd = (): HTMLElement => {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
            container.append(button);
            return container;
        };
        control.addTo(carte);
        this.refresh();
    }

    /**
     * Le bouton n'est actif que si l'on a une position à rejoindre.
     *
     * À rappeler quand la position change : c'est l'appelant qui sait quand
     * `PositionLayers` a repeint, et lui demander plutôt qu'écouter la carte
     * garde le contrôle sans abonnement à refermer.
     */
    refresh(): void {
        this.button.disabled = this.layers.coordonnee() === null;
    }

    private createButton(): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.id = this.id;
        button.className = 'carte-recentrer';
        // Le pictogramme ne nomme pas le bouton : c'est `aria-label` qui le
        // fait, comme pour tous ceux de l'application. La flèche est creuse,
        // celle de « Suivre » est pleine — recentrer n'est pas guider.
        button.setAttribute('aria-label', 'Ma position');
        button.title = 'Ma position';
        button.append(createIcon('location'));
        button.addEventListener('click', () => {
            this.goToPosition();
        });
        return button;
    }

    /** Le cadrage ne bouge jamais tout seul ; ici on le lui demande. */
    private goToPosition(): void {
        const coordonnee = this.layers.coordonnee();
        const carte = this.carte;
        if (coordonnee === null || carte === null) {
            return;
        }
        centerOnCoordonnee(carte, coordonnee);
    }
}
