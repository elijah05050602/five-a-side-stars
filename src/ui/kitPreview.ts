import type { Kit } from '../data/types';

/** Small inline SVG shirt for lists and the scoreboard. */
export function kitChip(kit: Kit, size = 28): string {
  const id = `p${Math.random().toString(36).slice(2, 8)}`;
  let pattern = '';
  switch (kit.pattern) {
    case 'stripes':
      pattern = `<pattern id="${id}" width="8" height="40" patternUnits="userSpaceOnUse"><rect width="4" height="40" fill="${kit.shirt2}"/></pattern>`;
      break;
    case 'hoops':
      pattern = `<pattern id="${id}" width="40" height="8" patternUnits="userSpaceOnUse"><rect width="40" height="4" fill="${kit.shirt2}"/></pattern>`;
      break;
    case 'halves':
      pattern = `<pattern id="${id}" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="20" height="40" fill="${kit.shirt2}"/></pattern>`;
      break;
    case 'sash':
      pattern = `<pattern id="${id}" width="40" height="40" patternUnits="userSpaceOnUse"><polygon points="24,0 34,0 10,40 0,40" fill="${kit.shirt2}"/></pattern>`;
      break;
    default:
      break;
  }
  const shirtPath = 'M8 6 L15 2 Q20 7 25 2 L32 6 L38 14 L31 18 L30 36 L10 36 L9 18 L2 14 Z';
  return `<svg class="kit-chip" width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true">
    <defs>${pattern}</defs>
    <path d="${shirtPath}" fill="${kit.shirt}" stroke="#1b2a41" stroke-width="1.5" stroke-linejoin="round"/>
    ${pattern ? `<path d="${shirtPath}" fill="url(#${id})"/>` : ''}
    <rect x="11" y="32" width="18" height="6" fill="${kit.shorts}" stroke="#1b2a41" stroke-width="1"/>
  </svg>`;
}
