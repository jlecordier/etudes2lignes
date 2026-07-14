import { expect, test } from '@playwright/test';

test.describe('Gestion des trajets', () => {
    test('Étant donné une appli vierge, quand je crée un trajet, alors il apparaît dans la liste', async ({
        page,
    }) => {
        await page.goto('./');
        page.once('dialog', (dialogue) => void dialogue.accept('Paris → Bordeaux'));

        await page.getByRole('button', { name: 'Nouveau trajet' }).click();

        await expect(
            page.getByRole('button', { name: 'Paris → Bordeaux', exact: true }),
        ).toBeVisible();
        await expect(page.getByText('0 image(s) · 0 point(s)')).toBeVisible();
    });

    test('Étant donné un trajet, quand je le renomme, alors la liste montre le nouveau nom', async ({
        page,
    }) => {
        await page.goto('./');
        page.once('dialog', (dialogue) => void dialogue.accept('Paris → Bordeaux'));
        await page.getByRole('button', { name: 'Nouveau trajet' }).click();

        page.once('dialog', (dialogue) => void dialogue.accept('Bordeaux → Paris'));
        await page.getByRole('button', { name: 'Renommer' }).click();

        await expect(
            page.getByRole('button', { name: 'Bordeaux → Paris', exact: true }),
        ).toBeVisible();
    });

    test('Étant donné un trajet, quand je le supprime et confirme, alors la liste redevient vide', async ({
        page,
    }) => {
        await page.goto('./');
        page.once('dialog', (dialogue) => void dialogue.accept('Paris → Bordeaux'));
        await page.getByRole('button', { name: 'Nouveau trajet' }).click();
        await expect(
            page.getByRole('button', { name: 'Paris → Bordeaux', exact: true }),
        ).toBeVisible();

        page.once('dialog', (dialogue) => void dialogue.accept());
        await page.getByRole('button', { name: 'Supprimer' }).click();

        await expect(page.locator('#liste-vide')).toBeVisible();
        await expect(page.locator('#liste-vide')).toHaveText(
            "Aucun trajet pour l'instant. Créez-en un, puis importez les pages (images) de votre schéma de ligne.",
        );
        await expect(
            page.getByRole('button', { name: 'Paris → Bordeaux', exact: true }),
        ).toBeHidden();
    });

    test('Étant donné un trajet, quand je refuse la confirmation de suppression, alors il reste', async ({
        page,
    }) => {
        await page.goto('./');
        page.once('dialog', (dialogue) => void dialogue.accept('Paris → Bordeaux'));
        await page.getByRole('button', { name: 'Nouveau trajet' }).click();

        page.once('dialog', (dialogue) => void dialogue.dismiss());
        await page.getByRole('button', { name: 'Supprimer' }).click();

        await expect(
            page.getByRole('button', { name: 'Paris → Bordeaux', exact: true }),
        ).toBeVisible();
    });
});
