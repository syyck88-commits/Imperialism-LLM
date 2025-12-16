
import { Hex, areHexesEqual, getHexRange } from '../../Grid/HexMath';
import { GameMap, ImprovementType } from '../../Grid/GameMap';
import { Unit } from '../../Entities/Unit';
import { AssetManager } from '../AssetManager';
import { Camera, hexToScreen, ISO_FACTOR, getHexPath2D } from '../RenderUtils';

export class OverlayDrawer {

    public static drawPath(
        ctx: CanvasRenderingContext2D,
        path: Hex[],
        selectedUnit: Unit | null,
        camera: Camera,
        hexSize: number,
        assets: AssetManager
    ) {
        if (!selectedUnit || path.length === 0) return;

        const uiDrawW = Math.ceil(Math.sqrt(3) * hexSize * camera.zoom);
        const uiDrawH = Math.ceil((2 * hexSize * camera.zoom * ISO_FACTOR) + 4);
        const { uiSprites, uiMap, uiTileW, uiTileH } = assets;

        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 4 * camera.zoom;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash([10 * camera.zoom, 10 * camera.zoom]);
        
        const startPos = hexToScreen(selectedUnit.visualPos.q, selectedUnit.visualPos.r, camera, hexSize);
        ctx.moveTo(startPos.x, startPos.y);

        for (const hex of path) {
            const pos = hexToScreen(hex.q, hex.r, camera, hexSize);
            ctx.lineTo(pos.x, pos.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        
        const last = path[path.length - 1];
        const lastPos = hexToScreen(last.q, last.r, camera, hexSize);
        ctx.drawImage(
            uiSprites,
            uiMap.path.x * uiTileW, 0, uiTileW, uiTileH,
            lastPos.x - uiDrawW/2, lastPos.y - uiDrawH/2, uiDrawW, uiDrawH
        );
    }

    public static drawHighlight(
        ctx: CanvasRenderingContext2D, 
        camera: Camera, 
        hex: Hex,
        hexSize: number,
        assets: AssetManager
    ) {
        const { x, y } = hexToScreen(hex.q, hex.r, camera, hexSize);
        const currentHexSize = hexSize * camera.zoom;
        
        // Use cached path for outline if needed, or sprite
        // Using sprite from AssetManager is usually faster for simple glows
        const uiDrawW = Math.ceil(Math.sqrt(3) * currentHexSize);
        const uiDrawH = Math.ceil((2 * currentHexSize * ISO_FACTOR) + 4);
        
        ctx.drawImage(
            assets.uiSprites,
            assets.uiMap.highlight.x * assets.uiTileW, 0, assets.uiTileW, assets.uiTileH,
            x - uiDrawW/2, y - uiDrawH/2, uiDrawW, uiDrawH
        );
    }

    public static drawRadiusHighlight(
        ctx: CanvasRenderingContext2D,
        camera: Camera,
        map: GameMap,
        hexSize: number,
        assets: AssetManager,
        previewHighlightHex: Hex | null,
        selectedHex: Hex | null
    ) {
        let highlightCenter = previewHighlightHex;
        if (!highlightCenter && selectedHex && this.isCollectionCenter(map, selectedHex)) {
            highlightCenter = selectedHex;
        }
        if (!highlightCenter) return;

        const tile = map.getTile(highlightCenter.q, highlightCenter.r);
        const radius = (tile && tile.improvement === ImprovementType.CITY) ? 2 : 1;
        
        const radiusHexes = getHexRange(highlightCenter, radius);
        const currentHexSize = hexSize * camera.zoom;
        const uiDrawW = Math.ceil(Math.sqrt(3) * currentHexSize);
        const uiDrawH = Math.ceil((2 * currentHexSize * ISO_FACTOR) + 4);

        for (const hex of radiusHexes) {
            if (!map.isValid(hex.q, hex.r)) continue;
            const { x, y } = hexToScreen(hex.q, hex.r, camera, hexSize);
            
            ctx.drawImage(
                assets.uiSprites,
                assets.uiMap.move.x * assets.uiTileW, 0, assets.uiTileW, assets.uiTileH,
                x - uiDrawW/2, y - uiDrawH/2, uiDrawW, uiDrawH
            );
        }
    }
    
    public static drawSelectionCursor(
        ctx: CanvasRenderingContext2D,
        camera: Camera,
        hexSize: number,
        assets: AssetManager,
        selectedHex: Hex | null,
        selectedUnit: Unit | null
    ) {
        if (!selectedHex) return;
        if (selectedUnit && areHexesEqual(selectedUnit.location, selectedHex)) return;

        const { x, y } = hexToScreen(selectedHex.q, selectedHex.r, camera, hexSize);
        const currentHexSize = hexSize * camera.zoom;
        
        const path = getHexPath2D(currentHexSize - (2 * camera.zoom), ISO_FACTOR);
        
        ctx.save();
        ctx.translate(x, y);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 4;
        ctx.stroke(path);
        ctx.restore();
    }

    public static drawValidMoves(
        ctx: CanvasRenderingContext2D,
        camera: Camera,
        hexSize: number,
        assets: AssetManager,
        validMoves: Hex[]
    ) {
        if (validMoves.length === 0) return;

        const currentHexSize = hexSize * camera.zoom;
        const uiDrawW = Math.ceil(Math.sqrt(3) * currentHexSize);
        const uiDrawH = Math.ceil((2 * currentHexSize * ISO_FACTOR) + 4);

        for (const hex of validMoves) {
            const { x, y } = hexToScreen(hex.q, hex.r, camera, hexSize);
            ctx.drawImage(
                assets.uiSprites,
                assets.uiMap.move.x * assets.uiTileW, 0, assets.uiTileW, assets.uiTileH,
                x - uiDrawW/2, y - uiDrawH/2, uiDrawW, uiDrawH
            );
        }
    }

    private static isCollectionCenter(map: GameMap, hex: Hex): boolean {
        const tile = map.getTile(hex.q, hex.r);
        if (!tile) return false;
        return tile.improvement === ImprovementType.CITY || 
               tile.improvement === ImprovementType.DEPOT || 
               tile.improvement === ImprovementType.PORT;
    }
}

export class UnitDrawer {

    public static populateBucket(
        bucket: (() => void)[],
        ctx: CanvasRenderingContext2D,
        units: Unit[],
        selectedUnit: Unit | null,
        camera: Camera,
        hexSize: number,
        assets: AssetManager
    ) {
        for (const unit of units) {
            const { x, y } = hexToScreen(unit.visualPos.q, unit.visualPos.r, camera, hexSize);
            // Culling
            if (x < -50 || x > camera.width + 50 || y < -50 || y > camera.height + 50) continue;

            bucket.push(() => this.drawUnit(unit, selectedUnit, x, y, hexSize, camera, assets)(ctx));
        }
    }

    private static drawUnit(
        unit: Unit,
        selectedUnit: Unit | null,
        x: number,
        y: number,
        hexSize: number,
        camera: Camera,
        assets: AssetManager
    ) {
        return (ctx: CanvasRenderingContext2D) => {
            const size = hexSize * camera.zoom;
            const isoOffset = size * -0.2; // Stand on top of block

            if (selectedUnit && unit.id === selectedUnit.id) {
                ctx.beginPath();
                ctx.ellipse(x, y + isoOffset, size * 0.6, size * 0.6 * ISO_FACTOR, 0, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(251, 191, 36, 0.4)';
                ctx.fill();
                ctx.strokeStyle = '#fbbf24';
                ctx.lineWidth = 2;
                ctx.stroke();
            }

            const sprite = assets.getUnitSprite(unit.type);
            
            if (sprite) {
                // CONFIG LOOKUP
                const config = assets.getConfig(`UNIT_${unit.type}`);

                const aspect = sprite.width / sprite.height;
                // Base 1.5 multiplier times config scale
                const drawH = size * 1.5 * config.scale; 
                const drawW = drawH * aspect;
                
                // Shifts (Scaled by Zoom to prevent drift)
                const shiftXScaled = config.shiftX * camera.zoom;
                const shiftYScaled = config.shiftY * camera.zoom;

                const drawX = x - drawW / 2 + shiftXScaled;
                const drawY = y + isoOffset - drawH + (size * 0.2) + shiftYScaled;

                // Blob Shadow
                if ((config.drawShadow ?? true) && config.shadowScale > 0) {
                     const shadowXScaled = (config.shadowX || 0) * camera.zoom;
                     const shadowYScaled = (config.shadowY || 0) * camera.zoom;

                     ctx.beginPath();
                     const sx = x + shiftXScaled + shadowXScaled;
                     const sy = y + isoOffset + shadowYScaled;
                     ctx.ellipse(sx, sy, drawW * 0.3 * config.shadowScale, drawW * 0.15 * config.shadowScale, 0, 0, Math.PI * 2);
                     ctx.fillStyle = `rgba(0,0,0,${config.shadowOpacity ?? 0.3})`;
                     ctx.fill();
                }

                ctx.drawImage(sprite, drawX, drawY, drawW, drawH);
            } else {
                ctx.font = `${Math.floor(size * 0.8)}px sans-serif`;
                ctx.fillStyle = '#ffffff';
                ctx.fillText(unit.getEmoji(), x, y + isoOffset - size*0.1);
            }

            if (unit.movesLeft < unit.maxMoves) {
                const barW = size * 0.66;
                const barH = 4 * camera.zoom;
                ctx.fillStyle = '#ef4444'; 
                ctx.fillRect(x - size/3, y + isoOffset + size/2, barW, barH);
                ctx.fillStyle = '#fbbf24'; 
                ctx.fillRect(x - size/3, y + isoOffset + size/2, barW * (unit.movesLeft / unit.maxMoves), barH);
            }
        };
    }
}
