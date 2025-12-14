
import { ChunkLayer, CHUNK_SIZE, CHUNK_PADDING_TILES, getChunkMetrics } from './ChunkTypes';
import { TileData, ImprovementType, ResourceType } from '../../Grid/GameMap';
import { AssetManager } from '../AssetManager';
import { Hex } from '../../Grid/HexMath';
import { hexToScreen, ISO_FACTOR } from '../RenderUtils';
import { WebGLChunkLayerBuilder } from './WebGLChunkLayerBuilder';
import { GPUResourceRegistry } from '../core/GPUResourceRegistry';

export class ChunkRenderer {
    
    /**
     * Rebuilds a specific layer of a chunk.
     */
    public static rebuildLayer(
        chunk: any, 
        layer: ChunkLayer, 
        map: any, 
        assets: AssetManager,
        hexSize: number,
        zoom: number,
        forestData: Map<string, number>,
        desertData: Map<string, number>,
        gpuContext?: WebGLRenderingContext | WebGL2RenderingContext | null
    ) {
        // Explicitly ignore obsolete layers. CONTENT is now handled by instancing managers.
        if (layer !== ChunkLayer.BASE && layer !== ChunkLayer.INFRA) {
            return;
        }

        if (!gpuContext) return; // This path is now WebGL only

        const metrics = getChunkMetrics(hexSize);
        const chunkPixelW = metrics.chunkWorldWidth * zoom;
        const chunkPixelH = metrics.chunkWorldHeight * zoom;

        const offsetX = metrics.padX * zoom;
        const offsetY = metrics.padY * zoom;

        const startCol = chunk.key.col * CHUNK_SIZE;
        const startRow = chunk.key.row * CHUNK_SIZE;
        
        const startQ = startCol - (startRow - (startRow & 1)) / 2;
        const startHex = { q: startQ, r: startRow };
        
        const startWorldX = hexSize * Math.sqrt(3) * (startHex.q + startHex.r/2);
        const startWorldY = (hexSize * 1.5 * startHex.r) * ISO_FACTOR;
        
        const mockCamera = {
            x: startWorldX - (offsetX / zoom),
            y: startWorldY - (offsetY / zoom),
            zoom: zoom, 
            width: chunkPixelW,
            height: chunkPixelH
        };

        const builder = new WebGLChunkLayerBuilder(gpuContext, mockCamera, hexSize, assets);
        if (!builder.isValid()) {
            console.error(`ChunkRenderer: WebGL Builder failed for layer ${layer}.`);
            return;
        }
        
        builder.clear();
        
        const endRow = startRow + CHUNK_SIZE;
        const endCol = startCol + CHUNK_SIZE;

        for (let r = startRow - 2; r < endRow + 2; r++) {
            for (let c = startCol - 2; c < endCol + 2; c++) {
                if (c < 0 || c >= map.width || r < 0 || r >= map.height) continue;
                const q = c - (r - (r & 1)) / 2;
                const tile = map.getTile(q, r);
                if (!tile) continue;

                const hex = {q, r};
                const {x, y} = hexToScreen(q, r, mockCamera, hexSize);

                if (layer === ChunkLayer.BASE) {
                    builder.addBaseHex(x, y, hexSize * zoom, tile.terrain);
                }
                else if (layer === ChunkLayer.INFRA) {
                    builder.addInfraTile(hex, tile, map);
                }
            }
        }

        builder.flush();
        const resultTexture = builder.getRenderedTexture();
        if (resultTexture && gpuContext) {
            // Generate Mipmaps for the newly rendered texture if it was created with multiple levels.
            if ((resultTexture.mipLevels ?? 1) > 1) {
                gpuContext.bindTexture(gpuContext.TEXTURE_2D, resultTexture.texture);
                gpuContext.generateMipmap(gpuContext.TEXTURE_2D);
                gpuContext.bindTexture(gpuContext.TEXTURE_2D, null);
            }

            const oldLayer = chunk.layers.get(layer);
            chunk.layers.set(layer, resultTexture);

            // Evict old texture to prevent VRAM leak
            if (oldLayer && oldLayer.texture && oldLayer !== resultTexture) {
                gpuContext.deleteTexture(oldLayer.texture);
                GPUResourceRegistry.getInstance().unregisterTexture(oldLayer);
            }
        }
        builder.dispose();
    }
}
