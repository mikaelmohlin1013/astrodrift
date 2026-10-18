// The look of a level: sky and fog, the ground, the rocks, the light, the
// glowing cracks in the ground and the dust drifting in the air.
export interface Theme {
  /** Background and fog colour. */
  sky: number;
  fogNear: number;
  fogFar: number;
  /** Folder in public/textures with the ground's colour, normal and roughness maps. */
  surface: string;
  /** HDR sky in public/hdri that lights and reflects off everything, and how strongly. */
  hdri: string;
  envIntensity: number;
  /** The theme's accent colour, and how bright the ground's cracks glow in it (0 = no glow map). */
  veins: number;
  veinGlow: number;
  rocks: number[];
  rockRoughness: number;
  /** Hemisphere light: from above, from below (the ground bounce), strength. */
  skyLight: number;
  groundLight: number;
  ambient: number;
  sun: number;
  sunStrength: number;
  border: number;
  /** Motes floating in the air, and which way they drift (y > 0 rises). */
  dust: number;
  dustDrift: [number, number, number];
}

export const THEMES = {
  // The first four levels: a cratered grey moon at dusk.
  dusk: {
    sky: 0x05070d,
    fogNear: 45,
    fogFar: 115,
    surface: 'dusk',
    hdri: 'dawn',
    envIntensity: 0.4,
    veins: 0x3a8cff,
    veinGlow: 0,
    rocks: [0x77716a, 0x65615d, 0x82786c, 0x5b5652],
    rockRoughness: 0.9,
    skyLight: 0x8fb4ff,
    groundLight: 0x2a1830,
    ambient: 0.35,
    sun: 0xfff1dd,
    sunStrength: 1.7,
    border: 0xff6b5e,
    dust: 0x8fb4ff,
    dustDrift: [0.3, 0.05, -0.2],
  },
  // Wind-packed snow with windows of clear blue ice, and falling snow.
  ice: {
    sky: 0x0a1622,
    fogNear: 40,
    fogFar: 110,
    surface: 'ice',
    hdri: 'sky',
    envIntensity: 0.3,
    veins: 0x7ae8ff,
    veinGlow: 0,
    rocks: [0x7f98b0, 0x6a84a0, 0x94aec4, 0x5a7290],
    rockRoughness: 0.35,
    skyLight: 0xcfe8ff,
    groundLight: 0x1a2a40,
    ambient: 0.3,
    sun: 0xe8f4ff,
    sunStrength: 1.05,
    border: 0x7ae8ff,
    dust: 0xeaf6ff,
    dustDrift: [0.8, -1.4, 0.4],
  },
  // Black basalt plates split by glowing cracks, lit orange from below, with embers rising.
  ember: {
    sky: 0x0e0503,
    fogNear: 38,
    fogFar: 105,
    surface: 'ember',
    hdri: 'sunset',
    envIntensity: 0.4,
    veins: 0xff5a1a,
    veinGlow: 1.1,
    rocks: [0x3a2a26, 0x2e2422, 0x4a3028, 0x2a1f1f],
    rockRoughness: 0.95,
    skyLight: 0xffc49a,
    groundLight: 0x6a1a08,
    ambient: 0.45,
    sun: 0xffd2a0,
    sunStrength: 1.7,
    border: 0xffb340,
    dust: 0xff7a2a,
    dustDrift: [0.2, 1.2, -0.3],
  },
  // Stony rubble half sunk in dust, in a busy asteroid belt.
  belt: {
    sky: 0x06070a,
    fogNear: 45,
    fogFar: 115,
    surface: 'belt',
    hdri: 'sunrise',
    envIntensity: 0.45,
    veins: 0xffd28a,
    veinGlow: 0,
    rocks: [0x7a6a5a, 0x6a625c, 0x857055, 0x5a544e],
    rockRoughness: 0.95,
    skyLight: 0xd0d8ff,
    groundLight: 0x2a2018,
    ambient: 0.4,
    sun: 0xfff6e8,
    sunStrength: 2.1,
    border: 0xffd28a,
    dust: 0xc8b8a0,
    dustDrift: [-1.2, 0, 0.2],
  },
  // Volcanic glass and ash with violet seams, around collapsing stars.
  void: {
    sky: 0x08030f,
    fogNear: 40,
    fogFar: 110,
    surface: 'void',
    hdri: 'night',
    envIntensity: 0.6,
    veins: 0xb36bff,
    veinGlow: 0.45,
    rocks: [0x4a3a66, 0x3a2f52, 0x5a4a72, 0x2f2744],
    rockRoughness: 0.6,
    skyLight: 0xb89aff,
    groundLight: 0x3a0a4a,
    ambient: 0.45,
    sun: 0xe0d0ff,
    sunStrength: 1.8,
    border: 0xff5ad0,
    dust: 0xd0a0ff,
    dustDrift: [0.2, 0.4, 0.2],
  },
} satisfies Record<string, Theme>;

export type ThemeName = keyof typeof THEMES;

/** A colour as a CSS hex string, for the HUD. */
export function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
