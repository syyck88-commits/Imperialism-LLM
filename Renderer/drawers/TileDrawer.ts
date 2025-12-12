
import { GameMap, TerrainType, TileData, ImprovementType, ResourceType } from '../../Grid/GameMap';
import { Hex, areHexesEqual } from '../../Grid/HexMath';
import { Unit } from '../../Entities/Unit';
import { AssetManager } from '../AssetManager';
import { Camera, ISO_FACTOR } from '../RenderUtils';
import { AnimalManager } from '../effects/AnimalManager';

// Sub-drawers
import { drawTexturedHex as drawBaseTerrain, drawForestTile } from './TerrainDrawer';
import { drawTileContent } from './ContentDrawer';
import { drawTileConnections, isConnectable } from './InfrastructureDrawer';

export class TileDrawer {
    
    public static populateBuckets(
        infraBucket: (() => void)[],
        contentBucket: (() => void)[],
        ctx: CanvasRenderingContext2D,
        hex: Hex,
        screenX: number,
        screenY: number,
        tile: TileData,
        camera: Camera,
        hexSize: number,
        assets: AssetManager,
        map: GameMap,
        selectedUnit: Unit | null,
        validMoves: Hex[],
        animalManager: AnimalManager,
        forestData?: Map<string, number>,
        desertData?: Map<string, number>,
        time: number = 0,
        windStrength: number = 0.5
    ) {
        // --- Infrastructure Layer ---
        if (isConnectable(tile)) {
            infraBucket.push(() => drawTileConnections(map, hex, screenX, screenY, camera, hexSize)(ctx));
        }

        if (selectedUnit && validMoves.some(vm => areHexesEqual(vm, hex))) {
            infraBucket.push(() => {
                const currentHexSize = hexSize * camera.zoom;
                const uiDrawW = Math.ceil(Math.sqrt(3) * currentHexSize);
                const uiDrawH = Math.ceil((2 * currentHexSize * ISO_FACTOR) + 4);
                ctx.drawImage(
                    assets.uiSprites,
                    assets.uiMap.move.x * assets.uiTileW, 0, assets.uiTileW, assets.uiTileH,
                    screenX - uiDrawW/2, screenY - uiDrawH/2, uiDrawW, uiDrawH
                );
            });
        }

        // --- Content Layer ---
        // Procedural Forest
        if (tile.terrain === TerrainType.FOREST) {
            contentBucket.push(() => drawForestTile(hex, tile, screenX, screenY, camera, hexSize, assets, forestData, time, windStrength)(ctx));
            return;
        }

        // Normal Content
        const hasVisibleContent = 
            (tile.isProspected && tile.improvement === ImprovementType.NONE && tile.resource === ResourceType.NONE) ||
            (tile.resource !== ResourceType.NONE && !tile.isHidden) ||
            (tile.improvement !== ImprovementType.NONE && tile.improvement !== ImprovementType.ROAD && tile.improvement !== ImprovementType.RAILROAD && tile.improvement !== ImprovementType.CITY);
        
        if (hasVisibleContent) {
            contentBucket.push(() => drawTileContent(hex, tile, screenX, screenY, camera, hexSize, assets, animalManager)(ctx));
        }
    }

    public static drawTexturedHex(
        ctx: CanvasRenderingContext2D, 
        x: number, 
        y: number, 
        size: number, 
        type: TerrainType,
        assets: AssetManager
    ) {
        drawBaseTerrain(ctx, x, y, size, type, assets);
    }
}
