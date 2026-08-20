import { defineConfig, enforceTdd } from '@nizos/probity';

export default defineConfig({
    rules: [
        {
            files: ['src/**'],
            // Deux écarts aux défauts, décidés par l'auteur du dépôt après
            // mesure — pas par l'agent que la règle contraint.
            rules: [
                enforceTdd({
                    // Le défaut, 10, est trop court ici. La doc : « If a failing
                    // test falls outside this window, it won't appear in the
                    // validator's context, potentially causing the rule to
                    // reject the implementation. » Entre le rouge et l'écriture
                    // qu'il autorise, une tâche de ce dépôt passe par bien plus
                    // de dix événements — lire un brief, `pnpm test`, typecheck,
                    // lint. La fenêtre glissait, et la règle refusait alors en
                    // citant un état de tests périmé.
                    maxEvents: 40,
                    // Une écriture n'ajoutant **qu'un** test passe sans
                    // consulter l'IA. Sans ça, la règle de phase rouge
                    // s'appliquait à l'écriture du test lui-même, exigeant qu'il
                    // ait été vu échouer avant d'exister — insatisfiable.
                    //
                    // Le coût est connu et assumé : c'est à cette frontière
                    // vert → rouge que le validateur vérifiait qu'un refactor
                    // évident n'avait pas été laissé en plan. Ce sont les revues
                    // de tâche qui reprennent ce rôle.
                    fastPath: true,
                }),
            ],
        },
    ],
});
