---
name: Goal Rush!
# Tokens as they are defined in src/style.css (:root). Names match the CSS custom properties.
colors:
  yellow: '#ffd23f'        # --yellow, Sunshine Yellow: primary actions, active states, chips
  yellow-deep: '#ffa000'   # --yellow-deep: bottom of the Quick Match launcher gradient
  orange: '#ff7a00'        # --orange: swap highlight (picked / drop-target player)
  green: '#2eb872'         # --green, Grass Green: selected pills, stamina bar, pitch
  green-dark: '#1d8f5a'    # --green-dark: borders, touch-settings slider accent
  green-ink: '#006d3e'     # --green-ink: green text on light cards
  blue: '#3da5f4'          # --blue, Sky Blue: blue buttons, active kit tab, Pass button
  blue-dark: '#1b4fd8'     # --blue-dark: blue text and links on light cards
  red: '#d62839'           # --red: Shoot button, missed penalties, replay label (white text)
  star: '#a87400'          # --star: star-rating glyphs
  navy: '#1b2a41'          # --navy, Comic Ink: outlines, hard drops, text on bright fills
  ink: '#0c1c32'           # --ink: body text on light surfaces
  white: '#ffffff'         # --white
  surface: '#f6f7ff'       # --surface: page background (behind the stadium art)
  surface-low: '#eef2ff'   # --surface-low: tiles, player cards, missing stickers
  surface-high: '#dee8ff'  # --surface-high: inactive steps, empty bars
  card: 'rgba(255, 255, 255, 0.94)'  # --card (0.97 on stadium screens)
  muted: '#4d5b74'         # --muted: secondary text inside cards (#d6e2f5 straight on the stadium)
typography:
  display:
    fontFamily: Fredoka
    fontSize: clamp(56px, 11vw, 112px)   # lobby "GOAL"; "RUSH!" is clamp(66px, 13vw, 130px)
    fontWeight: '700'
    lineHeight: '0.86'
    letterSpacing: 0.02em
  banner:
    fontFamily: Fredoka
    fontSize: clamp(60px, 14vw, 140px)   # in-match GOAL! banner
    fontWeight: '700'
    lineHeight: '1'
  page-title:
    fontFamily: Fredoka
    fontSize: 30px                       # 24px at 760px and below
    fontWeight: '700'
    lineHeight: '1.15'
    letterSpacing: -0.01em
  headline:
    fontFamily: Fredoka
    fontSize: 26px                       # h2
    fontWeight: '700'
    lineHeight: '1.15'
    letterSpacing: -0.01em
  title:
    fontFamily: Fredoka
    fontSize: 20px                       # h3
    fontWeight: '700'
    lineHeight: '1.15'
    letterSpacing: -0.01em
  body:
    fontFamily: Fredoka
    fontSize: 17px
    fontWeight: '600'
  body-sm:
    fontFamily: Fredoka
    fontSize: 15px                       # .muted
    fontWeight: '600'
  label:
    fontFamily: Fredoka
    fontSize: 14px                       # form field labels, uppercase
    fontWeight: '700'
    letterSpacing: 0.05em
  button:
    fontFamily: Fredoka
    fontSize: 17px                       # .btn-big 22px, kick-off 26px, pills 16px
    fontWeight: '700'
    letterSpacing: 0.01em
  chip:
    fontFamily: Fredoka
    fontSize: 13px
    fontWeight: '700'
    letterSpacing: 0.02em
  input:
    fontFamily: Fredoka
    fontSize: 19px
    fontWeight: '600'
  score:
    fontFamily: Fredoka
    fontSize: 30px                       # score bug; 24px at 820px and below, 22px on phones; results 56px
    fontWeight: '700'
rounded:
  card: 20px        # --radius
  small: 14px       # --radius-sm: inputs, pattern tiles, warning boxes
  tile: 12px        # icon tiles, skill rows
  checkbox: 8px
  portal: 22px
  launcher: 30px
  full: 9999px      # buttons, pills, chips, tabs
spacing:
  screen-max: 1180px
  content-max: 900px    # league, album, cup bracket, tier banner
  screen-gap: 16px      # between blocks on a screen
  card-padding: 20px
  row-gap: 10px
  pill-gap: 8px
  target-min: 44px      # smallest hit area for anything you can tap
  button-min: 48px      # standard button height
---

