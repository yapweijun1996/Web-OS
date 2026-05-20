# Vortex OS — macOS Design Guidelines (macOS Tahoe 26 / Liquid Glass)

This document is the design source of truth for aligning **Vortex OS** with the
latest macOS look and feel: **macOS Tahoe 26** and its **Liquid Glass** design
language (introduced at WWDC 2025, the unified material across iOS / iPadOS /
macOS 26).

It is written for a vanilla HTML/CSS/JS desktop — every rule below is given as a
concrete, CSS-translatable value so it can be implemented without a framework.

---

## 1. Design Principles (macOS Tahoe 26)

1. **Content first.** Chrome (menu bar, toolbars, sidebars) recedes; the user's
   content is the brightest, highest-contrast thing on screen.
2. **One material.** Translucent **Liquid Glass** is the single material for all
   floating surfaces — menu bar, Dock, windows chrome, popovers, Control Center.
3. **Depth through translucency, not borders.** Layers read as glass panes
   stacked over content, separated by blur, soft shadow, and a faint edge
   highlight — not by hard 1px lines or distinct fill colors.
4. **Concentric geometry.** Nested rounded rectangles share a common center of
   curvature: a child's corner radius = parent radius − the gap between them.
5. **Deference + legibility.** Translucency must never cost readability. Every
   glass surface has an accessible fallback (`prefers-reduced-transparency`).

---

## 2. Liquid Glass — the Core Material

Liquid Glass is a translucent surface that blurs and lightly tints the content
behind it, carries a soft specular edge highlight, and floats above content with
a diffuse shadow. Two variants:

| Variant | Use for | Opacity feel |
|---|---|---|
| **Regular** | Dense controls, window chrome, sidebars, Control Center | More opaque, content-legible |
| **Clear** | Media overlays, full-bleed transient UI | More transparent |

### CSS recipe — Regular Liquid Glass (dark UI)

```css
.lg-surface {
  background: rgba(40, 40, 42, 0.55);            /* translucent tint */
  backdrop-filter: blur(24px) saturate(180%);     /* the "glass" */
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 0.5px solid rgba(255, 255, 255, 0.12);  /* faint top-edge highlight */
  box-shadow:
    0 12px 40px rgba(0, 0, 0, 0.45),              /* diffuse drop shadow */
    inset 0 1px 0 rgba(255, 255, 255, 0.15);      /* inner specular highlight */
}
```

- **Blur 18–28px**, **saturate 160–200%** — the higher saturation is what makes
  it read as *glass* rather than flat frosting.
- **Edge highlight**: a `0.5px` light border + an `inset` top highlight. This is
  the specular cue; do not replace it with a hard `1px` border.
- **Tint**: dark UI ≈ `rgba(40,40,42,0.5–0.6)`; light UI ≈
  `rgba(245,245,247,0.6–0.7)`.

### Accessibility fallback (mandatory)

```css
@media (prefers-reduced-transparency: reduce) {
  .lg-surface {
    background: #2c2c2e;                 /* fully opaque */
    backdrop-filter: none;
  }
}
```

---

## 3. Geometry — Concentric Corner Radii

Tahoe formalizes **concentric corners**: a nested element's radius is derived
from its parent so both corners curve around the same point.

```
child_radius = parent_radius − gap_between_them
```

Radius token scale for Vortex OS:

| Token | Value | Applies to |
|---|---|---|
| `--r-window` | 12px | Window frame |
| `--r-panel` | 11px | Modals, popovers, Control Center |
| `--r-dock` | 22px | Dock slab |
| `--r-control` | 8px | Inputs, list rows, small tiles |
| `--r-capsule` | 999px | Buttons, segmented controls, pills |

Example: a button inside a panel padded by 14px → button radius ≈ `11 − 14`,
which clamps to a capsule (`999px`) since the content is short. List rows inside
that same panel use `--r-control` (8px), concentric within the 11px panel.

---

## 4. Menu Bar

- **Fully transparent** in Tahoe — no fill, no blur slab. The desktop wallpaper
  shows straight through; only the text/glyphs are drawn.
- Height ~28px, glyphs in `--text` with a subtle shadow for legibility over
  bright wallpapers.
- Menu dropdowns are **Regular Liquid Glass** panels (§2).

```css
#menubar { background: transparent; backdrop-filter: none; }
```

---

## 5. Dock

- A single **Liquid Glass slab**, `--r-dock` (22px) corners, floating with a
  diffuse shadow and inner highlight.
