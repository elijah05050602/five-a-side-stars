/** Spoken names for the palette colours, so a screen reader says "Red" rather than "#e63946". */
const NAMES: Record<string, string> = {
  // Kits and badges
  '#e63946': 'Red', '#f4a261': 'Peach', '#ffd23f': 'Yellow', '#2eb872': 'Green', '#1d8f5a': 'Dark green',
  '#3da5f4': 'Sky blue', '#1b4fd8': 'Royal blue', '#6a4c93': 'Purple', '#ff6fb5': 'Pink', '#ffffff': 'White',
  '#1b2a41': 'Navy', '#8d99ae': 'Grey', '#111111': 'Black', '#00c2cb': 'Turquoise', '#ff7a00': 'Orange', '#7bd389': 'Mint',
  // Skin tones, lightest first
  '#f6d7c3': 'Very light', '#eab98f': 'Light', '#d49a6a': 'Medium light', '#a86b3c': 'Medium', '#7a4a26': 'Medium dark', '#4a2d17': 'Dark',
  // Hair
  '#2b1b0e': 'Dark brown', '#5a3a1a': 'Brown', '#a0522d': 'Auburn', '#d9a441': 'Blonde', '#f2e2a0': 'Light blonde', '#1b1b1b': 'Black', '#c0392b': 'Ginger',
  // Boots
  '#222222': 'Black',
};

export function colourName(hex: string): string {
  return NAMES[hex.toLowerCase()] ?? hex;
}
