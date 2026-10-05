---
name: Dental AI Assistant
description: A quiet, dark clinical workbench with clear blue signals and human-reviewed workflows.
colors:
  midnight-ink: "#0a0a0f"
  slate-surface: "#111827"
  lifted-slate: "#1e293b"
  quiet-divider: "rgba(255, 255, 255, 0.08)"
  clear-signal-blue: "#3b82f6"
  deep-signal-blue: "#1d4ed8"
  patient-message-blue: "#2563eb"
  blue-focus-halo: "rgba(59, 130, 246, 0.3)"
  primary-text: "#f1f5f9"
  secondary-text: "#94a3b8"
  tertiary-text: "#7f8ea3"
  pure-white: "#ffffff"
  success-green: "#10b981"
  danger-red: "#ef4444"
  error-rose: "#fca5a5"
  warning-amber: "#f59e0b"
  warning-wash: "rgba(245, 158, 11, 0.12)"
  warning-edge: "rgba(245, 158, 11, 0.35)"
  code-ink: "#0d1117"
typography:
  headline:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.25
  title:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.2
  code:
    fontFamily: "JetBrains Mono, 'Fira Code', monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  subtle: "6px"
  navigation: "7px"
  control: "8px"
  card: "10px"
  composer: "12px"
  artifact: "13px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.clear-signal-blue}"
    textColor: "{colors.pure-white}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "42px"
  button-clinical-primary:
    backgroundColor: "{colors.clear-signal-blue}"
    textColor: "{colors.pure-white}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "40px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.secondary-text}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "40px"
  clinical-field:
    backgroundColor: "rgba(0, 0, 0, 0.12)"
    textColor: "{colors.primary-text}"
    rounded: "{rounded.control}"
    padding: "9px 10px"
  patient-search:
    backgroundColor: "transparent"
    textColor: "{colors.primary-text}"
    padding: "9px 10px"
  nav-item-active:
    backgroundColor: "rgba(255, 255, 255, 0.08)"
    textColor: "{colors.primary-text}"
    rounded: "{rounded.navigation}"
    padding: "6px 8px"
    height: "32px"
  composer:
    backgroundColor: "{colors.slate-surface}"
    textColor: "{colors.primary-text}"
    rounded: "{rounded.composer}"
    padding: "6px 12px"
    height: "56px"
  clinical-artifact:
    backgroundColor: "{colors.slate-surface}"
    textColor: "{colors.primary-text}"
    rounded: "{rounded.artifact}"
    padding: "0"
  patient-history-selected:
    backgroundColor: "rgba(59, 130, 246, 0.1)"
    textColor: "{colors.primary-text}"
    rounded: "{rounded.control}"
    padding: "16px 12px"
  toast:
    backgroundColor: "{colors.slate-surface}"
    textColor: "{colors.primary-text}"
    rounded: "{rounded.card}"
    padding: "12px 14px"
---

# Design System: Dental AI Assistant

## Overview

**Creative North Star: "The Quiet Clinical Workbench"**

The interface organizes clinical work around content and action rather than spectacle. A near-black canvas and cool slate layers hold focused patient, assistant, and chat tasks; clear blue signals committed action, keyboard focus, and selected navigation. Inter keeps clinical reading direct; monospace appears only where technical data needs it.

Cards, forms, sidebars, and transcript share one workspace shell. Density stays compact but legible: labels recede, work text leads, and pane width shapes responsive composition. Depth comes from tonal surfaces and selective shadows. Visible focus stays distinct from selection, and motion follows the operating-system reduced-motion preference.

**Key Characteristics:**
- Dark ink canvas with layered blue-slate work surfaces.
- Clear blue reserved for action, focus, selection, and active navigation.
- Compact Inter hierarchy; monospace limited to code and technical values.
- Workspace and composer layouts follow the available pane, not only viewport width.
- State remains legible through text, symbols, and focus treatment—not color alone.

## Colors

The palette pairs blue signal accents with cool, low-chroma dark surfaces and soft, readable text.

### Primary
- **Clear Signal Blue:** Primary clinical actions, keyboard focus, selected controls, active rails, and brand mark.
- **Deep Signal Blue:** Hover/pressed brand accents and Drive primary-action hover.
- **Patient Message Blue:** User-authored chat bubbles; distinct from assistant content.

### Neutral
- **Midnight Ink:** Application canvas and code-reading background.
- **Slate Surface:** Sidebar, composer, patient containers, and default raised work areas.
- **Lifted Slate:** Secondary raised surfaces and grouped controls.
- **Quiet Divider:** Low-contrast borders and separators; use to structure, not decorate.
- **Primary Text / Secondary Text / Tertiary Text:** Clinical content, supporting metadata, and least-emphasized labels respectively.
- **Pure White:** Compact text and icon contrast on blue primary actions.
- **Code Ink:** Code blocks and syntax-reading surfaces.

