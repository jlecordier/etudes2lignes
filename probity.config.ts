import { defineConfig, enforceTdd, forbidCommandPattern } from '@nizos/probity';

export default defineConfig({
    rules: [
        // **Plates, et pas dans le bloc `files` ci-dessous.** La doc le dit :
        // « Listed flat in `rules`, it runs against every action (writes and
        // commands) and self-filters; wrapped in a `{ files, rules }` block, the
        // `files` glob narrows writes **by path**. » Une règle de commande
        // rangée dans le bloc ne s'appliquerait donc jamais.
        //
        // Pourquoi elles existent : `enforceTdd` « applies exclusively to write
        // actions » — il ne regarde pas les commandes. Le trou est par
        // conception, et trois agents de ce dépôt l'ont cherché, l'un en
        // écrivant un `cat > … << EOF`, un autre en mutant les sources pour
        // éprouver une hypothèse. Aucun n'a abouti, mais aucun n'a été arrêté
        // par l'outil : c'est le classificateur de permissions, puis une
        // relecture, qui les ont vus. Ces deux règles rendent le refus explicite
        // et donnent la conduite à tenir.
        forbidCommandPattern({
            match: />>?\s*(\.\/)?src\//,
            reason:
                "Écrire dans src/ par une redirection shell contourne la règle TDD, qui ne surveille qu'Edit et Write. " +
                "Sers-toi d'Edit ou de Write. Si l'un des deux te refuse une écriture, c'est que l'incrément est trop gros : découpe-le, ou arrête-toi et remonte le refus tel quel.",
        }),
        forbidCommandPattern({
            match: /\b(tee|sed\s+-i|perl\s+-i)\b[^|;&]*\bsrc\//,
            reason:
                "Modifier un fichier de src/ en place contourne la règle TDD, qui ne surveille qu'Edit et Write. " +
                "Passe par Edit. Et pour prouver qu'un test discrimine, sonde son assertion ou ses entrées plutôt que de muter le code de production.",
        }),
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
