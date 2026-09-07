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

const secondConversationFixture = {
  id: '00000000-0000-0000-0000-000000000007',
  title: 'Second conversation',
  created_at: '2026-01-15T12:00:00Z',
  updated_at: '2026-01-15T12:00:00Z',
  preview: 'Second message',
  messages: [
    {
      id: '00000000-0000-0000-0000-000000000009',
      conversation_id: '00000000-0000-0000-0000-000000000007',
      role: 'assistant',
      content: 'Second hydrated response.',
      created_at: '2026-01-15T12:00:00Z',
      sources: [],
    },
  ],
};

const conversationListFixture = [
  {
    id: '00000000-0000-0000-0000-000000000002',
    title: 'Top conversation',
    created_at: '2026-01-15T12:00:00Z',
    updated_at: '2026-01-15T12:00:00Z',
    preview: 'Top message',
  },
  {
    id: '00000000-0000-0000-0000-000000000007',
    title: 'Middle conversation',
    created_at: '2026-01-15T12:00:00Z',
    updated_at: '2026-01-15T12:00:00Z',
    preview: 'Middle message',
  },
  {
    id: '00000000-0000-0000-0000-000000000008',
    title: 'Bottom conversation',
    created_at: '2026-01-15T12:00:00Z',
    updated_at: '2026-01-15T12:00:00Z',
    preview: 'Bottom message',
  },
];

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

  await patientDialog.getByLabel('Nombres').fill('Baseline');
  await patientDialog.getByLabel('Apellidos').fill('Validation');
  const rutInput = patientDialog.getByLabel('RUT');
  const birthDateInput = patientDialog.getByLabel('Fecha de nacimiento');
  await rutInput.fill('12.345.678-5');
  await rutInput.press('Tab');
  await expect(birthDateInput).toBeFocused();
  await birthDateInput.fill('31/02/2024');
  await patientDialog.getByRole('button', { name: 'Crear paciente' }).click();
  await expect(patientDialog.getByLabel('Fecha de nacimiento')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(patientDialog.getByText('Ingresa una fecha válida')).toBeVisible();
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
  await page.getByRole('button', { name: 'Generar borrador con IA' }).click();
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
  await expect(page.getByPlaceholder(/Pregunta sobre la biblioteca de videos/)).toBeVisible();
  await captureView(page, 'chat-empty');

  const starter = page.getByRole('button', { name: /How do I use subagents/ });
  await starter.click();
  await expect(page.getByPlaceholder(/Pregunta sobre la biblioteca de videos/)).toHaveValue(
    /How do I use subagents/,
  );

  const conversationItem = page.locator('#app-sidebar .conversation-item').first();
  await expect(conversationItem).toBeVisible();
  await conversationItem.getByRole('button', { name: 'Baseline conversation' }).click();
  await expect(page).toHaveURL(/\/c\/.+$/);
  await conversationItem.hover();
  await conversationItem
    .getByRole('button', { name: /acciones para baseline conversation/i })
    .click();
  await expect(page.getByRole('menu')).toBeVisible();
  await captureView(page, 'sidebar-conversation-menu');
  await page.getByRole('menuitem', { name: 'Renombrar' }).click();
  const renameInput = conversationItem.getByRole('textbox');
  await expect(renameInput).toBeVisible();
  await renameInput.press('Escape');
  await conversationItem.hover();
  await conversationItem
    .getByRole('button', { name: /acciones para baseline conversation/i })
    .click();
  await page.getByRole('menuitem', { name: 'Eliminar' }).click();
  await expect(page.getByRole('dialog', { name: '¿Eliminar conversación?' })).toBeVisible();
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

  const userMenuTrigger = page.getByRole('button', { name: /abrir menú de usuario/i });
  await userMenuTrigger.click();
  await expect(page.getByRole('menu')).toBeVisible();
  await captureView(page, 'sidebar-user-menu');
  await page.getByRole('menuitem', { name: /cerrar sesión/i }).press('Escape');

  await page.getByRole('button', { name: 'Biblioteca' }).click();
  const library = page.getByRole('dialog', { name: 'Biblioteca de videos' });
  await expect(library).toBeVisible();
  await expect(library.getByRole('heading', { name: 'Biblioteca de videos' })).toBeVisible();
  await captureView(page, 'video-library');
  const videoSearch = library.getByRole('searchbox', { name: 'Buscar videos' });
  await videoSearch.fill('baseline');
  await expect(library).toBeVisible();
  await captureView(page, 'video-library-search');
  await library.getByRole('button', { name: /Agregar video/ }).click();
  await expect(page.getByRole('heading', { name: 'Agregar video' })).toBeVisible();
  await captureView(page, 'video-library-add-dialog');
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await page.getByRole('button', { name: 'Cerrar biblioteca de videos' }).click();

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

test('keeps lower conversation menu actions visible', async ({ page }) => {
  await page.clock.install({ time: '2026-01-15T12:00:00Z' });
  await mockJsonRoute(page, '**/api/conversations', conversationListFixture, 'GET');
  await page.goto('/chat');

  const middleConversation = page.locator('#app-sidebar .conversation-item').nth(1);
  await expect(middleConversation).toBeVisible();
  await middleConversation.hover();
  await middleConversation
    .getByRole('button', { name: /acciones para middle conversation/i })
    .click();

  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: 'Renombrar' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Eliminar' })).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Eliminar' }).click();
  await expect(page.getByRole('dialog', { name: '¿Eliminar conversación?' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).click();
});

test('isolates concurrent conversation streams, stop, retry, and manual scroll', async ({ page }) => {
  await page.clock.install({ time: '2026-01-15T12:00:00Z' });
  await mockJsonRoute(page, '**/api/conversations', [conversationFixture, secondConversationFixture], 'GET');
  await mockJsonRoute(
    page,
    '**/api/conversations/00000000-0000-0000-0000-000000000002',
    conversationFixture,
  );
  await mockJsonRoute(
    page,
    '**/api/conversations/00000000-0000-0000-0000-000000000007',
    secondConversationFixture,
  );

  let releaseA!: () => void;
  const streamA = new Promise<void>((resolve) => {
    releaseA = resolve;
  });
  let releaseB!: () => void;
  const streamB = new Promise<void>((resolve) => {
    releaseB = resolve;
  });
  let aRequestCount = 0;

  await page.route(
    '**/api/conversations/00000000-0000-0000-0000-000000000002/messages',
    async (route) => {
      aRequestCount += 1;
      if (aRequestCount === 1) {
        await streamA;
        try {
          await route.fulfill({
            status: 200,
            contentType: 'text/event-stream',
            body: `data: ${JSON.stringify('Respuesta A')}\n\ndata: [DONE]\n\n`,
          });
        } catch {
          // The first A request is intentionally aborted by the test.
        }
        return;
      }

      if (aRequestCount === 2) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'A failed' }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: `data: ${JSON.stringify('Respuesta A recuperada')}\n\ndata: [DONE]\n\n`,
      });
    },
  );
  await page.route(
    '**/api/conversations/00000000-0000-0000-0000-000000000007/messages',
    async (route) => {
      await streamB;
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: `data: ${JSON.stringify(`Respuesta B de prueba\n\n${'Detalle clínico de B. '.repeat(120)}`)}\n\ndata: [DONE]\n\n`,
      });
    },
  );

  await page.goto('/c/00000000-0000-0000-0000-000000000002');
  const aRow = page.getByRole('button', { name: /Baseline conversation/ });
  const bRow = page.getByRole('button', { name: /Second conversation/ });
  const input = page.getByPlaceholder(/Pregunta sobre la biblioteca de videos/);
  await input.fill('Consulta A');
  await page.getByRole('button', { name: /enviar mensaje/i }).click();
  await expect(aRow).toHaveAttribute('aria-busy', 'true');

  await bRow.click();
  await expect(page).toHaveURL(/\/c\/00000000-0000-0000-0000-000000000007$/);
  await expect(aRow).toHaveAttribute('aria-busy', 'true');
  await expect(bRow).toHaveAttribute('aria-busy', 'false');

  await page.getByPlaceholder(/Pregunta sobre la biblioteca de videos/).fill('Consulta B');
  await page.getByRole('button', { name: /enviar mensaje/i }).click();
  await expect(bRow).toHaveAttribute('aria-busy', 'true');

  await aRow.click();
  await expect(page).toHaveURL(/\/c\/00000000-0000-0000-0000-000000000002$/);
  await expect(page.getByRole('button', { name: 'Detener respuesta' })).toBeVisible();
  await page.getByRole('button', { name: 'Detener respuesta' }).click();
  await expect(aRow).toHaveAttribute('aria-busy', 'false');
  await expect(bRow).toHaveAttribute('aria-busy', 'true');
  releaseA();

  await bRow.click();
  releaseB();
  await expect(page.getByText('Respuesta B de prueba')).toBeVisible();
  await expect(bRow).toHaveAttribute('aria-busy', 'false');

  const chatScroll = page.locator('.chat-message-scroll');
  await chatScroll.evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
  await expect(page.getByRole('button', { name: '↓ Ir al final' })).toBeVisible();
  await page.getByRole('button', { name: '↓ Ir al final' }).click();
  await expect(page.getByRole('button', { name: '↓ Ir al final' })).toBeHidden();

  await aRow.click();
  await page.getByPlaceholder(/Pregunta sobre la biblioteca de videos/).fill('Consulta con error');
  await page.getByRole('button', { name: /enviar mensaje/i }).click();
  await expect(aRow).toHaveAttribute('aria-busy', 'false');
  await expect(aRow.getByRole('img', { name: 'Error en la respuesta' })).toBeVisible();
  await expect(bRow.getByRole('img', { name: 'Error en la respuesta' })).toBeHidden();
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(aRow).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByText('Respuesta A recuperada')).toBeVisible();
  await expect(aRow.getByRole('img', { name: 'Error en la respuesta' })).toBeHidden();

  for (let index = 0; index < 10; index += 1) {
    await bRow.click();
    await expect(page).toHaveURL(/\/c\/00000000-0000-0000-0000-000000000007$/);
    await aRow.click();
    await expect(page).toHaveURL(/\/c\/00000000-0000-0000-0000-000000000002$/);
  }

  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.locator('.chat-message-scroll').evaluate((element) => getComputedStyle(element).scrollBehavior)).toBe(
    'auto',
  );
});

