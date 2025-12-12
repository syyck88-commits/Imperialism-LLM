
import { GameMap, TileData, ImprovementType } from '../../Grid/GameMap';
import { Hex, getHexNeighbors } from '../../Grid/HexMath';
import { Camera, hexToScreen } from '../RenderUtils';

export function isConnectable(t: TileData): boolean {
    return t.improvement === ImprovementType.ROAD || 
        t.improvement === ImprovementType.RAILROAD || 
        t.improvement === ImprovementType.CITY || 
        t.improvement === ImprovementType.DEPOT ||
        t.improvement === ImprovementType.PORT ||
        t.improvement === ImprovementType.MINE ||
        t.improvement === ImprovementType.FARM ||
        t.improvement === ImprovementType.LUMBER_MILL ||
        t.improvement === ImprovementType.RANCH ||
        t.improvement === ImprovementType.PLANTATION ||
        t.improvement === ImprovementType.OIL_WELL;
}

export function drawTileConnections(map: GameMap, hex: Hex, screenX: number, screenY: number, camera: Camera, hexSize: number) {
    return (ctx: CanvasRenderingContext2D) => {
        ctx.lineWidth = Math.max(2, 6 * camera.zoom); 
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#64748b'; 

        const neighbors = getHexNeighbors(hex);
        
        ctx.beginPath();
        for (const n of neighbors) {
            if (!map.isValid(n.q, n.r)) continue;
            
            const nTile = map.getTile(n.q, n.r);
            if (nTile && isConnectable(nTile)) {
                // We still need neighbor screen pos. Since neighbors are 1 unit away, 
                // we could optimize this with relative offsets, but this is fast enough for now compared to map-wide iteration.
                // Re-calculating neighbor pos is safer than passing complex neighbor structs.
                const nPos = hexToScreen(n.q, n.r, camera, hexSize);
                const midX = (screenX + nPos.x) / 2;
                const midY = (screenY + nPos.y) / 2;
                ctx.moveTo(screenX, screenY);
                ctx.lineTo(midX, midY);
            }
        }
        ctx.stroke();
    };
}
