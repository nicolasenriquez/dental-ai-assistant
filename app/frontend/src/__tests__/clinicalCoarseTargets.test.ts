/**
 * Coarse-pointer target check for the Assistant (tasks 13.1/13.2, audit F10).
 *
 * UX_PRINCIPLES: minimum 44px on coarse pointers, and the desktop toolbar stays
 * compact. The assistant already bumps every area control to 44px inside the
 * coarse media block, but `.workspace-header__actions > .clinical-secondary-button`
 * pins `height/min-height: 40px` with higher specificity, so the Pending (and
 * Drive) header controls stayed 40px under touch emulation. jsdom has no layout;
 * the real 360x800 coarse measurement stays in the 14.1 browser pass, and this
 * pins the declared contract behind it.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(path.join(process.cwd(), 'src', 'styles', 'globals.css'), 'utf8');

function ruleBody(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `missing CSS rule for ${selector}`).toBeGreaterThanOrEqual(0);
  const end = css.indexOf('\n}', start);
  return css.slice(start, end);
}

function mediaBlock(condition: string, needle: string): string {
  let from = 0;
  for (;;) {
    const start = css.indexOf(`@media ${condition} {`, from);
    if (start < 0) break;
    const body = css.slice(start, css.indexOf('\n}', start));
    if (body.includes(needle)) return body;
    from = start + 1;
  }
  return '';
}

const coarseBlock = mediaBlock('(pointer: coarse)', '.clinical-assistant-area');

describe('assistant coarse-pointer targets', () => {
  it('keeps every assistant control at 44px under coarse pointers', () => {
    expect(coarseBlock).toContain('.clinical-assistant-area :is(button, a)');
    expect(coarseBlock).toMatch(/min-height:\s*44px/);
  });

  it('raises the header override that beats the shared coarse rule', () => {
    expect(coarseBlock).toMatch(
      /\.clinical-assistant-area\s+\.workspace-header__actions\s*>\s*\.clinical-secondary-button/,
    );
  });

  it('keeps the desktop clinical toolbar compact', () => {
    expect(ruleBody('.clinical-primary-button,\n.clinical-secondary-button')).toMatch(
      /min-height:\s*40px/,
    );
    expect(ruleBody('.workspace-header__actions > .clinical-secondary-button')).toMatch(
      /height:\s*40px/,
    );
  });

  it('keeps the send and Stop target at 44px at any pointer', () => {
    expect(ruleBody('.chat-stop-button,\n.chat-send-button')).toMatch(/height:\s*44px/);
  });
});
