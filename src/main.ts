/**
 * Composition root : c'est le seul fichier qui connaît les adapters concrets.
 * Il les instancie, les injecte dans les écrans, et démarre l'application.
 */
import './style.css';
import { afficherEcran } from './navigation';
import { IdbTrajetRepository } from './trajets/adapters/IdbTrajetRepository';
import { creerListeTrajetsScreen } from './trajets/ui/ListeTrajetsScreen';

function demarrer(): void {
  const repository = new IdbTrajetRepository();

  const listeTrajets = creerListeTrajetsScreen({
    repository,
    surOuverture: () => afficherEcran('editeur'),
  });

  afficherEcran('liste');
  void listeTrajets.afficher();
}

demarrer();
