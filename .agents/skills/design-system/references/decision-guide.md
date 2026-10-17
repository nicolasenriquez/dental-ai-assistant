# Design-System Decision Guide

## Choose a token level

- Use a primitive when the value has no role.
- Use a register semantic token when the role is shared across multiple
  components in one surface.
- Use a component token only when it hides a stable component decision.
- Keep one-off illustration or scene values local to that scene.

## Rename safely

Keep the old name as a deprecation alias, document the replacement, regenerate
all adapters, and remove it only in a major version. Never silently repurpose a
semantic name for a different role.

## Review boundary

Design reviews intent and mode meaning. Frontend reviews runtime compatibility,
generated consumption, and visual regression evidence.
