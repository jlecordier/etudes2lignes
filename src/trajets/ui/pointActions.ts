import { createButton, type Button, type ButtonVariant } from '../../shared/elements';
import { emitIntent, type PointIntent } from './intents';

/**
 * Les trois actions possibles sur un point, partagées entre la ligne de la
 * liste et les boutons flottants posés sur l'image.
 *
 * Elles n'agissent pas : elles annoncent. Les deux porteurs disaient auparavant
 * la même chose chacun de son côté, avec le risque d'en voir un dériver.
 */
export function pointActions(
    host: HTMLElement,
    intent: PointIntent,
    variant?: ButtonVariant,
): HTMLButtonElement[] {
    const numero = String(intent.number);
    const actions: Button[] = [
        {
            icon: '🖼️',
            label: "Sur l'image",
            ariaLabel: `Déplacer le point ${numero} sur l'image`,
            action: () => {
                emitIntent(host, 'move-point-on-image', intent);
            },
        },
        {
            icon: '🗺️',
            label: 'Sur la carte',
            ariaLabel: `Déplacer le point ${numero} sur la carte`,
            action: () => {
                emitIntent(host, 'move-point-on-carte', intent);
            },
        },
        {
            icon: '🗑️',
            label: 'Supprimer',
            ariaLabel: `Supprimer le point ${numero}`,
            action: () => {
                emitIntent(host, 'delete-point', intent);
            },
            danger: true,
        },
    ];
    return actions.map((action) =>
        createButton(variant === undefined ? action : { ...action, variant }),
    );
}
