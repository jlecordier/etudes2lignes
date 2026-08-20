/**
 * Refuse à WebKit le pincement de page.
 *
 * `user-scalable=no` dans le viewport est ignoré par Safari iOS depuis iOS 10,
 * et `touch-action` sur `body` ne couvre pas tout : le seul levier qui reste est
 * `gesturestart`, un événement **non standard** que WebKit émet seul au monde
 * quand deux doigts commencent un pincement ou une rotation. L'annuler annule le
 * geste entier — inutile de guetter `gesturechange` en plus.
 *
 * Un `addEventListener` nu, et non un flux : il n'y a ici ni cadence, ni
 * fraîcheur, ni concurrence — les trois sujets de l'ADR 0009 — et l'écouteur vit
 * aussi longtemps que la page. Rien à défaire, donc rien à rendre.
 *
 * Le type de l'événement n'est pas déclaré dans `WindowEventMap` : la surcharge
 * `(type: string, listener)` d'`addEventListener` rend déjà un `Event`, qui porte
 * `preventDefault`. Une augmentation n'apporterait aucune garantie de plus.
 */
export function blockPinchZoom(target: EventTarget): void {
    target.addEventListener('gesturestart', (event) => {
        event.preventDefault();
    });
}
