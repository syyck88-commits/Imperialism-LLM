
import { TileData, ImprovementType, ResourceType, TerrainType } from '../../Grid/GameMap';
import { Hex } from '../../Grid/HexMath';
import { AssetManager } from '../AssetManager';
import { Camera, ISO_FACTOR } from '../RenderUtils';
import { AnimalManager } from '../effects/AnimalManager';
import { SpriteVisualConfig } from '../assets/SpriteVisuals';

const resourceEmojis: Record<ResourceType, string> = {
  [ResourceType.NONE]: '', [ResourceType.WHEAT]: '🌾', [ResourceType.WOOD]: '🪵',
  [ResourceType.COAL]: '⚫', [ResourceType.IRON]: '⛏️', [ResourceType.GOLD]: '💰',
  [ResourceType.GEMS]: '💎', [ResourceType.WOOL]: '🧶', [ResourceType.COTTON]: '☁️',
  [ResourceType.FRUIT]: '🍎', [ResourceType.OIL]: '🛢️', [ResourceType.SPICE]: '🌶️',
  [ResourceType.MEAT]: '🥩', [ResourceType.FISH]: '🐟', [ResourceType.LUMBER]: '🪚',
  [ResourceType.STEEL]: '🔩', [ResourceType.FURNITURE]: '🪑', [ResourceType.FABRIC]: '🧵',
  [ResourceType.CLOTHING]: '👕', [ResourceType.ARMAMENTS]: '⚔️', [ResourceType.PAPER]: '📜',
  [ResourceType.CANNED_FOOD]: '🥫',
};

const improvementEmojis: Record<number, string> = {
  [ImprovementType.FARM]: '🏡', [ImprovementType.MINE]: '🏭', [ImprovementType.LUMBER_MILL]: '🪚',
  [ImprovementType.RANCH]: '🐮', [ImprovementType.OIL_WELL]: '🛢️', [ImprovementType.PLANTATION]: '🌿',
  [ImprovementType.DEPOT]: '🚉', [ImprovementType.PORT]: '⚓', [ImprovementType.CITY]: '🏙️',
};