## Brand & Style
The design system drives a vibrant, punchy, high-energy arcade soccer universe tailored for kids, families, and casual gamers. It channels Saturday morning cartoons and classic arcade coin-op titles, evoking joy, momentum, and playful competition.

The design movement combines **Tactile Cartoon Skeuomorphism** with **Neo-Pop Comic Book** styling:
- Structural elements lean into thick comic outlines, chunky silhouettes, and exaggerated hard shadows.
- Interactive surfaces feature squishy physical behaviors: resting elements extrude downward, compress on press, and pop outward on hover.
- Motion principles prioritize elastic snaps, squash-and-stretch bounces, and instant visual feedback over slow corporate fades. All decorative motion stops when the player asks for less (see Motion).
- Visual elements are deliberately friendly, soft-cornered, and approachable, avoiding sharp danger angles.

The look must never cost readability: every colour pair below is checked against WCAG AA, and every control is big enough for a seven-year-old's finger.

## Colors
The palette captures a floodlit stadium on match day, anchored by ink-weight comic contours. The tokens are the custom properties in `src/style.css` (`:root`), listed in the front matter.

### Palette Architecture
- **Sunshine Yellow (`--yellow` `#FFD23F`):** main calls to action (`.btn-primary`, Kick Off), active steps, tabs, player and kit cards, chips, rewards. Text on it is navy (10.0:1).
- **Grass Green (`--green` `#2EB872`, deep `--green-dark` `#1D8F5A`):** selected pills, finished steps, the Sprint button, stamina bar and the formation pitch. Text on it is navy (5.65:1). `--green-ink` (`#006D3E`, 6.45:1 on white) is the green for text on light cards.
- **Sky Blue (`--blue` `#3DA5F4`, deep `--blue-dark` `#1B4FD8`):** blue buttons, the active kit tab and the Pass button take navy text (5.42:1). Blue text and links on light cards use `--blue-dark` (6.65:1).
- **Red (`--red` `#D62839`):** the Shoot button, missed-penalty dots and the replay label, always with white text (4.97:1).
- **Star gold (`--star` `#A87400`):** star ratings (3.6:1 or better on every light card). Star totals written as text use the darker `#7A5500` (4.65:1 even on yellow).
- **Orange (`--orange` `#FF7A00`):** the ring around a player picked for a swap, or the one a dragged player will land on.
- **Comic Ink (`--navy` `#1B2A41`):** every outline, every hard drop shadow and the text on bright fills. Pure black is never used for ink. Body text inside cards is `--ink` (`#0C1C32`).
- **Surfaces:** cards are white at 94% (`--card`), 97% on stadium screens; tiles and player cards use `--surface-low`; inactive steps and empty bars use `--surface-high`. Secondary text inside cards is `--muted` (`#4D5B74`, 6.85:1 on white).
- **One-offs:** chip pastels (`#E3F0FF`, `#FFE08A`, `#FFD0D8`, `#E5DCFF`, `#D2F4F6`, `#E9ECEF`, `#D9F7E5`), the warning box (`#FFF4CC`), the Trick button purple (`#8A4FD8`, white text 5.01:1), the Lob button orange (`#F4A261`, navy text 7.01:1), the sound-mixer accent (`#CC5C00`) and the Davao Strikers club colours (orange `#F26A1B`, navy `#13233A`, cream `#EFE3C4`).

### Text on coloured fills
Pick the text colour from the fill, never the other way round:
- **Bright fills take navy text:** yellow, grass green, sky blue, orange, the chip pastels and every tier banner.
- **White text only goes on deep fills:** navy, `--red`, the Trick purple, `--blue-dark` and dark overlays such as the commentary ticker.
- Never put white text on yellow, grass green, sky blue or orange (1.4 to 2.7:1).
- Anything with a light fill (chips, warning boxes) sets its own ink, because text placed straight on the stadium inherits white.

### Screen backdrop
- Every screen outside a match sits on the stadium photo (`public/art/stadium.jpg`), drawn once by `body::before` in `src/style.css` under a navy dimming gradient (62% at the top, 32% around a third of the way down, 68% lower down, solid `#0D1C2D` at the bottom), slightly saturated and darkened. The lobby draws its own, slightly brighter copy (`.lobby-bg`) with floating sparkles.
- The cup screen's hero banner uses the key art (`public/art/keyart.jpg`) with a navy fade at the bottom for its text.
- Text straight on the stadium (page titles, blurbs, the sticker count) is white with a navy drop; `--muted` turns light (`#D6E2F5`) there. Anything inside a `.card`, `.builder-form`, `.sticker` or the console bar stays ink. New screens only need to put their content in cards to read well.

