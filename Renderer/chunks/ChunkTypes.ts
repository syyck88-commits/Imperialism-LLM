
import { GPUTextureHandle } from '../core/ITexture';
import { ISO_FACTOR } from '../RenderUtils';

export const CHUNK_SIZE = 16; // Tiles per chunk row/col (smaller = faster rebuild, more draw calls)
export const CHUNK_PADDING_TILES = 4; // Padding for overlap and large sprites

export enum ChunkLayer {
    BASE = 0,    // Terrain textures, Biomes
    INFRA = 1,   // Roads, Rails
}

export interface ChunkKey {
    col: number; // Chunk Grid X
    row: number; // Chunk Grid Y
}

export type NativeContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | WebGLRenderingContext | WebGL2RenderingContext;

export interface ChunkData {
    key: ChunkKey;
    worldX: number; // Pixel X of top-left (including padding)
    worldY: number; // Pixel Y of top-left (including padding)
    
    // Layers are now WebGL textures only
    layers: Map<ChunkLayer, GPUTextureHandle>;
    
    // Zoom levels per layer (allows mixing old and new layers during transition)
    layerZooms: Map<ChunkLayer, number>;

    // State
    dirtyLayers: Set<ChunkLayer>;
    lastUsed: number; // LRU Tracking
}

export interface ChunkMetrics {
    baseHexWidth: number;
    baseRowHeight: number;
    padX: number;
    padY: number;
    chunkWorldWidth: number;
    chunkWorldHeight: number;
}

/**
 * Centralized calculation for chunk dimensions to ensure vertical alignment 
 * matches the isometric projection exactly.
 */
export function getChunkMetrics(hexSize: number): ChunkMetrics {
    const baseHexWidth = Math.sqrt(3) * hexSize;
    // Vertical distance between rows in isometric view
    const baseRowHeight = hexSize * 1.5 * ISO_FACTOR;

    // Total Padding (Left + Right, Top + Bottom)
    // We divide by 2 to get the offset for one side
    const padX = baseHexWidth * (CHUNK_PADDING_TILES / 2);
    
    // FIX: Must use baseRowHeight for vertical padding, NOT baseHexWidth
    const padY = baseRowHeight * (CHUNK_PADDING_TILES / 2);

    const chunkWorldWidth = (CHUNK_SIZE * baseHexWidth) + (baseHexWidth * CHUNK_PADDING_TILES);
    // FIX: Must use baseRowHeight for total height calculation
    const chunkWorldHeight = (CHUNK_SIZE * baseRowHeight) + (baseRowHeight * CHUNK_PADDING_TILES);

    return {
        baseHexWidth,
        baseRowHeight,
        padX,
        padY,
        chunkWorldWidth,
        chunkWorldHeight
    };
}