### Status
- **Success Green:** Successful saves and completed actions.
- **Danger Red / Error Rose:** Destructive or failed states; reserve error rose for softer supporting copy.
- **Warning Amber:** Review-needed and caution states; the warning wash and edge form a restrained container.

**The Signal-Only Accent Rule.** Let neutral surfaces carry the screen. Use clear blue to identify action, focus, selection, and the active route—not as a decorative fill.

**The Status-Has-Text Rule.** Pair every status color with a symbol or plain status text. Never make color the only carrier of success, warning, or failure.

## Typography

**Display Font:** Inter (with system sans-serif fallbacks; no separate display face is used).
**Body Font:** Inter (with system sans-serif fallbacks).
**Label/Mono Font:** Inter for labels; JetBrains Mono with Fira Code fallback for code.

**Character:** Neutral, compact sans-serif keeps clinical content direct and scannable. A restrained monospace face separates code without turning technical details into decoration.

### Hierarchy
- **Headline:** Patient and page identity; concise, firm, and easy to scan.
- **Title:** Card, artifact, and section headings.
- **Body:** Clinical records and conversation prose; transcript paragraphs use more generous leading than controls.
- **Label:** Metadata, field names, status qualifiers, and compact overlines.
- **Code:** Inline and block code only; never use mono for general clinical copy.

**The One Voice Rule.** Use Inter throughout interface chrome and content. Introduce monospace only when content is code.

## Layout

The product is one dark workspace with a persistent navigation rail and a flexible main pane. The expanded desktop sidebar is 260px; collapsed desktop navigation keeps a 56px rail on Patients, Assistant, and Chat. The shared tooth mark links to `/patients` above the separate collapse control, and all three global destinations remain selectable. Mobile navigation becomes a drawer.

Conversation content is centered in the available main pane: Chat uses an 860px content measure and the Clinical Assistant uses 820px. Message text and composers track that pane when Google Drive or contextual clinical UI narrows it. The Drive divider follows pointer movement; its default workspace split is 68/32, document mode 56/44, and the accessory remains user-resizable. Closing Drive preserves its document state and leaves clinical work running. Opening and closing use a short spatial transition unless reduced motion is requested.

The main content grid changes with available space. Patient detail places history and selected record side by side when the container allows; narrow layouts return to a single-column flow. Evolution fields respond to their own container width, including inside contextual Assistant panels. On narrow Assistant panes, the return link and title stay together, patient context gets its own row, and secondary actions wrap below. Main content and composer remain centered inside their own pane.

Patients, Assistant, and Chat share the same sidebar order: Pacientes, Asistente, Chat; each surface puts its creation action and history below global navigation. Login and signup retain the same dark palette and tooth mark: clinical purpose pairs with the form on desktop and stacks above it on mobile. Clinical language leads; video-library chat remains secondary.

Keep touch controls at least 44px on coarse pointers. At narrow widths, preserve the mobile drawer and use full-width or stacked action layouts rather than compressing labels. Patient section/filter selection is separate from keyboard focus. Drive selection uses a filled tab; focus has its own visible outline.

## Elevation & Depth

Depth is primarily tonal: the ink canvas sits behind slate work surfaces, with borders defining adjacent regions. Shadows are reserved for floating composers, clinical artifacts, toasts, and other elements that need separation from scrolling content. Avoid a uniform shadow on every card.

### Shadow Vocabulary
- **Composer dock** (`0 10px 28px rgb(0 0 0 / 18%)`): Separates the fixed composer from transcript content.
- **Clinical artifact** (`0 12px 35px rgba(0, 0, 0, 0.18)`): Gives a reviewable draft a distinct, contained surface.
- **Toast** (`0 8px 32px rgba(0, 0, 0, 0.4)`): Holds a temporary notification above workspace content.
- **Jump-to-bottom control** (`0 8px 24px rgb(0 0 0 / 24%)`): Lifts a floating navigation action from the transcript.

**The Tone-Before-Shadow Rule.** Establish hierarchy with surface color and border first; add shadow only when an element floats above or must separate from adjacent content.

## Shapes

Controls use the shared control radius; patient containers use a softer card radius, and shared composers use a more generous edge. Clinical review artifacts keep their distinctive silhouette. Chips and status markers may be pill-shaped; do not apply pill geometry to ordinary buttons or fields.

Borders stay thin and subdued. Selection may add a blue edge or inset rail, while focus uses a separate visible outline. Source-note blocks use a single left edge and squared outer corners; keep anatomy and clinical tables aligned to their content rather than enclosing every row in a card.

## Components

### Buttons
- **Character:** Quiet and deliberate; actions remain clear without dominating clinical text.
- **Primary:** Solid clear blue with white label. Patient surfaces use the primary button token; clinical actions use the compact clinical-primary token.
- **Secondary:** Transparent or surface-backed, thin divider border, muted text.
- **Hover / Focus:** Use the existing darker blue hover where implemented. Keyboard focus is a 2px blue outline with offset; focus must never imply selection.
- **Disabled:** Reduce emphasis and remove pointer affordance; do not change label meaning.

