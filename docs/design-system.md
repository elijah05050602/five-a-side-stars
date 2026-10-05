---
name: Goal Rush!
colors:
  surface: '#f9f9ff'
  surface-dim: '#cbdbf9'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f3ff'
  surface-container: '#e7eeff'
  surface-container-high: '#dee8ff'
  surface-container-highest: '#d5e3ff'
  on-surface: '#0c1c32'
  on-surface-variant: '#4d4634'
  inverse-surface: '#223148'
  inverse-on-surface: '#ecf1ff'
  outline: '#7f7661'
  outline-variant: '#d1c5ad'
  surface-tint: '#745c00'
  primary: '#745c00'
  on-primary: '#ffffff'
  primary-container: '#ffd23f'
  on-primary-container: '#725a00'
  inverse-primary: '#edc22e'
  secondary: '#006d3e'
  on-secondary: '#ffffff'
  secondary-container: '#77f8ab'
  on-secondary-container: '#007241'
  tertiary: '#00639c'
  on-tertiary: '#ffffff'
  tertiary-container: '#b8daff'
  on-tertiary-container: '#006199'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffe089'
  primary-fixed-dim: '#edc22e'
  on-primary-fixed: '#241a00'
  on-primary-fixed-variant: '#574500'
  secondary-fixed: '#7afbae'
  secondary-fixed-dim: '#5cde94'
  on-secondary-fixed: '#00210f'
  on-secondary-fixed-variant: '#00522e'
  tertiary-fixed: '#cee5ff'
  tertiary-fixed-dim: '#97cbff'
  on-tertiary-fixed: '#001d33'
  on-tertiary-fixed-variant: '#004a77'
  background: '#f9f9ff'
  on-background: '#0c1c32'
  surface-variant: '#d5e3ff'
typography:
  display:
    fontFamily: Fredoka
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 54px
    letterSpacing: -0.02em
  display-mobile:
    fontFamily: Fredoka
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 42px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Fredoka
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Fredoka
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: '0'
  headline-md:
    fontFamily: Fredoka
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 30px
    letterSpacing: '0'
  headline-sm:
    fontFamily: Fredoka
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 26px
    letterSpacing: 0.01em
  body-lg:
    fontFamily: Fredoka
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: '0'
  body-md:
    fontFamily: Fredoka
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 22px
    letterSpacing: '0'
  body-sm:
    fontFamily: Fredoka
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-lg:
    fontFamily: Fredoka
    fontSize: 16px
    fontWeight: '700'
    lineHeight: 20px
    letterSpacing: 0.02em
  label-md:
    fontFamily: Fredoka
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 18px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Fredoka
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.03em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.25rem
  gutter-mobile: 0.75rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.25rem
---

## Brand & Style
The design system drives a vibrant, punchy, high-energy arcade soccer universe tailored for kids, families, and casual gamers. It channels Saturday morning cartoons and classic arcade coin-op titles, evoking joy, momentum, and playful competition.

The design movement combines **Tactile Cartoon Skeuomorphism** with **Neo-Pop Comic Book** styling:
- Structural elements lean into thick comic outlines, chunky silhouettes, and exaggerated hard shadows.
- Interactive surfaces feature squishy physical behaviors: resting elements extrude downward, compress on press, and pop outward on hover.
- Motion principles prioritize elastic snaps, squash-and-stretch bounces, and instant visual feedback over slow corporate fades.
- Visual elements are deliberately friendly, soft-cornered, and approachable, avoiding sharp danger angles.

## Colors
The palette captures an open-air pitch under midday sun, anchored by ink-weight comic contours.

### Palette Architecture
- **Primary Action (Sunshine Yellow - `#FFD23F`):** Used for main call-to-actions, match triggers, coin values, and reward spotlights.
- **Pitch Green (Grass Green - `#2EB872` / Deep Grass - `#1D8F5A`):** Defines gamefield canvases, victory states, stamina meters, and turf motifs.
- **Atmosphere Blue (Sky Blue - `#3DA5F4` / Deep Pitch Blue - `#1B4FD8`):** Drives level badges, secondary options, power-up states, and energy gauges.
- **Comic Ink (Deep Navy - `#1B2A41`):** Serves as the universal ink stroke for all typography, 3px element strokes, and crisp 0-blur drop-shadow blocks. Pure black is never used.
- **Surface Tint (Pitch White - `#FFFFFF`):** Base card fill applied at 94% opacity (`rgba(255, 255, 255, 0.94)`) to let ambient pitch and sky hues gently filter through.

### Background System
The global backdrop renders a stylized two-tier pitch environment:
- **Upper Sky Canopy (Top 55%):** A bright radial dome transitioning from Zenith White-Cyan (`#BFE9FF`), through Mid-Sky (`#8FD0FF`), down into Vibrant Sky Blue (`#3DA5F4`).
- **Lower Turf Band (Bottom 45%):** A lush linear grass sweep from Grass Green (`#2EB872`) to Deep Shade Green (`#1D8F5A`), overlaid with alternating 48px wide vertical mowing stripes at 6% opacity variations.

## Typography
The system employs **Fredoka** across all roles to maintain a unified, bulbous, sticker-like character.
- **Headlines & Titles:** Set at Weight 700 with tightened line-heights to produce impactful, cohesive word-blocks. Critical headers (such as "GOAL!" or "LEVEL UP") can be rendered with a 2px text stroke or soft white halo in Navy `#1B2A41` for arcade legibility.
- **Body & Captions:** Set at Weight 600. The rounded terminals preserve high readability even at small sizes against bright backdrops.
- **Numbers & Scores:** Emphasize Tabular Lining figures in Fredoka 700 to ensure game clocks, scores, and coin tallies do not shift during rapid animated counting.

