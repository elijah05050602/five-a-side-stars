import type { Badge, Kit } from '../data/types';

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
    case 'chevron':
      pattern = `<pattern id="${id}" width="40" height="40" patternUnits="userSpaceOnUse"><polygon points="0,10 20,22 40,10 40,18 20,30 0,18" fill="${kit.shirt2}"/></pattern>`;
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

/** Club badge as inline SVG: a shape, two colours and an emoji icon. */
export function badgeSvg(b: Badge, size = 48): string {
  const shape = {
    shield: '<path d="M24 3 L43 9 V24 C43 35 34 42 24 46 C14 42 5 35 5 24 V9 Z"/>',
    circle: '<circle cx="24" cy="24" r="21"/>',
    diamond: '<path d="M24 3 L45 24 L24 45 L3 24 Z"/>',
    hex: '<path d="M24 3 L42 13.5 V34.5 L24 45 L6 34.5 V13.5 Z"/>',
  }[b.shape];
  const id = `b${Math.random().toString(36).slice(2, 8)}`;
  return `<svg class="badge" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true">
    <defs><clipPath id="${id}">${shape}</clipPath></defs>
    <g fill="${b.colour1}" stroke="#1b2a41" stroke-width="2" stroke-linejoin="round">${shape}</g>
    <rect clip-path="url(#${id})" x="24" y="0" width="24" height="48" fill="${b.colour2}" opacity="0.9"/>
    <g fill="none" stroke="#1b2a41" stroke-width="2" stroke-linejoin="round">${shape}</g>
    <text x="24" y="31" font-size="20" text-anchor="middle">${b.icon}</text>
  </svg>`;
}