### Chips
- **Style:** Compact status or filter labels on neutral surfaces; review/status color is paired with text or symbol.
- **State:** Selected tabs and filters receive a filled treatment; keyboard focus remains independently outlined.

### Cards / Containers
- **Patient workspace:** Slate surface, subtle border, card radius; history and detail retain their own scroll behavior at wide layouts.
- **Clinical artifact:** Dark, lightly graded surface with a fine edge and restrained shadow; content remains readable in its own container width.
- **Patient history:** Entries use a continuous timeline guide. Selection adds a blue edge/inset rail; hover remains quieter.
- **Internal padding:** Use established surface padding; compact controls may use less. Avoid forcing every container to share one density.

### Inputs / Fields
- **Style:** Clinical textareas use a dark inset fill, fine border, the shared control radius, and compact horizontal padding. Search inputs can sit borderless inside a bordered search row.
- **Focus:** Keep field focus visible; patient search and interactive controls use the explicit blue outline, and composers use the shared focus halo.
- **Responsive:** Fields and labels wrap by their own container width. On coarse pointers, form controls remain at least 44px high and text stays at a readable input size.
- **Editing:** Date fields combine direct entry with a calendar. Apply or cancel an evolution edit as one change.

### Navigation
- **Sidebar:** Shared global destinations appear before surface creation/history. Active navigation uses a soft neutral fill plus a narrow blue rail; hover and focus are separate states.
- **Responsive:** Desktop keeps the expanded sidebar or compact rail. Mobile uses the drawer and returns focus to its trigger when it closes.
- **Workspace header:** Keep clinical route navigation in the header copy region so it cannot overlap the sidebar restore control. In narrow panes, put patient context and compact secondary actions on their own rows.
- **Patient context:** Show masked RUT in the patient control; keep that control as the place to change patient. Align secondary action icons and labels horizontally.
- **Google Drive:** Selected sections use a filled tab; keyboard focus gets an independent outline.

**The Focus-Is-Not-Selection Rule.** A filled state marks the selected destination or filter; a visible outline marks keyboard position. Moving focus never selects a different section.

### Clinical Composer and Review Artifact
- Chat and Assistant composers share surface, border, radius, shadow, and focus treatment. The Assistant composer grows only for dictation or real document attachments.
- Without an active patient, label the composer as a general consultation; with a patient, label it as a clinical note. Keep empty-state copy consistent with that distinction.
- A selected Drive document appears as a named, removable attachment. Do not use “contexto” for a patient action or empty attachment slot.
- Contextual clinical panels use the existing workspace surfaces and composer. Closing a panel preserves work; the explicit Stop action cancels execution.
- Approval must read as a distinct clinician decision. A saved evolution says “Guardada en ficha”; Drive synchronization stays separate. Saved review flags say “observaciones”; pre-approval flags say “por revisar”.
- Evolution date and time display as `dd/mm/aaaa` and `HH:mm`, independent of browser locale.
- Draft-copy success appears only after clipboard access succeeds; on failure, keep the text selectable.

### Feedback and Waiting
- Toasts are fixed at the upper right, non-blocking, and readable for four seconds. Enter and exit use opacity and a small horizontal movement; reduced motion removes displacement and duration.
- Pending manual saves pair action text with the shared Spinner and `aria-busy`. A navigation guard owns the indicator while open; never show a duplicate spinner behind it.
- Keep action widths stable while waiting and constrained to the available pane.
- Clinical records show plain status text alongside symbols. Activity groups saved events by day on a continuous guide, links to exact resources, and identifies unavailable authors explicitly.

## Do's and Don'ts

### Do:
- **Do** use the semantic palette and composer tokens in `app/frontend/src/styles/globals.css`; mockup values are references, not a second source of truth.
- **Do** center conversation content and composers in the available pane, not only the browser viewport.
- **Do** keep patient context visible and use the shared brand mark across workspace surfaces.
- **Do** distinguish hover, selected, and keyboard-focus states; preserve a visible focus outline.
- **Do** pair status colors with text or symbols and keep clinical save status separate from Drive sync.
- **Do** respect reduced-motion preferences and keep coarse-pointer controls at least 44px high.

### Don't:
- **Don't** invent a second accent palette or use blue as decoration across large neutral surfaces.
- **Don't** communicate clinical status by color alone.
- **Don't** let selected state impersonate keyboard focus, or keyboard focus trigger a selection.
- **Don't** hide Drive state or cancel clinical work when its pane closes.
- **Don't** let clinical header actions collide with the sidebar restore control on narrow panes.
- **Don't** apply the same heavy shadow to every container.

Behavioral and safety priorities remain in `docs/design/UX_PRINCIPLES.md`.
