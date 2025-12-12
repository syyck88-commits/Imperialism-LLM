
export interface SpriteVisualConfig {
    scale: number;
    shiftX: number; // Pixels relative to center
    shiftY: number; // Pixels relative to center
    
    // Shadow Settings
    drawShadow: boolean;
    shadowScale: number; // 0 = off
    shadowX: number;     // Offset X
    shadowY: number;     // Offset Y
    shadowOpacity: number; // 0 to 1

    // Clump/Distribution Settings (Wheat, Fruit)
    clumpMin: number;    // Min items per tile
    clumpMax: number;    // Max items per tile
    clumpSpread: number; // Spread radius multiplier
}

export const DEFAULT_SPRITE_CONFIG: SpriteVisualConfig = {
    scale: 1.0,
    shiftX: 0,
    shiftY: 0,
    
    drawShadow: true,
    shadowScale: 1.0,
    shadowX: 0,
    shadowY: 0,
    shadowOpacity: 0.3,

    clumpMin: 0, // 0 means use default hardcoded values
    clumpMax: 0,
    clumpSpread: 1.0
};

// Keys are "RES_{ID}", "UNIT_{ID}", "STR_{ID}"
export const PRESET_CONFIGS: Record<string, Partial<SpriteVisualConfig>> = {
  "RES_12": { "scale": 1.45, "shiftX": 0, "shiftY": 17, "drawShadow": true, "shadowScale": 1.6, "shadowX": 0, "shadowY": 0, "shadowOpacity": 0.25, "clumpMin": 7, "clumpMax": 7, "clumpSpread": 2 },
  "RES_9": { "scale": 0.9, "shiftX": 0, "shiftY": 0, "drawShadow": true, "shadowScale": 1.5, "shadowX": 0, "shadowY": -14, "shadowOpacity": 0.25, "clumpMin": 0, "clumpMax": 0, "clumpSpread": 1 },
  "STR_capital": { "scale": 1.15, "shiftX": 0, "shiftY": 26, "drawShadow": false, "shadowScale": 1.3, "shadowX": 0, "shadowY": -74, "shadowOpacity": 0.55, "clumpMin": 0, "clumpMax": 0, "clumpSpread": 1 },
  "STR_depot": { "scale": 1, "shiftX": 0, "shiftY": 0, "drawShadow": false, "shadowScale": 1, "shadowX": 0, "shadowY": 0, "shadowOpacity": 0.3, "clumpMin": 0, "clumpMax": 0, "clumpSpread": 1 },
  "STR_plantation": { "scale": 1, "shiftX": 0, "shiftY": 0, "drawShadow": true, "shadowScale": 1, "shadowX": 0, "shadowY": 0, "shadowOpacity": 0.3, "clumpMin": 0, "clumpMax": 0, "clumpSpread": 1 },
  "UNIT_Soldier": { "scale": 1, "shiftX": 0, "shiftY": 0, "drawShadow": true, "shadowScale": 1, "shadowX": 0, "shadowY": 0, "shadowOpacity": 0.3, "clumpMin": 0, "clumpMax": 0, "clumpSpread": 1 },
  "RES_3": { "scale": 1, "shiftX": 0, "shiftY": 0, "drawShadow": true, "shadowScale": 1.1, "shadowX": 0, "shadowY": -7, "shadowOpacity": 0.55, "clumpMin": 0, "clumpMax": 0, "clumpSpread": 1 },
  "RES_4": { "scale": 1, "shiftX": 0, "shiftY": 0, "drawShadow": true, "shadowScale": 1.1, "shadowX": 0, "shadowY": -7, "shadowOpacity": 0.55, "clumpMin": 0, "clumpMax": 0, "clumpSpread": 1 },
  "RES_5": { "scale": 1, "shiftX": 0, "shiftY": 0, "drawShadow": true, "shadowScale": 1.1, "shadowX": 0, "shadowY": -7, "shadowOpacity": 0.55, "clumpMin": 0, "clumpMax": 0, "clumpSpread": 1 },
  "RES_11": { "scale": 1, "shiftX": 0, "shiftY": 0, "drawShadow": true, "shadowScale": 1.1, "shadowX": 0, "shadowY": -7, "shadowOpacity": 0.55, "clumpMin": 0, "clumpMax": 0, "clumpSpread": 1 },
  "RES_1": { "scale": 0.6, "shiftX": 0, "shiftY": 17, "drawShadow": true, "shadowScale": 0.6, "shadowX": 0, "shadowY": -3, "shadowOpacity": 0.4, "clumpMin": 15, "clumpMax": 20, "clumpSpread": 1.4 },
  "RES_7": { "scale": 0.6, "shiftX": 0, "shiftY": 17, "drawShadow": true, "shadowScale": 0.6, "shadowX": 0, "shadowY": -3, "shadowOpacity": 0.4, "clumpMin": 15, "clumpMax": 20, "clumpSpread": 1.4 },
  "RES_6": { "scale": 1, "shiftX": 0, "shiftY": 7, "drawShadow": true, "shadowScale": 0.8, "shadowX": 0, "shadowY": 3, "shadowOpacity": 0.3, "clumpMin": 12, "clumpMax": 20, "clumpSpread": 2 },
  "RES_8": { "scale": 0.6, "shiftX": 0, "shiftY": 10, "drawShadow": true, "shadowScale": 1, "shadowX": 0, "shadowY": 0, "shadowOpacity": 0.3, "clumpMin": 3, "clumpMax": 20, "clumpSpread": 2 },
  "UNIT_Engineer": { "scale": 1, "shiftX": 0, "shiftY": 14, "drawShadow": true, "shadowScale": 0.7, "shadowX": 0, "shadowY": 20, "shadowOpacity": 0.3, "clumpMin": 0, "clumpMax": 0, "clumpSpread": 1 },
  "UNIT_Miner": { "scale": 1, "shiftX": 0, "shiftY": 14, "drawShadow": true, "shadowScale": 0.7, "shadowX": 0, "shadowY": 20, "shadowOpacity": 0.3, "clumpMin": 0, "clumpMax": 0, "clumpSpread": 1 },
  "UNIT_Prospector": { "scale": 1, "shiftX": 0, "shiftY": 14, "drawShadow": true, "shadowScale": 0.7, "shadowX": 0, "shadowY": 20, "shadowOpacity": 0.3, "clumpMin": 0, "clumpMax": 0, "clumpSpread": 1 },
  "UNIT_Farmer": { "scale": 1, "shiftX": 0, "shiftY": 14, "drawShadow": true, "shadowScale": 0.7, "shadowX": 0, "shadowY": 20, "shadowOpacity": 0.3, "clumpMin": 0, "clumpMax": 0, "clumpSpread": 1 }
};