- Icon tiles 48–52px, hover scales to ~1.35 with an upward translate, spring
  easing (§11).
- Running-app indicator: a small dot under the tile.

## 6. Windows

- Frame radius `--r-window` (12px); border `0.5px rgba(255,255,255,.08)`;
  shadow `0 22px 60px rgba(0,0,0,.55)`.
- **Unified toolbar**: the title bar / toolbar uses the **same background as the
  window body** — no separate `--titlebar` color. Toolbar buttons get only a
  *slight drop shadow* for affordance, not a filled bar.
- Traffic lights: 12px circles, `#ff5f57 / #febc2e / #28c840`, left-aligned;
  glyphs (× − +) appear on header hover; desaturate to grey when the window is
  not focused.
- Active vs inactive: inactive windows dim their title and traffic lights.

## 7. Controls

| Control | Shape | Notes |
|---|---|---|
| Push button | Capsule (`--r-capsule`) | Primary = accent fill; secondary = glass/`rgba(255,255,255,.14)` |
| Text field | `--r-control` (8px) | Inset translucent fill; accent focus ring |
| Segmented control | Capsule track, capsule selection | |
| Toggle / switch | Capsule | Accent when on |

- Minimum hit target **28×28px**.
- **Focus ring**: `0 0 0 3px rgba(10,132,255,0.35)` (accent at ~35% alpha) — used
  for every keyboard-focusable control.
- Buttons sit on a capsule even inside small panels — short labels never use
  rectangular radii in Tahoe.

## 8. Control Center

- A **Regular Liquid Glass** panel opened from the menu-bar Control Center glyph.
- Grid of rounded tiles (`--r-control`), each tile a mini glass surface.
- Tiles are customizable (which ones show, arrangement) — at minimum expose
  display brightness placeholder, wallpaper, and a couple of toggles so the
  panel is real, not decorative.

## 9. Color

- **Accent**: default system blue `#0a84ff`. Should be **user-selectable** (a
  small palette) and applied via the `--accent` CSS variable everywhere.
- Semantic text: `--text #f2f2f7`, `--text-dim #98989f`.
- Avoid pure black/white fills on glass — always slightly translucent.
- Support light and dark; the Liquid Glass tint flips per §2.

## 10. Typography

- Stack: `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue',
  Arial, sans-serif`.
- Sizes: menu bar 13px, body 13px, window title 13px/600, secondary 11–12px.
- `-webkit-font-smoothing: antialiased`. Use `font-variant-numeric: tabular-nums`
  for clocks/counters.

## 11. Motion

- Standard easing: spring-like `cubic-bezier(0.2, 0.8, 0.2, 1)`.
- Durations: micro-interactions 120–180ms; window open/close ~220ms.
- Dock magnify, window focus, menu open all use the spring curve.
- Respect `prefers-reduced-motion: reduce` — drop transforms, keep opacity.

## 12. Accessibility (non-negotiable)

- `prefers-reduced-transparency: reduce` → every glass surface becomes opaque.
- `prefers-contrast: more` → strengthen borders and text contrast.
- `prefers-reduced-motion: reduce` → remove non-essential animation.
- Visible focus ring on all interactive elements (§7).
- Hit targets ≥ 28px.

---

## 13. Vortex OS — Current Gaps vs. Tahoe 26

Audited against `index.html` at the time of writing. Each gap maps to a ticket
in the **macOS Tahoe 26 Design Alignment** epic in `task.md`.

| Area | Current state | Target | Ticket |
|---|---|---|---|
| Material | Flat frosted blur, no specular highlight/saturation | Liquid Glass material system (§2) | VORTEX-117 |
| Menu bar | Semi-opaque slab (`rgba(22,22,24,.55)`) | Fully transparent (§4) | VORTEX-118 |
| Corner radii | Ad-hoc per element | Concentric radius tokens (§3) | VORTEX-119 |
| Controls | `.btn` 7px rectangles | Capsule controls (§7) | VORTEX-120 |
| Window toolbar | Distinct `--titlebar` color | Unified with window body (§6) | VORTEX-121 |
| Control Center | Menu-bar glyph only, no panel | Real glass Control Center (§8) | VORTEX-122 |
| App icons | Emoji glyphs | Squircle layered icons (§5/§9) | VORTEX-123 |
| Accessibility | No reduced-transparency / contrast handling | Full media-query support (§12) | VORTEX-124 |
