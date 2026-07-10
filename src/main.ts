/**
 * Composition root : c'est le seul fichier qui connaît les adapters concrets.
 * Il les instancie, les injecte dans les écrans, et démarre l'application.
 */
import './style.css';
import { LeafletSelecteurDeCoordonnee } from './carte/adapters/LeafletSelecteurDeCoordonnee';
import { afficherEcran } from './navigation';
import { IdbTrajetRepository } from './trajets/adapters/IdbTrajetRepository';
import { creerEditeurTrajetScreen } from './trajets/ui/EditeurTrajetScreen';
import { creerListeTrajetsScreen } from './trajets/ui/ListeTrajetsScreen';

function demarrer(): void {
  const repository = new IdbTrajetRepository();
  const selecteurDeCoordonnee = new LeafletSelecteurDeCoordonnee();

  const editeurTrajet = creerEditeurTrajetScreen({
    repository,
    selecteurDeCoordonnee,
    surRetour: () => {
      afficherEcran('liste');
      void listeTrajets.afficher();
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
