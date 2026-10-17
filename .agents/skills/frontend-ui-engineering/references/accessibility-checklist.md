---
type: checklist
title: Accessibility Checklist
description: WCAG 2.2-oriented accessibility verification reference for repository UI work.
okf_version: "0.1"
---

# Accessibility Checklist

Use this checklist with the `frontend-ui-engineering` skill. Treat WCAG 2.2,
WAI-ARIA Authoring Practices, and native platform semantics as the primary
references for accessibility behavior.

## Keyboard and focus

- [ ] Every interactive control is reachable and operable with the keyboard.
- [ ] Focus order follows the logical reading and task order.
- [ ] Focus is visible and is not removed by custom styling.
- [ ] Custom widgets support their required keyboard interactions.
- [ ] Users cannot become trapped inside a component.
- [ ] Dialog focus enters the dialog, remains appropriately contained, and
      returns to the invoking control when the dialog closes.
- [ ] Skip navigation is available where the page structure needs it.

## Semantics and announcements

- [ ] Use native HTML elements before adding ARIA roles.
- [ ] Every input has a programmatically associated label.
- [ ] Buttons, links, and icon-only controls have clear accessible names.
- [ ] Headings describe the document structure and do not skip levels without
      a valid structural reason.
- [ ] Images have useful alternative text or an empty alternative when
      decorative.
- [ ] Tables use a native table structure, a caption when needed, and headers
      that identify their columns or rows.
- [ ] Dynamic status changes use an appropriate status or alert mechanism.
- [ ] Errors identify the problem and provide a recovery path.

## Visual and layout

- [ ] Normal text meets a 4.5:1 contrast ratio; large text meets 3:1.
- [ ] User-interface components and meaningful graphics meet the applicable
      3:1 contrast requirement.
- [ ] Color is not the only carrier of meaning.
- [ ] Content remains usable at 200% text or page zoom.
- [ ] No content flashes more than three times per second.
- [ ] Text, controls, and data remain readable at narrow widths.
- [ ] The implementation respects `prefers-reduced-motion`.

## Target size

WCAG 2.2 AA SC 2.5.8 uses a 24 by 24 CSS-pixel minimum target-size baseline
with defined exceptions. Do not describe 44 by 44 pixels as a universal WCAG
AA requirement. A larger target can still be the repository's design choice
when it improves usability and does not damage density or layout.

## Forms and state

- [ ] Required fields are identified without relying on color alone.
- [ ] Validation occurs at a meaningful boundary and does not punish normal
      typing or correction.
- [ ] Field errors are specific, associated with their fields, and announced
      when needed.
- [ ] Submission errors have a clear summary or focus target when appropriate.
- [ ] Disabled and busy states are distinguishable and do not hide the reason
      an action is unavailable.
- [ ] Loading, empty, unavailable, and error states are distinct.
- [ ] Long-running operations expose progress or a usable pending state.

## Verification references

- WCAG 2.2: `https://www.w3.org/TR/WCAG22/`
- WAI-ARIA Authoring Practices: `https://www.w3.org/WAI/ARIA/apg/`
- Native table guidance:
  `https://www.w3.org/WAI/ARIA/apg/patterns/table/`
- Modal dialog guidance:
  `https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/`

Use the repository's supported lint, component, Storybook, and browser checks
for implementation verification. Do not assume that an automated checker
replaces keyboard, zoom, screen-reader, or reduced-motion review.

## Common anti-patterns

| Anti-pattern | Required correction |
| --- | --- |
| `div` used as a button | Use a native button or a fully equivalent accessible control. |
| Hover-only action | Provide focus, keyboard, touch, or always-visible access. |
| Color-only state | Add text, structure, iconography, or another non-color cue. |
| Missing dialog focus management | Follow the modal dialog focus and return rules. |
| Blank loading or error surface | Provide an identified state and recovery behavior. |
| Arbitrary `tabindex` values | Preserve natural document order; use only `0` or `-1` when needed. |
