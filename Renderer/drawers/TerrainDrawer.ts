
import { TerrainType, TileData, ImprovementType } from '../../Grid/GameMap';
import { Hex, hexToString } from '../../Grid/HexMath';
import { AssetManager } from '../AssetManager';
import { Camera, ISO_FACTOR } from '../RenderUtils';
import { noise } from '../../utils/SimplexNoise';

function pseudoRandom(seed: number): number {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

export function drawTexturedHex(
    ctx: CanvasRenderingContext2D, 
    x: number, 
    y: number, 
    size: number, 
    type: TerrainType,
    assets: AssetManager
) {
    const gridWidth = Math.sqrt(3) * size;
    const scale = gridWidth / 128; 
    const drawW = 128 * scale;
    
    // Base layer: always draw land or water to prevent gaps
    let baseType: 'water' | 'land' | 'desert' = 'land';
    if (type === TerrainType.WATER) baseType = 'water';
    if (type === TerrainType.DESERT) baseType = 'desert';
    
    const baseSprite = assets.getBaseSprite(baseType);
    
    if (baseSprite) {
        const aspect = baseSprite.width / baseSprite.height;
        const spriteH = drawW / aspect;
        ctx.drawImage(baseSprite, x - drawW/2, y - spriteH * 0.4, drawW, spriteH);
    }

    const isProcedural = type === TerrainType.FOREST || type === TerrainType.DESERT || type === TerrainType.MOUNTAIN || type === TerrainType.HILLS;
    const drawH = drawW;

    if (!isProcedural && type !== TerrainType.PLAINS && type !== TerrainType.WATER) {
        const overlaySprite = assets.getSprite(type);
        if (overlaySprite) {
            ctx.drawImage(overlaySprite, x - drawW/2, y - drawH/2, drawW, drawH);
        }
    }
}

export function drawDesertTile(
    hex: Hex,
    tile: TileData,
    camera: Camera,
    hexSize: number,
    desertData: Map<string, number> | undefined,
    assets: AssetManager
) {
    return (ctx: CanvasRenderingContext2D) => {};
}

export function drawForestTile(
    hex: Hex, 
    tile: TileData,
    screenX: number, // Screen coords passed in
    screenY: number, 
    camera: Camera, 
    hexSize: number, 
    assets: AssetManager, 
    forestData?: Map<string, number>,
    time: number = 0,
    windStrength: number = 0.5
) {
    return (ctx: CanvasRenderingContext2D) => {
        const size = hexSize * camera.zoom;
        
        const hasRoad = tile.improvement === ImprovementType.ROAD || tile.improvement === ImprovementType.RAILROAD;
        // Check for buildings to clear space (Lumber Mill, Mine, etc.)
        const hasBuilding = tile.improvement !== ImprovementType.NONE && 
                            tile.improvement !== ImprovementType.ROAD && 
                            tile.improvement !== ImprovementType.RAILROAD;

        let depth = 1;
        if (forestData) {
            const val = forestData.get(hexToString(hex));
            if (val !== undefined) depth = val;
        }

        const seed = (hex.q * 12345 + hex.r * 67890);
        const rng = (offset: number) => pseudoRandom(seed + offset);

        let minTrees = 3;
        let randomAdd = 3;
        let spreadMult = 0.75;
        let sizeMultiplier = 1.0;

        if (depth >= 3) {
            minTrees = 7;
            randomAdd = 4;
            spreadMult = 0.7;
        } else if (depth === 2) {
            minTrees = 5;
            randomAdd = 3;
        } else {
            minTrees = 3;
            randomAdd = 2;
            spreadMult = 0.8;
        }

        if (hasRoad) {
            minTrees = 2;
            randomAdd = 2; 
            sizeMultiplier = 0.65; 
            spreadMult = 0.9; 
        }

        // If there is a building, clear the forest significantly
        if (hasBuilding) {
            minTrees = 1;
            randomAdd = 2;
            sizeMultiplier = 0.6;
            spreadMult = 1.1; // Push to edges
        }

        const treeCount = minTrees + Math.floor(rng(0) * randomAdd);

        // Calculate Wind Noise for this Hex
        const wave = noise.noise2D(hex.q * 0.1 + time * 0.2, hex.r * 0.1); // Slow rolling wave
        
        // We will generate and sort trees on the fly deterministically to keep order
        // This array will hold the calculated props for this frame
        interface TreeProps {
            sprite: HTMLImageElement;
            x: number;
            y: number;
            w: number;
            h: number;
            flip: boolean;
            phase: number;
        }
        
        const trees: TreeProps[] = [];

        for (let i = 0; i < treeCount; i++) {
            const angle = rng(i + 1) * Math.PI * 2;
            let distBase = Math.sqrt(rng(i + 2));

            if (hasRoad || hasBuilding) {
                // Push trees away from center
                distBase = 0.5 + (distBase * 0.5);
            }

            const dist = distBase * (size * spreadMult);
            const offsetX = Math.cos(angle) * dist;
            const offsetY = Math.sin(angle) * dist * ISO_FACTOR;

            let variant = 1;
            const rVar = rng(i + 3);

            if (depth >= 3) {
                variant = rVar > 0.3 ? 4 : 3;
            } else if (depth === 2) {
                variant = rVar > 0.4 ? 3 : 2;
            } else {
                variant = rVar > 0.5 ? 2 : 1;
            }

            const sprite = assets.getForestSprite(variant);
            const flip = rng(i + 99) > 0.5;

            if (sprite) {
                let baseScale = 0.8;
                if (depth >= 3) {
                    baseScale = 1.0 + (rng(i+4) * 0.4);
                    if (depth > 4 && rVar > 0.8 && variant === 4) {
                            baseScale = 1.7;
                    }
                } else if (depth === 2) {
                    baseScale = 0.8 + (rng(i+4) * 0.2);
                } else {
                    baseScale = 0.6 + (rng(i+4) * 0.2);
                }

                baseScale *= sizeMultiplier;
                
                const baseH = size * 1.0; 
                const aspect = sprite.width / sprite.height;
                const drawH = baseH * baseScale;
                const drawW = drawH * aspect;
                const treeX = screenX + offsetX;
                const treeY = screenY + offsetY;

                // Deterministic Phase for local sway
                const phase = rng(i * 10) * Math.PI * 2;

                trees.push({
                    sprite,
                    x: treeX,
                    y: treeY,
                    w: drawW,
                    h: drawH,
                    flip,
                    phase
                });
            }
        }

        // Sort trees by Y to ensure correct occlusion within the tile
        trees.sort((a, b) => a.y - b.y);

        for (const tree of trees) {
            // Skew calculation (Wind Animation)
            // 1. Local Sway (leaves rustling)
            const localSway = Math.sin(time * 3 + tree.phase) * 0.03 * windStrength;
            
            // 2. Global Wind Gust (from noise)
            const globalGust = wave * 0.15 * windStrength; 
            
            // 3. Tree Stiffness (smaller trees bend more)
            // Since we don't have explicit size here easily without parsing, assume average.
            // Actually we have tree.h, smaller height = more bend usually? Or thicker trunk less bend.
            // Let's just keep it simple.
            const totalSkew = localSway + globalGust;

            const destX = tree.x - tree.w / 2;
            const destY = tree.y - tree.h * 0.9;
            
            // Pivot point for rotation/skew (Bottom center of the sprite)
            const pivotX = tree.x;
            const pivotY = tree.y;

            ctx.save();
            
            // Move to pivot
            ctx.translate(pivotX, pivotY);
            
            // Apply Skew transform
            // context.transform(hScale, vSkew, hSkew, vScale, dx, dy)
            ctx.transform(1, 0, totalSkew, 1, 0, 0);

            // Move back
            ctx.translate(-pivotX, -pivotY);

            if (tree.flip) {
                ctx.translate(tree.x, tree.y); 
                ctx.scale(-1, 1);
                ctx.drawImage(
                    tree.sprite, 
                    -tree.w / 2, 
                    -tree.h * 0.9, 
                    tree.w, 
                    tree.h
                );
            } else {
                ctx.drawImage(
                    tree.sprite, 
                    destX, 
                    destY, 
                    tree.w, 
                    tree.h
                );
            }
            
            ctx.restore();
        }
    };
}
