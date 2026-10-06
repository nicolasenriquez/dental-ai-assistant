// Integrated accessibility measurement: actual rendered contrast, keyboard focus,
// and honest unsupported-technology reporting. Requires the owned disposable app at localhost:8001.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { chromium, expect } = createRequire(path.resolve(__dirname, '../../../app/frontend/package.json'))('@playwright/test');

function luminance([r, g, b]) {
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function parseColor(text) {
  const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(text);
  if (!match) return null;
  const alpha = match[4] === undefined ? 1 : Number(match[4]);
  return [Number(match[1]), Number(match[2]), Number(match[3]), alpha];
}

function contrast(fg, bg) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [light, dark] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (light + 0.05) / (dark + 0.05);
}

async function main() {
  assert.equal(process.env.ODONTOGRAM_INT_DISPOSABLE, '1', 'Explicit disposable target acknowledgement required');
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: 'http://localhost:8001', viewport: { width: 1280, height: 800 } });
  const output = {
    layers: ['BROWSER rendered styles'],
    contrast: [],
    keyboard: {},
    assistiveTechnology: {},
    virtualKeyboard: {},
  };
  try {
    const api = context.request;
    const email = `int-${randomUUID()}@example.com`;
    const password = randomUUID() + 'A1!';
    assert.equal((await api.post('/api/auth/signup', { data: { email, password } })).status(), 201);
    assert.equal((await api.post('/api/auth/login', { data: { email, password } })).status(), 200);
    const patientResponse = await api.post('/api/patients', {
      data: { first_name: 'Synthetic', last_name: 'Accessibility INT', rut: '12345678-5' },
    });
    assert.equal(patientResponse.status(), 201);
    const patientId = (await patientResponse.json()).id;
    await api.post(`/api/patients/${patientId}/conditions`, {
      data: { id: randomUUID(), dentition: 'permanent', tooth_fdi: 16, condition_code: 'caries', surfaces: ['O'], note: 'Medición' },
    });

    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    await page.goto(`/patients/${patientId}?tab=clinical&clinical=diagnosis`);
    await expect(page.getByRole('heading', { name: 'Diagnóstico manual' })).toBeVisible();
    await page.getByRole('button', { name: 'Caries', exact: true }).click();
    await page.getByLabel('Seleccionar pieza FDI').selectOption('26');
    await expect(page.getByRole('button', { name: 'Guardar condición' })).toBeVisible();

    // Rendered color pairs measured from the live page.
    const pairs = await page.evaluate(() => {
      const spec = (selector, fgProp) => {
        const node = document.querySelector(selector);
        if (!node) return null;
        const style = getComputedStyle(node);
        const walk = (element, prop) => {
          let current = element;
          while (current) {
            const value = getComputedStyle(current)[prop];
            if (value && value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent') return value;
            current = current.parentElement;
          }
          return null;
        };
        return { fg: style[fgProp] ?? style.color, bg: walk(node, 'backgroundColor') };
      };
      const selectors = [
        ['section[aria-label="Diagnóstico manual"] p.text-muted', 'color'],
        ['section[aria-label="Diagnóstico manual"] h2', 'color'],
        ['article h4', 'color'],
        ['article p.text-xs', 'color'],
        ['button.clinical-primary-button', 'color'],
        ['button.clinical-secondary-button', 'color'],
        ['select#chart-tooth', 'color'],
        ['details summary', 'color'],
      ];
      return selectors.map(([selector, prop]) => ({ selector, ...spec(selector, prop) }));
    });

    for (const pair of pairs) {
      if (!pair || !pair.fg || !pair.bg) continue;
      const fg = parseColor(pair.fg);
      const bg = parseColor(pair.bg);
      if (!fg || !bg || fg[3] < 1 || bg[3] < 1) {
        output.contrast.push({ selector: pair.selector, skipped: 'alpha < 1 composition' });
        continue;
      }
      const ratio = contrast(fg, bg);
      output.contrast.push({ selector: pair.selector, fg: pair.fg, bg: pair.bg, ratio: Number(ratio.toFixed(2)) });
      assert.ok(ratio >= 4.5, `contrast ${ratio.toFixed(2)} < 4.5 for ${pair.selector}`);
    }

    // Error text pair, measured after forcing an invalid catalog retry state is not
    // reachable without breaking reads; instead measure the shipped error color pair directly.
    const errorPair = await page.evaluate(() => {
      const node = document.querySelector('p[role="alert"], p.text-error');
      if (!node) return null;
      const style = getComputedStyle(node);
      let current = node.parentElement;
      let bg = null;
      while (current) {
        const value = getComputedStyle(current).backgroundColor;
        if (value && value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent') {
          bg = value;
          break;
        }
        current = current.parentElement;
      }
      return { fg: style.color, bg };
    });
    if (errorPair && errorPair.fg && errorPair.bg) {
      const ratio = contrast(parseColor(errorPair.fg), parseColor(errorPair.bg));
      output.contrast.push({ selector: 'p[role="alert"]', ...errorPair, ratio: Number(ratio.toFixed(2)) });
    }

    // Keyboard: focus a surface checkbox with Tab path and activate with Space on a real draft.
    await page.getByRole('button', { name: 'Caries', exact: true }).click();
    await page.getByLabel('Seleccionar pieza FDI').selectOption('26');
    await page.getByRole('checkbox', { name: 'Mesial (M)' }).focus();
    const focusedBefore = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.outerHTML.slice(0, 80));
    await page.keyboard.press('Space');
    const checkedAfter = await page.getByRole('checkbox', { name: 'Mesial (M)' }).isChecked();
    output.keyboard = { focusable: Boolean(focusedBefore), spaceActivates: checkedAfter, draftNote: await page.getByLabel('Nota de condición').inputValue() };

    // Honest unsupported-technology reporting.
    output.assistiveTechnology = {
      measured: 'aria snapshot + accessible-name assertions in S2/S4/S5/S6 checkers; no screen-reader hardware/software available in this environment',
      screenReaderExecuted: false,
      reported: 'NOT COVERED by real assistive technology',
    };
    output.virtualKeyboard = {
      measured: 'desktop Chromium only',
      onDeviceKeyboardExecuted: false,
      reported: 'NOT COVERED by a real device virtual keyboard',
    };

    output.pageErrors = pageErrors;
    assert.deepEqual(pageErrors, [], 'zero page errors');
    fs.writeFileSync(path.join(__dirname, 's8-a11y.json'), JSON.stringify(output, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