test('captures sidebar responsive states and preserves the rail contract', async ({ page }) => {
  const viewports = [
    { width: 1440, height: 900, name: '1440' },
    { width: 1280, height: 800, name: '1280' },
    { width: 1024, height: 768, name: '1024' },
    { width: 390, height: 844, name: '390' },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/chat');
    const sidebar = page.locator('#app-sidebar');
    await expect(sidebar).toBeVisible();

    if (viewport.width < 768) {
      await expect(sidebar).toHaveAttribute('aria-hidden', 'true');
      await page.getByRole('button', { name: 'Abrir navegación' }).click();
      await expect(sidebar).not.toHaveAttribute('aria-hidden');
      await expect(sidebar).toHaveScreenshot(`sidebar-mobile-${viewport.name}-open.png`, {
        animations: 'disabled',
      });
      await page.getByRole('button', { name: 'Cerrar navegación' }).click();
      await expect(sidebar).toHaveAttribute('aria-hidden', 'true');
    } else {
      await expect(sidebar).toHaveScreenshot(`sidebar-${viewport.name}-expanded.png`, {
        animations: 'disabled',
      });
      await sidebar.getByRole('button', { name: 'Colapsar navegación' }).click();
      await expect(sidebar).not.toHaveAttribute('aria-hidden');
      await expect(sidebar).toHaveClass(/collapsed/);
      await expect(sidebar).toHaveScreenshot(`sidebar-${viewport.name}-collapsed.png`, {
        animations: 'disabled',
      });
      await sidebar.getByRole('button', { name: 'Expandir navegación' }).click();
    }

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  }
});
