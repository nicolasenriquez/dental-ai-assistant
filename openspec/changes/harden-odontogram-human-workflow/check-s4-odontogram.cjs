// S4 spatial selection and compact editor. Requires the owned disposable app at localhost:8001.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { chromium, expect } = createRequire(path.resolve(__dirname, '../../../app/frontend/package.json'))('@playwright/test');

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 430, height: 932 },
  { width: 390, height: 844 },
];

async function main() {
  assert.equal(process.env.ODONTOGRAM_S4_DISPOSABLE, '1', 'Explicit disposable target acknowledgement required');
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: 'http://localhost:8001', viewport: VIEWPORTS[1] });
  const output = {
    layers: ['BROWSER', 'HTTP', 'real Postgres persistence'],
    viewports: [],
    assistant: {},
    resize: {},
    keyboard: {},
    states: {},
    finalConditionCount: null,
  };
  try {
    const api = context.request;
    const email = `s4-${randomUUID()}@example.com`;
    const password = randomUUID() + 'A1!';
    assert.equal((await api.post('/api/auth/signup', { data: { email, password } })).status(), 201);
    assert.equal((await api.post('/api/auth/login', { data: { email, password } })).status(), 200);
    const patientResponse = await api.post('/api/patients', {
      data: { first_name: 'Synthetic', last_name: 'Spatial S4', rut: '12345678-5' },
    });
    assert.equal(patientResponse.status(), 201);
    const patientId = (await patientResponse.json()).id;
    const conditionsBase = `/api/patients/${patientId}/conditions`;
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    await page.goto(`/patients/${patientId}?tab=clinical`);
    await expect(page.getByText('Cargando condiciones…')).toBeHidden();

    const chartMode = () =>
      page.evaluate(() => {
        const chart = document.querySelector('[aria-label="Odontograma"]');
        const quadrant = chart.querySelector('[data-quadrant-tooth]');
        const width = chart.getBoundingClientRect().width;
        return {
          width,
          narrow: !!quadrant && quadrant.getBoundingClientRect().width > 0,
          overflow: document.documentElement.scrollWidth > innerWidth,
          fdiSelects: ['chart-tooth', 'condition-tooth'].filter((id) => !!document.getElementById(id)),
        };
      });
    const measureTargets = () =>
      page.evaluate(() => {
        const chart = document.querySelector('[aria-label="Odontograma"]');
        const candidates = chart.querySelectorAll('button[data-quadrant-tooth], button[aria-label^="Pieza "]');
        const visible = [...candidates].filter((node) => node.getBoundingClientRect().width > 0);
        const undersized = visible.filter((node) => {
          const rect = node.getBoundingClientRect();
          return rect.width < 44 || rect.height < 44;
        }).length;
        const quadrantButtons = [...chart.querySelectorAll('[role="group"][aria-label^="Cuadrantes"] button')]
          .filter((node) => node.getBoundingClientRect().width > 0)
          .map((node) => ({ name: node.textContent.trim(), undersized: node.getBoundingClientRect().width < 44 || node.getBoundingClientRect().height < 44 }));
        return { visible: visible.length, undersized, quadrantButtons };
      });
    const reachableTeeth = async (dentition) => {
      const reached = new Set();
      const groups = page.locator(`[aria-label^="Cuadrantes ${dentition}"] button`);
      const count = await groups.count();
      for (let index = 0; index < count; index += 1) {
        await groups.nth(index).click();
        const teeth = page.locator(`[data-quadrant-tooth]`);
        const total = await teeth.count();
        for (let tooth = 0; tooth < total; tooth += 1) {
          const fdi = await teeth.nth(tooth).getAttribute('data-quadrant-tooth');
          if (fdi) reached.add(fdi);
        }
      }
      return reached;
    };
    const overlayTeeth = () =>
      page.evaluate(() =>
        [
          ...new Set(
            [...document.querySelectorAll('button:not([data-quadrant-tooth])[aria-label^="Pieza "]')]
              .filter((node) => node.getBoundingClientRect().width > 0)
              .map((node) => node.getAttribute('aria-label').match(/^Pieza (\d+):/)?.[1])
              .filter(Boolean),
          ),
        ],
      );
    // Idle + full first pass at 1440x900, saving a reviewed draft.
    await page.setViewportSize(VIEWPORTS[0]);
    await page.waitForTimeout(400);
    await expect(page.getByRole('heading', { name: 'Diagnóstico', exact: true })).toBeVisible();
    assert.equal(await page.getByRole('button', { name: 'Restauradora' }).count(), 0);
    await page.getByRole('button', { name: 'Caries', exact: true }).click();
    assert.equal(await page.getByLabel('Nota de condición').isVisible(), true);
    assert.equal(await page.getByRole('button', { name: 'Elegir pieza' }).isVisible(), true);
    await page.getByLabel('Seleccionar pieza FDI').selectOption('16');
    assert.equal(await page.getByRole('button', { name: 'Cambiar pieza' }).isVisible(), true);
    assert.match(await page.getByRole('complementary', { name: 'Editor de condición' }).innerText(), /Pieza 16/);
    assert.equal(await page.getByText('Sin superficies especificadas').isVisible(), true);
    await page.getByRole('checkbox', { name: 'Oclusal (O)' }).check();
    await page.getByLabel('Nota de condición').fill('S4 espacial');
    await page.getByRole('button', { name: 'Guardar condición', exact: true }).click();
    await expect(page.getByLabel('Nota de condición')).toBeHidden();
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.closest('article')?.getAttribute('aria-label')))
      .toMatch(/Pieza 16 · Caries · Activa/);
    assert.equal(await page.locator('#condition-tooth').count(), 0);

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(400);
      const mode = await chartMode();
      const targets = await measureTargets();
      assert.equal(mode.overflow, false, `no page overflow at ${viewport.width}`);
      assert.equal(mode.fdiSelects.length, 1, `single FDI context at ${viewport.width}`);
      if (mode.narrow) {
        assert.equal(targets.quadrantButtons.length, 4, `four named quadrant controls at ${viewport.width}`);
        assert.equal(targets.quadrantButtons.every((item) => !item.undersized), true);
      }
      assert.equal(targets.undersized, 0, `44px targets at ${viewport.width}`);
      const permanent = mode.narrow ? [...(await reachableTeeth('permanentes'))] : await overlayTeeth();
      assert.equal(permanent.length, 32, `all permanent FDI reachable at ${viewport.width}`);
      await page.getByRole('button', { name: 'Temporal', exact: true }).click();
      const primary = mode.narrow ? [...(await reachableTeeth('temporales'))] : await overlayTeeth();
      assert.equal(primary.length, 20, `all primary FDI reachable at ${viewport.width}`);
      await page.getByRole('button', { name: 'Permanente', exact: true }).click();
      output.viewports.push({
        viewport,
        chartWidth: mode.width,
        narrow: mode.narrow,
        quadrantButtons: targets.quadrantButtons,
        undersized: targets.undersized,
        permanentReachable: permanent.length,
        primaryReachable: primary.length,
        pageErrors: [...pageErrors],
      });
      await page.screenshot({ path: path.join(__dirname, `s4-odontogram-${viewport.width}.png`), fullPage: true });
    }

    // Whole-tooth compact editor and category heading at the last (narrow) size.
    await page.getByRole('button', { name: 'Ausente', exact: true }).click();
    assert.equal(await page.getByText('Pieza completa, sin superficies').isVisible(), true);
    assert.equal(await page.getByRole('checkbox', { name: 'Mesial (M)' }).count(), 0);
    output.states.wholeTooth = true;
    await page.getByRole('button', { name: 'Cancelar condición' }).click();
    await page.getByRole('button', { name: 'Descartar condición' }).click();

    // Selected FDI survives resize and quadrant switches without reselection.
    await page.setViewportSize(VIEWPORTS[5]);
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Caries', exact: true }).click();
    const mode = await chartMode();
    assert.equal(mode.narrow, true);
    await page.getByRole('button', { name: /Seleccionar pieza 16[:]/ }).click();
    assert.equal(await page.getByLabel('Seleccionar pieza FDI').inputValue(), '16');
    const quadrants = page.locator('[role="group"][aria-label="Cuadrantes permanentes"] button');
    await quadrants.filter({ hasText: 'Inferior izquierda' }).click();
    assert.equal(await page.getByLabel('Seleccionar pieza FDI').inputValue(), '16');
    await quadrants.filter({ hasText: 'Superior derecha' }).click();
    assert.equal(await page.getByLabel('Seleccionar pieza FDI').inputValue(), '16');
    await page.setViewportSize(VIEWPORTS[2]);
    await page.waitForTimeout(400);
    assert.equal(await page.getByLabel('Seleccionar pieza FDI').inputValue(), '16');
    assert.match(await page.getByRole('complementary', { name: 'Editor de condición' }).innerText(), /Pieza 16/);
    output.resize = { from: VIEWPORTS[5], to: VIEWPORTS[2], selectedFdiRetained: true };

    // Hover never mutates the draft; keyboard Space selects a piece.
    await page.setViewportSize(VIEWPORTS[2]);
    await page.waitForTimeout(400);
    const hoverMode = await chartMode();
    if (hoverMode.narrow) {
      await page
        .locator('[role="group"][aria-label="Cuadrantes permanentes"] button')
        .filter({ hasText: 'Superior izquierda' })
        .click();
    }
    assert.equal(await page.getByLabel('Seleccionar pieza FDI').inputValue(), '16');
    const hoverTarget = hoverMode.narrow
      ? page.getByRole('button', { name: /Seleccionar pieza 26[:]/ })
      : page.getByRole('button', { name: /Pieza 26:/ }).first();
    await hoverTarget.hover();
    assert.equal(await page.getByLabel('Seleccionar pieza FDI').inputValue(), '16');
    const keyboardTarget = hoverMode.narrow
      ? page.getByRole('button', { name: /Seleccionar pieza 26[:]/ })
      : page.getByRole('button', { name: /Pieza 26:/ }).first();
    await keyboardTarget.focus();
    await page.keyboard.press('Space');
    await expect(page.getByLabel('Seleccionar pieza FDI')).toHaveValue('26');
    assert.match(await page.getByRole('complementary', { name: 'Editor de condición' }).innerText(), /Pieza 26/);
    output.keyboard = { spaceSelectsPiece: true, hoverMutatesDraft: false };
    await page.getByRole('button', { name: 'Cancelar condición' }).click();
    await page.getByRole('button', { name: 'Descartar condición' }).click();

    // Desktop Assistant open/closed reflow at 1440/1280/1024.
    for (const viewport of VIEWPORTS.slice(0, 3)) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(400);
      const before = await chartMode();
      try {
        await page.getByRole('button', { name: 'Asistente', exact: true }).click();
        await expect(page.locator('[aria-label="Asistente del paciente"]')).toBeVisible({ timeout: 15000 });
        await page.waitForTimeout(400);
        const opened = await chartMode();
        const targets = await measureTargets();
        assert.equal(opened.overflow, false);
        assert.equal(targets.undersized, 0);
        await page.getByRole('button', { name: 'Cerrar asistente' }).click();
        await expect(page.locator('[aria-label="Asistente del paciente"]')).toBeHidden();
        output.assistant[viewport.width] = { before: before.width, open: opened.width, narrowWhenOpen: opened.narrow, ok: true };
      } catch (error) {
        output.assistant[viewport.width] = { before: before.width, ok: false, error: String(error) };
      }
    }

    output.finalConditionCount = (await (await api.get(conditionsBase)).json()).total;
    assert.equal(output.finalConditionCount, 1);
    assert.equal(pageErrors.length, 0);
    fs.writeFileSync(path.join(__dirname, 's4-browser.json'), JSON.stringify(output, null, 2) + '\n');
    console.log(JSON.stringify({ viewports: output.viewports, states: output.states, resize: output.resize, keyboard: output.keyboard, assistant: output.assistant, finalConditionCount: output.finalConditionCount }, null, 2));
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