## Typography
The system employs **Fredoka** (Google Fonts, weights 400, 600 and 700; fallbacks Arial Rounded MT Bold, Nunito, system-ui) across all roles to keep a unified, bulbous, sticker-like character. The sizes are in the front matter.
- **Headlines & titles:** weight 700 with tight line heights (1.15) for compact word blocks. The lobby title is extruded with stacked navy text shadows; the in-match GOAL! banner is yellow with a 4px navy text stroke and an 8px navy drop.
- **Body & captions:** weight 600, 17px body and 15px secondary text. Field labels are 14px uppercase in `--muted`.
- **Numbers & scores:** Fredoka has no tabular figures (a 1 is two-thirds the width of a 0, and `font-variant-numeric: tabular-nums` changes nothing), so the live score digits sit in boxes 1ch wide per digit and the match clock in a 4.4ch box, centred, so the score bug never wobbles as they tick. `tabular-nums` is still set on the score bug, results, fixtures, league tables and album stats for the fallback fonts.

## Layout & Spacing
The layout is a fluid, responsive arcade shell for desktop and tablet play and for phones held either way.

- **Screens:** `.screen` is at most 1180px wide with 16px between blocks; content-heavy pages (league, album, cup bracket, tier banner) stop at 900px. Cards pad 20px.
- **Breakpoints in use:** 1024px (lobby portals in two columns), 1000px and 720px (tutorial card), 900px (console tab icons and the season chip hide), 820px (team builder, match options and versus cards stack; slimmer HUD), 760px (lobby stage stacks, mascot hides), 640px (console bar wraps onto rows, formation row and control rows stack), 560px (club hero stacks), 480px (portals in one column), 400px (tighter star rows), portrait up to 600px (upright-phone HUD), landscape up to 520px tall (sideways-phone HUD and compact pause menu). `(pointer: coarse)` shows the touch controls and `(hover: hover)` enables hover lifts.
- **Safe areas:** menus pad by `env(safe-area-inset-*)`, and the HUD offsets the score bug, pause button, bars and touch controls by the same insets, so nothing hides under a notch or the home bar. The match itself runs edge to edge.
- **No sideways scrolling:** every screen fits a 360px-wide phone and a 640×360 landscape phone without horizontal scrolling. Wide content scrolls inside its own card (the league table) or reflows (the sticker grid takes the screen's width, so `auto-fill` counts two to four columns on phones).
- **Touch targets:** see Accessibility.

## Elevation & Depth
Depth comes from hard-edged physical cutouts, with soft shadows kept for cards.

- **Hard arcade drops:** solid offsets in navy with 0 blur. `--drop` (`0 4px 0`) for resting buttons, `--drop-lg` (`0 6px 0`) for hover, the Kick Off button, portals and the console bar, 8px for the launcher, the mascot pod and overlay cards, 3px for small pieces (selected pills, steps and cards, dock chips, console icons, the logo pill).
- **Hover and press:** on devices with hover, buttons lift 2px and their drop grows to 6px. Pressed, they sink 4px and the drop goes to `0 0 0`, like a key pushed into the pitch.
- **Cards:** `.card` uses a faint 2px border (`rgba(27,42,65,0.08)`) and a soft two-layer shadow (`--shadow`), not an ink outline; that keeps long screens calm. Overlay cards (pause, half time, full time), tier banners and the cup hero add the 3px ink stroke.
- **Comic outlines:** buttons and inputs use `--stroke` (3px navy); pills, tabs, console icons and tiles use 2.5px; chips and small badges 2px.
- **Gleam:** buttons carry `--gleam`, a white highlight that fades from 35% at the top edge to nothing 40% of the way down, for a glossy toy finish.

## Shapes
The design system commits to organic, pillow-like geometry for a non-threatening, child-friendly world.

- **Panels & cards:** 20px corners (`--radius`); inputs, pattern tiles and warning boxes 14px (`--radius-sm`); icon tiles and skill rows 12px; portals 22px, the launcher 30px.
- **Buttons, pills, chips, tabs:** fully rounded capsules (`border-radius: 999px`).
- **Badges:** circular kit numbers, step numbers, console icons and portal icons with navy rings. Sharp 90-degree corners are avoided everywhere; even tick boxes round theirs (8px).

## Components

### Buttons
- **Base (`.btn`):** white with `--gleam`, `3px solid` navy, pill radius, `10px 22px` padding, at least 48px tall, 17px/700 navy text, `--drop`. Hover lifts (`translateY(-2px)`, `--drop-lg`); press sinks (`translateY(4px)`, no drop). Disabled buttons fade to 60%.
- **Primary (`.btn-primary`):** yellow fill, navy text.
- **Blue (`.btn-blue`):** sky blue fill with navy text.
- **Ghost (`.btn-ghost`):** white fill.
- **Big (`.btn-big`):** 22px text, 64px tall; **Kick Off (`.btn-kickoff`):** 26px, 72px tall, up to 520px wide, `--drop-lg`.
- **Icon (`.btn-icon`):** at least 48px square (44px for the star -/+ buttons).
- **Back (`.btn-back`):** uppercase 15px, 44px tall, white with the ink stroke.
- **Small (`.btn-small`):** 0.85rem text, still 44px tall. In table rows (`.logo-mini`) the camera button looks 26px tall but carries an invisible 44px hit area (`::after`).

### Pills, tabs and steps
- **Pills (`.pill`):** white capsules with a 2.5px navy outline, 16px/700 navy text, at least 44px tall. Selected: grass green with navy text and a 3px navy drop. Compact pills (camera, graphics, player-card scope) are 15px but still 44px tall.
- **Segmented tabs (`.tabs`/`.tab`):** a white pill track; tabs are 44px tall, and the active one is sky blue with navy text.
- **Console tabs (`.shell-tab`):** 44px tall; the active tab is yellow.
- **Builder steps (`.step`):** 44px capsules; active is yellow with a navy number badge, done shows a green badge with a navy tick.

### Chips & status pills
- Compact labels with a pill radius, `2px solid` navy, 13px/700 text in navy, about 27px tall. They are not interactive.
- Varieties: age and default (yellow), position (`chip-pos` sky `#E3F0FF`, keeper `#FFE08A`, attacker `#FFD0D8`, midfielder `#E5DCFF`, winger `#D2F4F6`), sub (`#E9ECEF`), career (`#D9F7E5`).

### Cards & dialogs
- **Card (`.card`):** `--card` fill, 20px radius, 20px padding, faint border and `--shadow`.
- **Overlay card:** a card with the 3px ink stroke and an 8px navy drop, centred over a 45% navy scrim; it scrolls inside itself when the screen is short.

### Form inputs & selectors
- Text, number and select: white, `3px solid` navy, 14px radius, at least 50px tall, 19px/600 navy text. An invalid number turns the border red (`#E63946`) on pale pink.
- **Tick boxes:** 28px squares, `3px solid` navy, 8px radius. Off: white. On: yellow with a thick navy tick. Each sits in a label at least 44px tall, so the whole label is the hit area. In Windows high-contrast mode the system checkbox is used. There are no radio buttons.
- **Sliders:** native range inputs in a 44px-tall box, with a deep green accent (`#1D8F5A`) on the touch settings and deep orange (`#CC5C00`) in the sound mixer, both 3:1 or better against white.

### Focus
- Every button, link, summary, input, select, slider, pill and swatch shows a **double ring** when focused from the keyboard: a 3px white ring inside a 3px navy ring (`box-shadow` plus `outline`, both `!important` so no component shadow or animation can hide it). One of the two rings always stands out, whether the control sits on a white card, a bright fill or the dark stadium.
- It only appears for `:focus-visible`, so taps and clicks do not light it up.
- Console tabs draw both rings inside their own edge, so the sideways-scrolling tab strip on phones cannot clip them. A player picked for a swap keeps its orange ring colour. Formation dots (SVG) get the navy outline and a white ring on the dot.

### Console bar & lobby
- **Console bar (`.shell`):** a white pill with the ink stroke and `--drop-lg`: the yellow GOAL RUSH! logo, the main tabs and 44px round icon buttons (sound, controls, parents). Below 640px it wraps onto rows and the tab strip scrolls sideways.
- **Quick Match launcher:** a yellow-to-deep-yellow capsule with a 4px ink stroke, an 8px drop and a slow glow.
- **Portals:** mode tiles with gradient fills (gold, green, sky, white) and navy text. Each gradient keeps navy at 4.5:1 or better down to its darkest corner.
- **Dock:** a dark translucent pill holding 44px chips (How to play, Controls, Davao Strikers, Parents Zone).

### League & career banners
- Bright 135-degree gradients with navy text (5.2:1 or better corner to corner): Tier 5 sand `#D7A86E` to `#ECC88F`, Tier 4 sky `#3DA5F4` to `#6CC4FF`, Tier 3 periwinkle `#8C9EFF` to lavender `#B39DDB`, Tier 2 orange `#FF7043` to amber `#FFB300`, Tier 1 gold `#D9A92A` to `#FFE08A`, Career orange `#FF7A00` to yellow `#FFD23F`.
- Ladder rungs: translucent white with a faint navy ring; reached rungs are near-white; the current rung is navy with white text.

### Match & player HUD
- **Score bug (`.scoreboard`):** a card hanging from the top edge, framed in a 3px navy border with no top border and 24px bottom corners, showing both badges, short names, the score (steady-width digits) and the clock.
- **Touch controls:** a 140px joystick with a yellow knob, and round action buttons (84px, Lob and Trick 68px) that shrink on phones (×0.74 sideways, ×0.7 upright) and with the player's size setting, but never below 44px. Labels follow the text-on-fill rule: navy on Pass (sky), Sprint (green), Lob (orange) and Switch (white), white on Shoot (red) and Trick (purple).
- **Banners and ticker:** the GOAL! banner is yellow with a navy text stroke; its caption, the save and foul call-outs and the commentary ticker sit on translucent navy plates with white text.

## Accessibility
These rules are part of the design system; new components must follow them.

### Contrast (WCAG 2.2 AA)
- Text: at least **4.5:1**. Large text (24px and up, or 18.66px bold and up): at least **3:1**.
- Meaningful graphics and control edges (star ratings, slider thumbs, tick boxes, focus rings): at least **3:1** against what is next to them.
- Do not fade text with opacity below those ratios. Sub player cards dim to 90%, the empty cup-final card to 85%; disabled controls are exempt.
- Check every new pair with the WCAG formula, including the darkest point of a gradient and anything semi-transparent blended over what is behind it.

| Pair | Ratio |
|---|---|
| Navy on white / ink on white | 14.4:1 / 17.1:1 |
| Navy on yellow | 10.0:1 |
| Navy on grass green (selected pills, Sprint) | 5.65:1 |
| Navy on sky blue (blue buttons, active tab, Pass) | 5.42:1 |
| Navy on the Lob orange | 7.01:1 |
| White on `--red` (Shoot, missed penalty, replay) | 4.97:1 |
| White on the Trick purple `#8A4FD8` | 5.01:1 |
| `--blue-dark` links on white | 6.65:1 |
| `--green-ink` notes on white | 6.45:1 |
| `--muted` on white | 6.85:1 |
| Star gold `--star` on the skill rows (`#F3F6FB`) | 3.75:1 |
| Star totals `#7A5500` on yellow | 4.65:1 |
| Navy on the tier and career banners (worst corner) | 5.26:1 |
| Club navy `#13233A` on club orange `#F26A1B` | 5.16:1 |

### Touch targets
- Everything you can tap is at least **44×44 CSS px** (WCAG 2.5.5, Apple's 44pt); standard buttons are 48px tall.
- Get there with padding or `min-height`/`min-width`. If a control must look smaller (the camera buttons in table rows), add an invisible `::after` hit area of at least 44px and make sure it does not overlap a neighbour's.
- Tick boxes and sliders count their 44px label or box. Inline text links use vertical padding with a matching negative margin, so the hit area grows without moving the line.

### Motion
- With the system setting `prefers-reduced-motion: reduce`, or the game's own Reduce motion switch (`body.reduce-motion`), decorative animation stops: sparkles, the bobbing mascot, the launcher glow, pulses, blinks, pops and slides finish at once. Hover, press and focus feedback still happens, just instantly. The game itself also skips confetti when the switch is on.

### Known gaps
- **Formation dots** in the team builder are SVG circles about 25 to 35px across; CSS cannot add a hit area to an SVG group. They need an invisible hit circle in the markup (`src/ui/screens.ts`). Dragging or tapping the player cards does the same job at full size.
- **Focus after a choice:** picking a pill, swatch or tile re-renders the form, so keyboard focus falls back to the page. The screen code should restore focus to the matching control after rendering.
- **Screen gutter:** `.screen-root` asks for 14px/16px/24px padding, but `#ui:not(.match-ui)` sets the safe-area padding and wins, so menus currently run edge to edge. Bringing the gutter back means making the star rows fit a 328px-wide card on 360px phones first.
