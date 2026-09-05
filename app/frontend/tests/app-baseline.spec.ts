import { type Page, type Route, expect, test } from '@playwright/test';

const conversationFixture = {
  id: '00000000-0000-0000-0000-000000000002',
  title: 'Baseline conversation',
  created_at: '2026-01-15T12:00:00Z',
  updated_at: '2026-01-15T12:00:00Z',
  preview: 'Baseline message',
  messages: [
    {
      id: '00000000-0000-0000-0000-000000000006',
      conversation_id: '00000000-0000-0000-0000-000000000002',
      role: 'assistant',
      content: 'Baseline response.',
      created_at: '2026-01-15T12:00:00Z',
      sources: [],
    },
  ],
};

async function captureView(page: Page, name: string) {
  await expect(page.locator('body')).toMatchAriaSnapshot({
    name: `${name}.aria.yml`,
  });
  await expect(page).toHaveScreenshot(`${name}.png`, {
    fullPage: true,
    animations: 'disabled',
  });
}

async function mockJsonRoute(page: Page, url: string, body: unknown, method?: string) {
  await page.route(url, async (route: Route) => {
    if (method && route.request().method() !== method) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

test('captures public views and patients workflow', async ({ page }) => {
  await page.clock.install({ time: '2026-01-15T12:00:00Z' });
  await page.goto('/login');
  await captureView(page, 'login');
  await page.getByRole('link', { name: 'Regístrate' }).click();
  await expect(page.getByRole('heading', { name: 'Crear cuenta' })).toBeVisible();
  await captureView(page, 'signup');
  await page.getByRole('link', { name: 'Iniciar sesión' }).click();

  await page.goto('/patients');
  await expect(page.getByRole('heading', { name: 'Pacientes', exact: true })).toBeVisible();
  await captureView(page, 'patients');

  await page.getByRole('button', { name: '+ Nuevo paciente' }).click();
  const patientDialog = page.getByRole('dialog', { name: 'Nuevo paciente' });
  await expect(patientDialog).toBeVisible();
  await captureView(page, 'patients-new-patient-dialog');

  await patientDialog.getByLabel('Nombre').fill('Baseline');
  await patientDialog.getByLabel('Apellido').fill('Validation');
  const rutInput = patientDialog.getByLabel('RUT');
  const birthDateInput = patientDialog.getByLabel('Fecha de nacimiento');
  await rutInput.fill('12.345.678-5');
  await rutInput.press('Tab');
  await expect(birthDateInput).toBeFocused();
  await birthDateInput.fill('31/02/2024');
  await patientDialog.getByRole('button', { name: 'Crear paciente' }).click();
  await expect(patientDialog.getByRole('alert')).toContainText('Ingresa la fecha');
  await patientDialog.getByRole('button', { name: 'Cancelar' }).click();

  const patientLink = page.locator('main a[href^="/patients/"]').first();
  await expect(patientLink).toBeVisible();
  const patientHref = await patientLink.getAttribute('href');
  if (!patientHref) throw new Error('Seeded patient link did not expose an href.');

  await patientLink.click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Evolución dental' })).toBeVisible();
  await captureView(page, 'patient-detail');

  await page.getByRole('link', { name: /Nueva evolución/ }).click();
  await expect(page.getByRole('heading', { name: 'Nueva evolución dental' })).toBeVisible();
  await captureView(page, 'new-evolution-empty');

  await mockJsonRoute(
    page,
    '**/api/evolutions/generate',
    {
      context: 'Consulta de control.',
      findings: 'Hallazgo de baseline.',
      assessment: 'Impresión clínica de baseline.',
      treatment: 'Conducta de baseline.',
      follow_up: 'Control posterior.',
      review_flags: [],
    },
    'POST',
  );
  await page
    .getByLabel('Nota clínica')
    .fill('Paciente de baseline para validar el flujo de redacción.');
  await page.getByRole('button', { name: 'Redactar con IA' }).click();
  await expect(page.getByRole('button', { name: 'Guardar evolución' })).toBeEnabled();
  await captureView(page, 'new-evolution-review');

  await page.getByLabel('Hallazgos').fill('Cambio local para validar regeneración.');
  await page.getByRole('button', { name: 'Corregir nota y regenerar', exact: true }).click();
  await page.getByRole('button', { name: 'Regenerar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Regenerar evolución' })).toBeVisible();
  await captureView(page, 'new-evolution-regeneration-dialog');
  await page.getByRole('button', { name: 'Cancelar' }).click();

  await page.getByRole('link', { name: /Volver a/ }).click();
  await expect(page.getByRole('heading', { name: '¿Salir sin guardar?' })).toBeVisible();
  await captureView(page, 'new-evolution-leave-dialog');
  await page.getByRole('button', { name: 'Continuar editando' }).click();
  await page.getByRole('link', { name: /Volver a/ }).click();
  await page.getByRole('button', { name: 'Salir sin guardar' }).click();
  await expect(page).toHaveURL(
    new RegExp(`${patientHref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?$`),
  );

  const evolutionLink = page.getByRole('link', { name: /Ver evolución del/ }).first();
  await expect(evolutionLink).toBeVisible();
  await evolutionLink.click();
  await expect(page.getByRole('heading', { name: 'Evolución dental' })).toBeVisible();
  await expect(page).toHaveURL(/\/patients\/.+\/evolutions\/.+$/);
  await expect(page.locator('.patient-workspace__history')).toBeVisible();
  await expect(page.locator('.patient-workspace__detail')).toBeVisible();
  await captureView(page, 'evolution-detail');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.patient-workspace__history')).toBeHidden();
  await expect(page.getByRole('link', { name: /Volver a/ })).toBeVisible();

  await page.goto('/chat');
  const mobileMenu = page.getByRole('button', { name: 'Abrir navegación' });
  await mobileMenu.click();
  await expect(page.getByRole('button', { name: 'Cerrar navegación' })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar navegación' }).click();
  await expect(page).toHaveURL(/\/chat$/);
  await expect(mobileMenu).toBeVisible();
});

test('captures chat, library, admin, and not-found behaviors', async ({ page }) => {
  await page.clock.install({ time: '2026-01-15T12:00:00Z' });
  await page.goto('/chat');
  await expect(page.getByPlaceholder(/Ask anything about the video library/)).toBeVisible();
  await captureView(page, 'chat-empty');

  const starter = page.getByRole('button', { name: /How do I use subagents/ });
  await starter.click();
  await expect(page.getByPlaceholder(/Ask anything about the video library/)).toHaveValue(
    /How do I use subagents/,
  );

  const conversationItem = page.locator('#app-sidebar .conversation-item').first();
  await expect(conversationItem).toBeVisible();
  await conversationItem.getByRole('button').click();
  await expect(page).toHaveURL(/\/c\/.+$/);
  await conversationItem.hover();
  await page.getByRole('button', { name: 'Renombrar conversación', exact: true }).click();
  const renameInput = conversationItem.getByRole('textbox');
  await expect(renameInput).toBeVisible();
  await renameInput.press('Escape');
  await conversationItem.hover();
  await page.getByRole('button', { name: 'Eliminar conversación', exact: true }).click();
  await expect(page.getByText('¿Eliminar conversación?')).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).click();

  await mockJsonRoute(page, '**/api/conversations', conversationFixture, 'POST');
  await mockJsonRoute(
    page,
    '**/api/conversations/00000000-0000-0000-0000-000000000002',
    conversationFixture,
  );
  await page.getByRole('button', { name: 'Nuevo chat' }).click();
  await expect(page).toHaveURL(/\/c\/00000000-0000-0000-0000-000000000002$/);
  await expect(page.getByText('Baseline response.')).toBeVisible();
  await captureView(page, 'chat-conversation');

  await page.getByRole('button', { name: 'Explorar biblioteca de videos' }).click();
  const library = page.getByRole('dialog', { name: 'Video Knowledge Base' });
  await expect(library).toBeVisible();
  await expect(library.getByRole('heading', { name: 'Video Library' })).toBeVisible();
  await captureView(page, 'video-library');
  const videoSearch = library.getByRole('searchbox', { name: 'Search videos' });
  await videoSearch.fill('baseline');
  await expect(library).toBeVisible();
  await captureView(page, 'video-library-search');
  await library.getByRole('button', { name: /Add Video/ }).click();
  await expect(page.getByRole('heading', { name: 'Add New Video' })).toBeVisible();
  await captureView(page, 'video-library-add-dialog');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Close video library' }).click();

  await mockJsonRoute(
    page,
    '**/api/admin/videos',
    {
      video_id: '00000000-0000-0000-0000-000000000003',
      chunks_created: 1,
      status: 'completed',
    },
    'POST',
  );
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Administración de biblioteca' })).toBeVisible();
  await expect(page.getByRole('link', { name: '← Volver al chat' })).toHaveAttribute(
    'href',
    '/chat',
  );
  await captureView(page, 'admin-videos');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText('Desliza horizontalmente para ver las acciones.')).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.getByRole('button', { name: '+ Agregar video por URL' }).click();
  const addVideoDialog = page.getByRole('dialog', {
    name: 'Agregar video por URL',
  });
  await expect(addVideoDialog).toBeVisible();
  await captureView(page, 'admin-add-video-dialog');
  await addVideoDialog
    .getByPlaceholder(/youtube\.com/)
    .fill('https://www.youtube.com/watch?v=baseline');
  await addVideoDialog.getByRole('button', { name: 'Cancelar' }).click();

  await mockJsonRoute(
    page,
    '**/api/admin/videos/sync-channel',
    {
      sync_run_id: '00000000-0000-0000-0000-000000000004',
      status: 'completed',
      videos_total: 1,
      videos_new: 0,
      videos_error: 0,
    },
    'POST',
  );
  await mockJsonRoute(
    page,
    '**/api/admin/videos/*/re-sync',
    {
      video_id: '00000000-0000-0000-0000-000000000005',
      chunks_created: 1,
      status: 'completed',
    },
    'POST',
  );
  await mockJsonRoute(page, '**/api/admin/videos/*', {}, 'DELETE');
  await page.getByRole('button', { name: 'Sincronizar canal' }).click();
  await expect(page.getByRole('button', { name: 'Sincronizar canal' })).toBeEnabled();

  const firstVideoRow = page.locator('tbody tr').first();
  await expect(firstVideoRow).toBeVisible();
  await firstVideoRow.getByRole('button', { name: 'Sincronizar' }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await firstVideoRow.getByRole('button', { name: 'Eliminar' }).click();

  await page.goto('/this-route-does-not-exist');
  await expect(page.getByText('Página no encontrada')).toBeVisible();
  await captureView(page, 'not-found');
});
