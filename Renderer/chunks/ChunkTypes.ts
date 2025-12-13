
import { Hex } from '../../Grid/HexMath';

export const CHUNK_SIZE = 16; // Tiles per chunk row/col (smaller = faster rebuild, more draw calls)
export const CHUNK_PADDING_TILES = 4; // Padding for overlap and large sprites

export enum ChunkLayer {
    BASE = 0,    // Terrain textures, Biomes
    INFRA = 1,   // Roads, Rails
    CONTENT = 2  // Resources, Forests, Improvements
}

export interface ChunkKey {
    col: number; // Chunk Grid X
    row: number; // Chunk Grid Y
}

export interface ChunkData {
    key: ChunkKey;
    worldX: number; // Pixel X of top-left (including padding)
    worldY: number; // Pixel Y of top-left (including padding)
    
    // Layers
    layers: Map<ChunkLayer, HTMLCanvasElement | OffscreenCanvas>;
    
    // Zoom levels per layer (allows mixing old and new layers during transition)
    layerZooms: Map<ChunkLayer, number>;

    // State
    isDirty: boolean; // General flag
    dirtyLayers: Set<ChunkLayer>;
    lastBuiltZoom: number; // General fallback
}
