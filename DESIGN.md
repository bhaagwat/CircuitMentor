# CircuitMentor — Design System

Apple HIG–inspired (iOS/macOS), **dark-only, black & blue**. Source of truth in code: `tokens.css`. This file explains the rules; if a value here disagrees with `tokens.css`, update one of them the same day.

## 1. Principles

| | |
|---|---|
| **Clarity** | The circuit is the content. Wires and pins stay crisp at every zoom; chrome stays quiet. |
| **Deference** | Mentor and inspector float over the workspace as translucent panels; they never compete with the canvas. |
| **Depth** | Hierarchy comes from lighter surfaces and blur, not heavy shadows. Higher layer = lighter surface. |

One primary action per view. One accent hue (blue). Color is never the only signal.

## 2. Color

```css
:root {
  /* surfaces: each layer up is lighter */
  --cm-bg:        #0A0B0E;   /* app + canvas backdrop */
  --cm-surface-1: #111318;   /* rails, toolbars */
  --cm-surface-2: #181B22;   /* cards, inspector */
  --cm-surface-3: #20242D;   /* popovers, menus, modals */

  /* text */
  --cm-text:      #F5F5F7;   /* > 15:1 on bg */
  --cm-text-2:    #A1A6B2;
  --cm-text-3:    #6B7080;   /* placeholder / disabled only */

  /* accent (single hue) */
  --cm-accent:        #0071E3;   /* fills: buttons, selection. white text on it ≈ 4.7:1 */
  --cm-accent-hover:  #1A82EE;
  --cm-accent-press:  #005BB8;
  --cm-accent-text:   #4DA3FF;   /* blue TEXT/links on dark: ≈ 7.5:1 (#0071E3 on bg is only ≈ 4.2:1) */
  --cm-accent-subtle: rgba(0, 113, 227, 0.16);

  /* status */
  --cm-ok:   #30D158;
  --cm-warn: #FFD60A;
  --cm-err:  #FF453A;

  --cm-line:        rgba(255, 255, 255, 0.08);
  --cm-line-strong: rgba(255, 255, 255, 0.16);

  /* wires (canvas domain) */
  --cm-wire-vcc:    #FF453A;
  --cm-wire-gnd:    #8E8E93;
  --cm-wire-signal: #4DA3FF;
  --cm-wire-active: #FFD60A;
}
```

Rule: filled accent = background only. Blue text uses `--cm-accent-text`.

## 3. Type

```css
--cm-font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif;
--cm-mono: ui-monospace, "SF Mono", "JetBrains Mono", monospace;
```

| Role | Size / weight / line | Use |
|---|---|---|
| Title | 24 / 600 / 1.25 | panel + page headers |
| Headline | 15 / 600 / 1.3 | card titles, part names |
| Body | 14 / 400 / 1.5 | chat, descriptions |
| Caption | 12 / 400 / 1.4 | pin labels, metadata |
| Code | 13 / 500 / 1.5 mono | firmware, values, net names |

Use `rem` so browser text-size settings scale the UI. Tabular numerals (`font-variant-numeric: tabular-nums`) for component values and counters.

## 4. Space & shape

Spacing (px): 2 · 4 · 8 · 12 · 16 · 24 · 40 · 64.

**Concentric radius:** inner radius = outer radius − padding. A 20px panel with 8px padding holds 12px children. Scale: 8 (inputs, chips) · 12 (cards, bubbles) · 20 (panels, modals) · pill (primary buttons).

Shell: left rail (library) · center canvas (full-bleed) · right dock (inspector / mentor, collapsible). Below 768px the app shows the existing small-screen notice; don't squeeze the editor.

## 5. Materials & motion

```css
.cm-panel {
  background: rgba(24, 27, 34, 0.72);
  backdrop-filter: blur(24px) saturate(160%);
  border: 1px solid var(--cm-line);
  border-radius: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}
```
Panels only: mentor, inspector, floating toolbars, command palette. **Never on the canvas.**

```css
--cm-ease-out:    cubic-bezier(0.23, 1, 0.32, 1);   /* entering / responding to input */
--cm-ease-move:   cubic-bezier(0.77, 0, 0.175, 1);  /* things moving across the screen */
--cm-ease-sheet:  cubic-bezier(0.32, 0.72, 0, 1);   /* drawers */
--cm-dur-press: 120ms; --cm-dur-pop: 200ms; --cm-dur-modal: 280ms;
```

- Animate `transform` and `opacity` only; never `transition: all`.
- Press feedback: `scale(0.97)`, 120ms, ease-out.
- Exits are faster than entrances (≈ 60–70%).
- Dragging parts and drawing wires track the pointer directly (no tween delay).
- Shortcut-driven actions (delete, undo, duplicate, nudge) have **no animation**.
- Mentor text streams in place; only the bubble fades in once (160ms).
- `prefers-reduced-motion`: keep color/opacity changes, drop transforms and pulses.

## 6. Components

| Component | Spec |
|---|---|
| **Primary button** | `--cm-accent` fill, white text, pill, min height 36px (44px hit area), hover brighten, press scale. One per view. |
| **Secondary / ghost** | transparent, `--cm-line-strong` border / text-only `--cm-accent-text`. |
| **Card** | `--cm-surface-2`, `--cm-line` border, 12px radius, border brightens on hover. |
| **Student bubble** | right-aligned, `--cm-accent-subtle` fill. |
| **Mentor bubble** | left-aligned, `--cm-surface-3`; level badge (1–3) as a caption pill above it. |
| **Context chip** | caption size, `--cm-surface-3`, shows what the mentor sees ("3 parts · 1 warning"). |
| **Command palette** | `.cm-panel`, 12px radius rows, selected row `--cm-accent-subtle`. |

### Canvas states

| Element | Default | Hover | Selected | Problem |
|---|---|---|---|---|
| Part | `--cm-text-2` stroke | stroke → `--cm-accent-text` | accent stroke + subtle halo, pins enlarge | `--cm-err`/`--cm-warn` halo + icon (ERC hover) |
| Pin | hollow, `--cm-text-3` | filled accent, 12px hit radius | — | — |
| Wire | 2px, by net: vcc / gnd / signal | 3px | 3px `--cm-wire-active` | dashed error color |

### ERC severity

| Severity | Color | Glyph |
|---|---|---|
| Error | `--cm-err` | ● filled circle with ✕ |
| Warning | `--cm-warn` | ▲ triangle |
| Info | `--cm-accent-text` | ⓘ |

Always glyph + color + text; never color alone.

## 7. Accessibility checklist

- [ ] Text ≥ 4.5:1 (body) / 3:1 (large); verify any new pairing
- [ ] Targets ≥ 44px (pins: enlarge the invisible hit area, not the drawing)
- [ ] Keyboard: Tab through panels, arrows nudge selection, `?` shortcuts, `⌘K` palette, visible 2px `--cm-accent-text` focus ring
- [ ] Mentor stream container is `aria-live="polite"`
- [ ] Reduced-motion respected
- [ ] No light theme in v1; if added later, re-derive surfaces instead of inverting

## 8. Do / Don't

| Do | Don't |
|---|---|
| One blue for every interactive affordance | Add a second brand color |
| Lighter surfaces + blur for depth | Stack drop shadows |
| Full-contrast, full-opacity canvas | Blur or tint the circuit |
| System font, restrained scale | Display or decorative fonts |
| Short, ease-out transitions | Bounce, long fades, `ease-in` |
