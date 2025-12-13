
import { ChunkData, ChunkLayer, CHUNK_SIZE, CHUNK_PADDING_TILES } from './ChunkTypes';
import { GameMap, TileData, ImprovementType } from '../../Grid/GameMap';
import { AssetManager } from '../AssetManager';
import { TileDrawer } from '../drawers/TileDrawer';
import { offsetToAxial, Hex } from '../../Grid/HexMath';
import { Camera, hexToScreen, ISO_FACTOR } from '../RenderUtils';
import { AnimalManager } from '../effects/AnimalManager';

export class ChunkRenderer {
    
    /**
     * Rebuilds a specific layer of a chunk.
     */
    public static rebuildLayer(
        chunk: ChunkData, 
        layer: ChunkLayer, 
        map: GameMap, 
        assets: AssetManager,
        hexSize: number,
        zoom: number,
        forestData: Map<string, number>,
        desertData: Map<string, number>,
        animalManager: AnimalManager
    ) {
        let canvas = chunk.layers.get(layer);
        
        // Calculate dimensions. 
        // We need padding because hexes overlap and 3D sprites (mountains) stick up/out.
        
        // Logical width/height in pixels at zoom 1.0 (base resolution)
        // We apply the 'zoom' factor (bucket) to the canvas size itself for crispness.
        const baseHexWidth = Math.sqrt(3) * hexSize;
        const baseRowHeight = hexSize * 1.5 * ISO_FACTOR;
        
        const chunkPixelW = (CHUNK_SIZE * baseHexWidth + (baseHexWidth * CHUNK_PADDING_TILES)) * zoom;
        const chunkPixelH = (CHUNK_SIZE * baseRowHeight + (baseHexWidth * CHUNK_PADDING_TILES)) * zoom;

        // Origin offset to allow drawing "out of bounds" items (padding)
        const offsetX = (baseHexWidth * (CHUNK_PADDING_TILES / 2)) * zoom;
        const offsetY = (baseRowHeight * (CHUNK_PADDING_TILES / 2)) * zoom;

        if (!canvas) {
            if (typeof OffscreenCanvas !== 'undefined') {
                canvas = new OffscreenCanvas(chunkPixelW, chunkPixelH);
            } else {
                canvas = document.createElement('canvas');
                canvas.width = chunkPixelW;
                canvas.height = chunkPixelH;
            }
            chunk.layers.set(layer, canvas);
        } else {
            if (canvas.width !== Math.ceil(chunkPixelW)) canvas.width = Math.ceil(chunkPixelW);
            if (canvas.height !== Math.ceil(chunkPixelH)) canvas.height = Math.ceil(chunkPixelH);
        }

        const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
        if (!ctx) return;

        // Clear
        ctx.clearRect(0, 0, chunkPixelW, chunkPixelH);

        // We create a Mock Camera that simulates the chunk's local coordinate system at the requested zoom level.
        // Screen (0,0) corresponds to the Chunk's top-left tile (minus padding).
        const startCol = chunk.key.col * CHUNK_SIZE;
        const startRow = chunk.key.row * CHUNK_SIZE;
        
        const startQ = startCol - (startRow - (startRow & 1)) / 2;
        const startHex = { q: startQ, r: startRow };
        
        // Calculate where the FIRST tile of the chunk would be in this local canvas
        // Local Camera translation:
        // We want tile(startCol, startRow) to be at (offsetX, offsetY) roughly.
        // Actually, hexToScreen logic: 
        // screenX = worldX * zoom - camX * zoom
        // We want screenX = offsetX.
        // So camX * zoom = worldX * zoom - offsetX
        // camX = worldX - (offsetX / zoom)
        
        const startWorldX = hexSize * Math.sqrt(3) * (startHex.q + startHex.r/2);
        const startWorldY = (hexSize * 1.5 * startHex.r) * ISO_FACTOR;
        
        const mockCamera: Camera = {
            x: startWorldX - (offsetX / zoom),
            y: startWorldY - (offsetY / zoom),
            zoom: zoom, // Bake at bucket zoom
            width: chunkPixelW,
            height: chunkPixelH
        };

        // Draw Loop
        // Iterate slightly outside chunk bounds to handle edge bleed/neighbors
        // Using "buckets" approach from TileDrawer but immediate execution
        
        const infraBucket: (() => void)[] = [];
        const contentBucket: (() => void)[] = [];
        
        const endRow = startRow + CHUNK_SIZE;
        const endCol = startCol + CHUNK_SIZE;

        // Render Order: Top-to-Bottom (Row) then Left-to-Right
        for (let r = startRow - 2; r < endRow + 2; r++) {
            for (let c = startCol - 2; c < endCol + 2; c++) {
                // Bounds check within Map
                if (c < 0 || c >= map.width || r < 0 || r >= map.height) continue;

                // Axial conversion
                const q = c - (r - (r & 1)) / 2;
                const tile = map.getTile(q, r);
                
                if (!tile) continue;

                const hex = {q, r};
                const {x, y} = hexToScreen(q, r, mockCamera, hexSize);

                // Use TileDrawer logic (reused)
                // Note: We don't have selectedUnit or validMoves here; those are dynamic layers.
                
                // --- LAYER SELECTOR ---
                if (layer === ChunkLayer.BASE) {
                    TileDrawer.drawTexturedHex(ctx as CanvasRenderingContext2D, x, y, hexSize * zoom, tile.terrain, assets);
                }
                else if (layer === ChunkLayer.INFRA) {
                    // Populate infra bucket using TileDrawer helper
                    // Exclude Move Highlights in baked chunks
                    TileDrawer.populateBuckets(
                        infraBucket, 
                        [], 
                        ctx as CanvasRenderingContext2D, 
                        hex, x, y, tile, mockCamera, hexSize, assets, map, 
                        null, [], animalManager, undefined, undefined, 0, 0,
                        { includeMoveHighlights: false }
                    );
                }
                else if (layer === ChunkLayer.CONTENT) {
                    // Populate content bucket
                    // Exclude Forests and Animals (Dynamic)
                    TileDrawer.populateBuckets(
                        [], 
                        contentBucket, 
                        ctx as CanvasRenderingContext2D, 
                        hex, x, y, tile, mockCamera, hexSize, assets, map, 
                        null, [], animalManager, forestData, desertData, 0, 0,
                        { includeForest: false, includeAnimals: false }
                    );
                }
            }
            
            // Execute row buckets immediately
            if (layer === ChunkLayer.INFRA) {
                infraBucket.forEach(fn => fn());
                infraBucket.length = 0;
            }
            if (layer === ChunkLayer.CONTENT) {
                contentBucket.forEach(fn => fn());
                contentBucket.length = 0;
            }
        }
    }
}
