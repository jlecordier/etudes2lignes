/**
 * Composition root : c'est le seul fichier qui connaît les adapters concrets.
 * Il les instancie, les injecte dans les écrans, et démarre l'application.
 */
import './style.css';
import { LeafletSelecteurDeCoordonnee } from './carte/adapters/LeafletSelecteurDeCoordonnee';
import { afficherEcran } from './navigation';
import { SimulationPositionSource } from './suivi/adapters/SimulationPositionSource';
import type { EcranAllume } from './suivi/ports/EcranAllumePort';
import type { PositionSource } from './suivi/ports/PositionSource';
import { creerSuiviScreen } from './suivi/ui/SuiviScreen';
import { IdbTrajetRepository } from './trajets/adapters/IdbTrajetRepository';
import { creerEditeurTrajetScreen } from './trajets/ui/EditeurTrajetScreen';
import { creerListeTrajetsScreen } from './trajets/ui/ListeTrajetsScreen';

// Étape 7 : remplacés par les vrais adapters (GPS navigateur, wake lock).
const sourceGpsAVenir: PositionSource = {
  demarrer: (_surPosition, surErreur) =>
    surErreur('GPS non branché pour l’instant — utilisez « Simuler ».'),
  arreter: () => {},
};
const ecranAllumeMuet: EcranAllume = {
  maintenir: async () => {},
  relacher: async () => {},
};

function demarrer(): void {
  const repository = new IdbTrajetRepository();
  const selecteurDeCoordonnee = new LeafletSelecteurDeCoordonnee();

  const suivi = creerSuiviScreen({
    repository,
    sourceReelle: sourceGpsAVenir,
    simulation: new SimulationPositionSource(),
    selecteurDeCoordonnee,
    ecranAllume: ecranAllumeMuet,
    surRetour: (id) => {
      afficherEcran('editeur');
      void editeurTrajet.afficher(id);
    },
  });

  const editeurTrajet = creerEditeurTrajetScreen({
    repository,
    selecteurDeCoordonnee,
    surRetour: () => {
      afficherEcran('liste');
      void listeTrajets.afficher();
    },
    surSuivi: (id) => {
      afficherEcran('suivi');
      void suivi.afficher(id);
    },
  });

  const listeTrajets = creerListeTrajetsScreen({
    repository,
    surOuverture: (id) => {
      afficherEcran('editeur');
      void editeurTrajet.afficher(id);
    },
  });

  afficherEcran('liste');
  void listeTrajets.afficher();
}

demarrer();