function pseudoRandom(seed: number): number {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

/**
 * Draws a cluster of resources with randomized positions and scales.
 */
function drawResourceClump(
    ctx: CanvasRenderingContext2D, 
    x: number, 
    y: number, 
    size: number, 
    sprite: HTMLImageElement, 
    hex: Hex,
    defaultMin: number,
    defaultMax: number,
    baseScale: number,
    config: SpriteVisualConfig,
    cameraZoom: number,
    drawShadow: boolean
) {
    const seed = hex.q * 1327 + hex.r * 54321;
    const rng = (offset: number) => pseudoRandom(seed + offset);

    // Use Config counts if set, otherwise default
    const minC = config.clumpMin > 0 ? config.clumpMin : defaultMin;
    const maxC = config.clumpMax > 0 ? Math.max(config.clumpMax, minC) : defaultMax;

    // Number of items
    const count = minC + Math.floor(rng(1) * (maxC - minC + 1));
    
    const aspect = sprite.width / sprite.height;
    
    // Spread config (concentration near center)
    const spreadMult = config.clumpSpread || 1.0;
    const spreadX = size * 0.22 * spreadMult; 
    const spreadY = size * 0.12 * spreadMult; 
    
    const items = [];

    // Apply config shifts (SCALED BY ZOOM)
    const centerX = x + (config.shiftX * cameraZoom);
    const centerY = y + (config.shiftY * cameraZoom);

    for (let i = 0; i < count; i++) {
        // Randomized offset from center (x, y)
        const ox = (rng(i * 10 + 2) - 0.5) * 2 * spreadX;
        const oy = (rng(i * 10 + 3) - 0.5) * 2 * spreadY;
        
        // Random Scale variation (baseScale +/- variance) * Global Config Scale
        const scale = (baseScale + (rng(i * 10 + 4) * 0.15)) * config.scale; 
        
        // Random Flip
        const flip = rng(i * 10 + 5) > 0.5;

        items.push({
            x: centerX + ox,
            y: centerY + oy,
            scale,
            flip,
            // Sort key based on "ground" position (y)
            sortY: centerY + oy
        });
    }

    // Sort by Y to render back-to-front (depth)
    items.sort((a, b) => a.sortY - b.sortY);

    for (const item of items) {
        const h = size * item.scale;
        const w = h * aspect;

        if (drawShadow && config.shadowScale > 0) {
            ctx.save();
            ctx.beginPath();
            // Apply individual shadow settings (SCALED)
            const sx = item.x + ((config.shadowX || 0) * cameraZoom);
            const sy = item.y + ((config.shadowY || 0) * cameraZoom);
            ctx.ellipse(sx, sy, w * 0.3 * config.shadowScale, h * 0.1 * config.shadowScale, 0, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(0, 0, 0, ${config.shadowOpacity ?? 0.3})`;
            ctx.fill();
            ctx.restore();
        }

        if (item.flip) {
            ctx.save();
            ctx.translate(item.x, item.y);
            ctx.scale(-1, 1);
            // Draw centered horizontally, anchored at bottom vertically
            ctx.drawImage(sprite, -w / 2, -h, w, h);
            ctx.restore();
        } else {
            ctx.drawImage(sprite, item.x - w / 2, item.y - h, w, h);
        }
    }
}

export function drawTileContent(
    hex: Hex, 
    tile: TileData, 
    x: number, // Screen X
    y: number, // Screen Y
    camera: Camera, 
    hexSize: number, 
    assets: AssetManager,
    animalManager: AnimalManager
) {
    return (ctx: CanvasRenderingContext2D) => {
        // x, y are already screen coordinates
        const size = hexSize * camera.zoom;
        const isoOffset = size * -0.2;

        ctx.font = `${Math.floor(size * 0.6)}px "Segoe UI Emoji", sans-serif`;

        if (tile.isProspected && tile.improvement === ImprovementType.NONE && tile.resource === ResourceType.NONE) {
            ctx.font = `${Math.floor(size * 0.4)}px sans-serif`;
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.fillText('🔍', x, y);
            ctx.font = `${Math.floor(size * 0.6)}px "Segoe UI Emoji", sans-serif`;
        }

        // --- 1. RENDER IMPROVEMENTS (LAYER 1) ---
        if (tile.improvement !== ImprovementType.NONE &&
            ![ImprovementType.ROAD, ImprovementType.RAILROAD, ImprovementType.CITY].includes(tile.improvement)) {

            let improvementDrawnAsSprite = false;
            let spriteKey = '';

            // Determine Sprite Key based on Improvement Type
            if (tile.improvement === ImprovementType.DEPOT) spriteKey = 'STR_depot';
            else if (tile.improvement === ImprovementType.PORT) spriteKey = 'STR_port';
            else if (tile.improvement === ImprovementType.MINE) spriteKey = 'STR_mine';
            else if (tile.improvement === ImprovementType.FARM) spriteKey = 'STR_farm';
            else if (tile.improvement === ImprovementType.LUMBER_MILL) spriteKey = 'STR_lumber_mill';
            else if (tile.improvement === ImprovementType.OIL_WELL) spriteKey = 'STR_oil_well';
            else if (tile.improvement === ImprovementType.RANCH) {
                if (tile.resource === ResourceType.WOOL) spriteKey = 'STR_ranch_wool';
                else spriteKey = 'STR_ranch_livestock';
            }
            else if (tile.improvement === ImprovementType.PLANTATION) {
                if (tile.resource === ResourceType.COTTON) spriteKey = 'STR_plantation_cotton';
                else if (tile.resource === ResourceType.FRUIT) spriteKey = 'STR_plantation_fruit';
                else spriteKey = 'STR_plantation'; // Fallback / Generic
            }

            if (spriteKey) {
                const sprite = assets.getStructureSprite(spriteKey.replace('STR_', ''));
                
                if (sprite) {
                    const config = assets.getConfig(spriteKey);
                    const shouldDrawShadow = config.drawShadow ?? true;
                    const aspect = sprite.width / sprite.height;
                    const drawH = size * 1.5 * config.scale;
                    const drawW = drawH * aspect;
                    const drawY = y + isoOffset - drawH + (size * 1.1) + (config.shiftY * camera.zoom);
                    const drawX = x - drawW / 2 + (config.shiftX * camera.zoom);
                    
                    if (shouldDrawShadow && config.shadowScale > 0) {
                        const shadowY = drawY + drawH - (size * 0.1) + ((config.shadowY || 0) * camera.zoom);
                        const shadowX = x + (config.shiftX * camera.zoom) + ((config.shadowX || 0) * camera.zoom);
                        ctx.beginPath();
                        ctx.ellipse(shadowX, shadowY, drawW * 0.3 * config.shadowScale, drawH * 0.1 * config.shadowScale, 0, 0, Math.PI * 2);
                        ctx.fillStyle = `rgba(0, 0, 0, ${config.shadowOpacity ?? 0.3})`;
                        ctx.fill();
                    }

                    ctx.drawImage(sprite, drawX, drawY, drawW, drawH);
                    improvementDrawnAsSprite = true;
                }
            }

            if (!improvementDrawnAsSprite) {
                const impEmoji = improvementEmojis[tile.improvement] || '';
                if (impEmoji) {
                    ctx.fillText(impEmoji, x, y + isoOffset);
                }
            }

            // --- RENDER IMPROVEMENT LEVEL PIPS ---
            if (tile.improvementLevel > 1) {
                const level = tile.improvementLevel;
                ctx.fillStyle = '#fbbf24';
                const pipSize = size * 0.15;
                const startX = x + size * 0.4;
                const startY = y + isoOffset;

                for (let i = 0; i < level; i++) {
                    ctx.beginPath();
                    ctx.arc(startX, startY - (i * pipSize * 1.2) + (level * pipSize * 0.5), pipSize / 2, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke(); 
                }
            }
        }

        // --- 2. RENDER RESOURCES (LAYER 2 - ON TOP) ---
        if (tile.resource !== ResourceType.NONE && !tile.isHidden) {
            
            let resourceDrawnAsSprite = false;

            // EXCEPTION: Wood in Forest is visualized by the procedural terrain itself.
            if (tile.terrain === TerrainType.FOREST && tile.resource === ResourceType.WOOD) {
                resourceDrawnAsSprite = true; 
            }
            
            // ANIMATED LIVESTOCK (WOOL, MEAT)
            else if (tile.resource === ResourceType.WOOL || tile.resource === ResourceType.MEAT) {
                if (assets.animalSpriteSheet) {
                    const hasRanch = tile.improvement === ImprovementType.RANCH;
                    animalManager.drawAnimals(ctx, hex, x, y + isoOffset, size, tile.resource, assets, hasRanch);
                    resourceDrawnAsSprite = true;
                }
            }
            
            // Special Rendering for WHEAT (Natural Clump)
            else if (tile.resource === ResourceType.WHEAT) {
                const wheatSprite = assets.getResourceSprite(ResourceType.WHEAT);
                if (wheatSprite) {
                    const config = assets.getConfig(`RES_${tile.resource}`);
                    drawResourceClump(ctx, x, y + isoOffset, size, wheatSprite, hex, 8, 12, 0.5, config, camera.zoom, config.drawShadow ?? true);
                    resourceDrawnAsSprite = true;
                }
            }
            // Special Rendering for COTTON (Natural Clump)
            else if (tile.resource === ResourceType.COTTON) {
                const cottonSprite = assets.getResourceSprite(ResourceType.COTTON);
                if (cottonSprite) {
                    const config = assets.getConfig(`RES_${tile.resource}`);
                    drawResourceClump(ctx, x, y + isoOffset, size, cottonSprite, hex, 8, 12, 0.5, config, camera.zoom, config.drawShadow ?? true);
                    resourceDrawnAsSprite = true;
                }
            }
            // Special Rendering for FRUIT (3 Trees/Baskets)
            else if (tile.resource === ResourceType.FRUIT) {
                const fruitSprite = assets.getResourceSprite(ResourceType.FRUIT);
                if (fruitSprite) {
                    const config = assets.getConfig(`RES_${tile.resource}`);
                    drawResourceClump(ctx, x, y + isoOffset, size, fruitSprite, hex, 3, 3, 0.7, config, camera.zoom, config.drawShadow ?? true);
                    resourceDrawnAsSprite = true;
                }
            }

            // General Resource Sprite Rendering
            if (!resourceDrawnAsSprite) {
                const resSprite = assets.getResourceSprite(tile.resource);
                if (resSprite) {
                    // CONFIG LOOKUP
                    const config = assets.getConfig(`RES_${tile.resource}`);
                    const shouldDrawShadow = config.drawShadow ?? true;
                    
                    const aspect = resSprite.width / resSprite.height;
                    
                    // Base hardcoded scale fallback logic (preserved for safety)
                    let defaultScale = 0.8; 
                    if (tile.resource === ResourceType.MEAT) defaultScale = 1.2;

                    // Multiply by user config
                    const finalScale = defaultScale * config.scale;

                    const drawH = size * finalScale; 
                    const drawW = drawH * aspect;
                    
                    // Apply Shifts (SCALED)
                    const drawX = x - drawW / 2 + (config.shiftX * camera.zoom);
                    const drawY = y + isoOffset - drawH * 0.5 + (config.shiftY * camera.zoom);

                    // Blob Shadow
                    if (tile.resource !== ResourceType.MEAT && shouldDrawShadow && config.shadowScale > 0) {
                        const shadowY = drawY + drawH - (drawH * 0.1) + ((config.shadowY || 0) * camera.zoom);
                        const shadowX = x + (config.shiftX * camera.zoom) + ((config.shadowX || 0) * camera.zoom);
                        
                        ctx.beginPath();
                        ctx.ellipse(shadowX, shadowY, drawW * 0.3 * config.shadowScale, drawH * 0.1 * config.shadowScale, 0, 0, Math.PI * 2);
                        ctx.fillStyle = `rgba(0, 0, 0, ${config.shadowOpacity ?? 0.3})`;
                        ctx.fill();
                    }

                    ctx.drawImage(resSprite, drawX, drawY, drawW, drawH);
                    
                    resourceDrawnAsSprite = true;
                }
            }
            
            if (!resourceDrawnAsSprite) {
                const resEmoji = resourceEmojis[tile.resource];
                ctx.fillText(resEmoji, x - size * 0.3, y + isoOffset);
            }
        }
    };
}
