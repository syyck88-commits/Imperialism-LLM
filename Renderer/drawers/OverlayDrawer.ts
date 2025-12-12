
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

    private static isCollectionCenter(map: GameMap, hex: Hex): boolean {
        const tile = map.getTile(hex.q, hex.r);
        if (!tile) return false;
        return tile.improvement === ImprovementType.CITY || 
               tile.improvement === ImprovementType.DEPOT || 
               tile.improvement === ImprovementType.PORT;
    }
}