## Layout & Spacing
The layout follows a fluid-responsive arcade shell optimized for landscape tablet/desktop play and portrait smartphone interaction.

- **Breakpoints:** Mobile (up to 640px), Tablet (641px - 1024px), Desktop (1025px+).
- **HUD Safe Areas:** Canvas edges reserve an inward 16px safety perimeter on mobile to prevent game-controls and status headers from clipping against device cutouts and rounded bezels.
- **Arrangement:** Cards and match tiles organize along a 12-column dynamic flex grid (desktop) and 4-column stack (mobile), ensuring thumb-friendly tap footprints (minimum 48px × 48px).
- **Spacing Rhythm:** Internal card padding utilizes `space-md` (16px) or `space-lg` (24px) to retain breathing room around chunky bordered components.

## Elevation & Depth
Depth is created using hard-edged physical cutouts rather than diffuse atmospheric shadows. 

- **Hard Arcade Drops:** Visual hierarchy is communicated via solid offsets using Deep Navy `#1B2A41` with `0px blur`.
  - **Resting Depth:** Offset `4px` directly down (`box-shadow: 0 4px 0 #1B2A41`).
  - **Floating / Modals / Trophies:** Offset `6px` or `8px` down with full opacity (`box-shadow: 0 8px 0 #1B2A41`).
  - **Pressed / Active Depth:** The element shifts downward along the Y-axis by 4px while the drop shadow contracts to `0 0 0 #1B2A41`, simulating direct physical depression into the playing surface.
- **Comic Outlines:** All elevated containers, interactables, and badges are encircled by a crisp, uniform `3px solid #1B2A41` border.
- **Sub-surface Gleam:** Primary and secondary buttons integrate a subtle, lighter inner highlight strip (15% white linear gradient across the top 40% of the surface) to establish a glossy toy finish.

## Shapes
The design system commits strictly to organic, pillow-like geometries to sustain a non-threatening, child-friendly world.

- **Panels & Cards:** Fixed `20px` corner radii produce rounded rectangular slabs that feel like collectible plastic cards or stadium tickets.
- **Buttons & Pills:** Employ fully rounded pill-capsules (`border-radius: 9999px`) or ultra-soft `16px - 20px` rounded bricks.
- **Badge Accents:** Circular badges with identical 3px ink strokes host player avatars, kit numbers, and emoji stars. Sharp 90-degree corners are strictly prohibited across all viewports.

## Components

### Buttons
- **Primary Hero Action (Yellow):** Background `#FFD23F`, text `#1B2A41`, `3px solid #1B2A41` border, `box-shadow: 0 4px 0 #1B2A41`. Padding: `14px 28px`. Border-radius: `9999px`. On `:hover`, elevates slightly (`0 6px 0 #1B2A41`, `translateY(-2px)`). On `:active`, depresses completely (`0 0 0 #1B2A41`, `translateY(4px)`).
- **Secondary Action (Blue / Green):** Background `#3DA5F4` or `#2EB872`, text `#FFFFFF` with Navy outline or pure `#1B2A41`, matching `3px solid #1B2A41` border and hard 4px drop.

### Cards & Dialogs
- **Pitch Card:** Background `rgba(255, 255, 255, 0.94)`, border `3px solid #1B2A41`, radius `20px`, shadow `0 6px 0 #1B2A41`. Inside padding: `24px`.
- **Card Headers:** Feature an overlapping colored header tab or banner anchored to the top border with hard offset contrast.

### Screen Backdrop
- Every screen outside a match sits on the lobby's stadium art (`public/art/stadium.jpg`), drawn once by `body::before` in `src/style.css` with a navy dimming gradient. The lobby draws its own brighter copy with sparkles.
- Text straight on the stadium (page titles, blurbs) is white with a navy drop; anything inside a `.card`, `.builder-form` or `.sticker` stays ink. New screens only need to put their content in cards to read well.

### Chips & Status Pills
- Compact badges with `radius: 9999px`, `2px solid #1B2A41`, height `32px`, typography `label-sm`.
- Status varieties: Energy (Yellow `#FFD23F`), Match Ready (Green `#2EB872`), Skill Boost (Deep Blue `#1B4FD8` with white text).

### Form Inputs & Selectors
- Background `#FFFFFF`, border `3px solid #1B2A41`, border-radius `14px`, text `#1B2A41` in `Fredoka 600`.
- Focus state expands outline to a double ring using Sky Blue `#3DA5F4` with an inner 2px gap, retaining the playful comic boundary.

### Checkboxes & Radios
- Size: `28px × 28px` hit target. Border: `3px solid #1B2A41`. Radius: `8px` for checkboxes, circular for radios.
- Unchecked: `#FFFFFF` fill.
- Checked: `#FFD23F` fill, containing a thick cartoon navy checkmark or solid navy center dot.

### Match & Player HUD Elements
- **Score Bug:** Centered pill container hanging from the sky bar, framed in 3px navy border with split team colors.
- **Emoji Badges:** Circular floating chips containing high-expression soccer, star, whistle, and flame emojis encircled by 2px Navy rings with a drop-shadow pop.