/**
 * Port : la couture « la page revient au premier plan ».
 *
 * iOS et Android gèlent une page en arrière-plan : au dégel, une surveillance
 * GPS ou un verrou d'écran peuvent être morts sans le dire. C'est le seul
 * endroit qui sait quels événements du navigateur trahissent ce réveil.
 *
 * Contrat : `surRetourAuPremierPlan` abonne l'action aux réveils et rend son
 * désabonnement. Les réveils sont bruyants — un même retour en émet plusieurs,
 * et certains arrivent alors que la page est encore masquée : l'abonné vérifie
 * `estAuPremierPlan` avant d'agir, et débounce s'il paie cher son réveil.
 */
export interface PremierPlan {
    surRetourAuPremierPlan(action: () => void): () => void;
    estAuPremierPlan(): boolean;
}
