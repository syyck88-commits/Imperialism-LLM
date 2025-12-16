
import { ChunkData, ChunkKey, ChunkLayer, CHUNK_SIZE, CHUNK_PADDING_TILES, getChunkMetrics, ChunkRenderer } from './Chunks';
import { GameMap, TileData } from '../../Grid/GameMap';
import { AssetManager } from '../AssetManager';
import { Camera, hexToScreen, ISO_FACTOR } from '../RenderUtils';
import { GPUTextureHandle, GPUResourceRegistry } from '../core/Core';

const ZOOM_EPSILON = 1e-3;
const zoomEqual = (a: number, b: number) => Math.abs(a - b) < ZOOM_EPSILON;

// New constants
const INTERACTION_THROTTLE_MS = 200;
const INTERACTION_MOVE_THRESHOLD_PX = 1;
const TASK_BUDGET_INTERACTING_MS = 4.0;
const TASK_BUDGET_IDLE_MS = 8.0;
const VISIBLE_CHUNK_PADDING = 4;

// LRU Constants
const DEBUG_CHUNKS = false;
const MAX_CHUNKS_IN_CACHE = 512;
const MAX_ESTIMATED_VRAM_BYTES = 1024 * 1024 * 1024; // 1024 MB
const EVICTION_LOG_INTERVAL = 2000; // ms
const LOD_LOG_INTERVAL = 2000; // ms

interface DirtyTask {
    key: string;
    layer: ChunkLayer;
    zoom: number;
}

export class ChunkManager {
    private chunks: Map<string, ChunkData> = new Map();
    private map: GameMap;
    private assets: AssetManager;
    private hexSize: number;
    
    // Dependencies needed for drawing
    public forestData: Map<string, number> = new Map();
    public desertData: Map<string, number> = new Map();

    // Task Management
    private taskQueue: DirtyTask[] = [];

    // Interaction & Zoom Control
    private lastCamX: number = 0;
    private lastCamY: number = 0;
    private lastCamZoom: number = 0;
    private lastInteractionTime: number = 0;

    // Diagnostics
    private lastEvictionLogTime: number = 0;
    private evictedInCycle: number = 0;
    private freedBytesInCycle: number = 0;
    private lastLodLogTime: number = 0;

    // Performance Caches
    private maxTextureSize: number | null = null;

    constructor(map: GameMap, assets: AssetManager, hexSize: number) {
        this.map = map;
        this.assets = assets;
        this.hexSize = hexSize;

        // Subscribe to map changes
        this.map.onTileChanged(this.handleTileChange.bind(this));

        // Subscribe to config changes
        window.addEventListener('SPRITE_CONFIG_CHANGED', (e: any) => {
            const key = e.detail?.key as string;
            this.handleConfigChange(key);
        });
    }

    public onContextLost() {
        console.warn("ChunkManager: Context Lost. Clearing chunk textures.");
        this.maxTextureSize = null; // Reset cached GL parameter
        for (const chunk of this.chunks.values()) {
            // All layers are GPU textures now. On context loss, they are invalid.
            // We don't have GL context here to delete, just clear handles from the map.
            chunk.layers.clear();
            chunk.layerZooms.clear();
            
            // Mark dirty to force rebuild when context restores
            chunk.dirtyLayers.add(ChunkLayer.BASE);
            chunk.dirtyLayers.add(ChunkLayer.INFRA);
        }
    }

    private handleConfigChange(key: string) {
        if (key.startsWith('STR_') || key.startsWith('RES_')) {
            // These are handled by instancing manager, no need to invalidate chunks
        } else if (!key.startsWith('UNIT_')) {
            this.invalidateAll(ChunkLayer.BASE);
            this.invalidateAll(ChunkLayer.INFRA);
        }
    }

    public invalidateAll(layer: ChunkLayer) {
        for (const chunk of this.chunks.values()) {
            chunk.dirtyLayers.add(layer);
        }
    }

    /**
     * Maps TILE coordinates to a chunk key string.
     */
    private getChunkKey(col: number, row: number): string {
        return this.chunkKeyStrFromCoords(Math.floor(col / CHUNK_SIZE), Math.floor(row / CHUNK_SIZE));
    }

    /**
     * Creates a canonical key string from CHUNK coordinates.
     */
    private chunkKeyStrFromCoords(chunkCol: number, chunkRow: number): string {
        return `${chunkCol},${chunkRow}`;
    }

    private getChunkCoords(keyStr: string): ChunkKey {
        const [c, r] = keyStr.split(',').map(Number);
        return { col: c, row: r };
    }
    
    /**
     * Creates a canonical key string from a ChunkData object.
     */
    private chunkKeyStr(chunk: ChunkData): string {
        return this.chunkKeyStrFromCoords(chunk.key.col, chunk.key.row);
    }

    private handleTileChange(q: number, r: number, data: Partial<TileData>) {
        const col = q + (r - (r & 1)) / 2;
        const row = r;
        
        const key = this.getChunkKey(col, row);
        const chunk = this.getOrCreateChunk(key);

        if (data.terrain !== undefined) {
            chunk.dirtyLayers.add(ChunkLayer.BASE);
        }
        
        if (data.improvement !== undefined || data.improvementLevel !== undefined) {
            chunk.dirtyLayers.add(ChunkLayer.INFRA);
            this.invalidateNeighbors(col, row);
        }
    }

    private invalidateNeighbors(col: number, row: number) {
        const cLocal = col % CHUNK_SIZE;
        const rLocal = row % CHUNK_SIZE;
        
        if (cLocal === 0 || cLocal === CHUNK_SIZE - 1 || rLocal === 0 || rLocal === CHUNK_SIZE - 1) {
             const cKey = Math.floor(col / CHUNK_SIZE);
             const rKey = Math.floor(row / CHUNK_SIZE);
             this.markChunkDirty(this.chunkKeyStrFromCoords(cKey + 1, rKey), ChunkLayer.INFRA);
             this.markChunkDirty(this.chunkKeyStrFromCoords(cKey - 1, rKey), ChunkLayer.INFRA);
             this.markChunkDirty(this.chunkKeyStrFromCoords(cKey, rKey + 1), ChunkLayer.INFRA);
             this.markChunkDirty(this.chunkKeyStrFromCoords(cKey, rKey - 1), ChunkLayer.INFRA);
        }
    }

    private markChunkDirty(key: string, layer: ChunkLayer) {
        if (this.chunks.has(key)) {
            const c = this.chunks.get(key)!;
            c.dirtyLayers.add(layer);
        }
    }

    private getOrCreateChunk(key: string): ChunkData {
        if (!this.chunks.has(key)) {
            const { col: chunkCol, row: chunkRow } = this.getChunkCoords(key);
            
            const startCol = chunkCol * CHUNK_SIZE;
            const startRow = chunkRow * CHUNK_SIZE;
            const startQ = startCol - (startRow - (startRow & 1)) / 2;

            const startWorldX = this.hexSize * Math.sqrt(3) * (startQ + startRow / 2);
            const startWorldY = (this.hexSize * 1.5 * startRow) * ISO_FACTOR;

            const metrics = getChunkMetrics(this.hexSize);

            const worldX = startWorldX - metrics.padX;
            const worldY = startWorldY - metrics.padY;

            this.chunks.set(key, {
                key: { col: chunkCol, row: chunkRow },
                worldX,
                worldY,
                layers: new Map(),
                layerZooms: new Map(),
                dirtyLayers: new Set([ChunkLayer.BASE, ChunkLayer.INFRA]),
                lastUsed: performance.now()
            });
        }
        return this.chunks.get(key)!;
    }

    private getMaxTextureSize(gl: WebGLRenderingContext | WebGL2RenderingContext): number {
        if (this.maxTextureSize === null) {
            this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
        }
        return this.maxTextureSize || 2048; // Fallback
    }

    /**
     * Determines the target baking resolution for a given layer based on camera zoom.
     */
    private getTargetZoomForLayer(layer: ChunkLayer, cameraZoom: number, gpuContext: WebGLRenderingContext | WebGL2RenderingContext | null): number {
        let targetZoom: number;

        if (layer === ChunkLayer.BASE) {
            // Adaptive for BASE layer to save VRAM on zoom-out
            targetZoom = cameraZoom < 0.75 ? 0.5 : 1.0;
        } else {
            // INFRA are always baked at high resolution for clarity
            targetZoom = 1.0;
        }

        // Apply a cap for very high zoom levels to prevent creating textures larger than the GPU supports.
        if (gpuContext) {
            const maxTex = this.getMaxTextureSize(gpuContext);
            const metrics = getChunkMetrics(this.hexSize);
            const maxW = metrics.chunkWorldWidth;
            const maxH = metrics.chunkWorldHeight;
            
            const limit = Math.min(
                (maxTex * 0.95) / maxW,
                (maxTex * 0.95) / maxH
            );
            
            if (targetZoom > limit) {
                targetZoom = limit;
            }
        }
        
        return targetZoom;
    }

    public update(camera: Camera, gpuContext?: WebGLRenderingContext | WebGL2RenderingContext | null) {
        const now = performance.now();

        // 1. Interaction Detection (Throttle work during movement)
        if (Math.abs(camera.x - this.lastCamX) > INTERACTION_MOVE_THRESHOLD_PX || 
            Math.abs(camera.y - this.lastCamY) > INTERACTION_MOVE_THRESHOLD_PX || 
            Math.abs(camera.zoom - this.lastCamZoom) > ZOOM_EPSILON) {
            this.lastInteractionTime = now;
            this.lastCamX = camera.x;
            this.lastCamY = camera.y;
            this.lastCamZoom = camera.zoom;
        }
        const isInteracting = (now - this.lastInteractionTime) < INTERACTION_THROTTLE_MS;

        // Compute visible chunks once per frame. This has side effects (updates lastUsed, marks for LOD changes).
        const visibleChunks = this.getVisibleChunks(camera, gpuContext || null);

        // 2. Populate Task Queue (Prioritized by Distance)
        if (this.taskQueue.length === 0) {
            const camCenterX = camera.x + (camera.width / camera.zoom) / 2;
            const camCenterY = camera.y + (camera.height / camera.zoom) / 2;
            
            const dirtyChunksWithData: ChunkData[] = [];
            for (const chunk of visibleChunks) {
                if (chunk.dirtyLayers.size > 0) {
                    dirtyChunksWithData.push(chunk);
                }
            }
    
            if (dirtyChunksWithData.length > 0) {
                // Sort by distance to camera
                dirtyChunksWithData.sort((a, b) => {
                    const distA = (a.worldX - camCenterX)**2 + (a.worldY - camCenterY)**2;
                    const distB = (b.worldX - camCenterX)**2 + (b.worldY - camCenterY)**2;
                    return distA - distB;
                });
                
                // Create granular tasks
                for (const chunk of dirtyChunksWithData) {
                    const key = this.chunkKeyStr(chunk);
                    if (chunk.dirtyLayers.has(ChunkLayer.BASE)) {
                        const zoom = this.getTargetZoomForLayer(ChunkLayer.BASE, camera.zoom, gpuContext);
                        this.taskQueue.push({ key, layer: ChunkLayer.BASE, zoom });
                    }
                    if (chunk.dirtyLayers.has(ChunkLayer.INFRA)) {
                        const zoom = this.getTargetZoomForLayer(ChunkLayer.INFRA, camera.zoom, gpuContext);
                        this.taskQueue.push({ key, layer: ChunkLayer.INFRA, zoom });
                    }
                }
                
                // Reverse the queue so pop() gets the highest priority (closest) task
                this.taskQueue.reverse();
            }
        }

        // 3. Execute Tasks (Time Budget)
        const timeBudget = isInteracting ? TASK_BUDGET_INTERACTING_MS : TASK_BUDGET_IDLE_MS;
        const startTime = performance.now();

        while (this.taskQueue.length > 0) {
            if (performance.now() - startTime > timeBudget) break;

            const task = this.taskQueue.pop()!;
            const chunk = this.chunks.get(task.key);
            
            if (chunk) {
                ChunkRenderer.rebuildLayer(
                    chunk, task.layer, this.map, this.assets, this.hexSize,
                    task.zoom, this.forestData, this.desertData,
                    gpuContext
                );
                
                chunk.dirtyLayers.delete(task.layer);
                chunk.layerZooms.set(task.layer, task.zoom); // Track specific layer zoom
            }
        }

        // 4. LRU Eviction (disabled during interaction to prevent thrashing)
        if (!isInteracting) {
            this.evictIfNeeded(gpuContext || null, visibleChunks);
        }
    }

    public getVisibleChunks(camera: Camera, gpuContext: WebGLRenderingContext | WebGL2RenderingContext | null): ChunkData[] {
        const visible: ChunkData[] = [];
        const now = performance.now();
        
        const wx = camera.x;
        const wy = camera.y;
        const ww = camera.width / camera.zoom;
        const wh = camera.height / camera.zoom;

        const metrics = getChunkMetrics(this.hexSize);
        const chunkStepX = metrics.baseHexWidth * CHUNK_SIZE;
        const chunkStepY = metrics.baseRowHeight * CHUNK_SIZE;

        const padding = VISIBLE_CHUNK_PADDING;
        const minRow = Math.floor(wy / chunkStepY) - padding;
        const maxRow = Math.ceil((wy + wh) / chunkStepY) + padding;
        const minCol = Math.floor(wx / chunkStepX) - padding;
        const maxCol = Math.ceil((wx + ww) / chunkStepX) + padding;

        const maxMapColChunk = Math.ceil(this.map.width / CHUNK_SIZE);
        const maxMapRowChunk = Math.ceil(this.map.height / CHUNK_SIZE);

        const startRow = Math.max(0, minRow);
        const endRow = Math.min(maxMapRowChunk, maxRow);
        const startCol = Math.max(0, minCol);
        const endCol = Math.min(maxMapColChunk, maxCol);
        
        const allLayers = [ChunkLayer.BASE, ChunkLayer.INFRA];
        let baseMismatches = 0;
        let otherMismatches = 0;

        for (let r = startRow; r < endRow; r++) {
            for (let c = startCol; c < endCol; c++) {
                const key = this.chunkKeyStrFromCoords(c, r);
                const chunk = this.getOrCreateChunk(key);
                
                // Culling check
                if (chunk.worldX < wx + ww && chunk.worldX + metrics.chunkWorldWidth > wx &&
                    chunk.worldY < wy + wh && chunk.worldY + metrics.chunkWorldHeight > wy) {
                    
                    chunk.lastUsed = now;

                    // Stable LOD check: Mark chunk for rebuild if its layers are at the wrong zoom level
                    // or are missing entirely (due to eviction).
                    for (const layerId of allLayers) {
                        const targetZoomForLayer = this.getTargetZoomForLayer(layerId, camera.zoom, gpuContext);
                        const currentLayerZoom = chunk.layerZooms.get(layerId);
                        
                        if (!chunk.layers.has(layerId) || currentLayerZoom === undefined || !zoomEqual(currentLayerZoom, targetZoomForLayer)) {
                            if (DEBUG_CHUNKS) {
                                if (chunk.layers.has(layerId)) { // Log only if it's a mismatch, not a new chunk
                                    if (layerId === ChunkLayer.BASE) baseMismatches++;
                                    else otherMismatches++;
                                }
                            }
                            chunk.dirtyLayers.add(layerId);
                        }
                    }

                    visible.push(chunk);
                }
            }
        }
        
        // Rate-limited diagnostics for LOD changes
        if (DEBUG_CHUNKS) {
            if (now - this.lastLodLogTime > LOD_LOG_INTERVAL) {
                if (baseMismatches > 0 || otherMismatches > 0) {
                    console.log(`[LOD Status] Visible chunks needing rebuild - BASE: ${baseMismatches}, OTHER: ${otherMismatches}`);
                }
                this.lastLodLogTime = now;
            }
        }
        
        return visible;
    }

    private estimateChunkVRAM(chunk: ChunkData): number {
        let size = 0;
        chunk.layers.forEach(tex => {
            // Width * Height * 4 bytes (RGBA8) * 1.33 for mipmaps
            const mipmapFactor = (tex.mipLevels ?? 1) > 1 ? 1.33 : 1.0;
            size += tex.width * tex.height * 4 * mipmapFactor;
        });
        return size;
    }

    private evictIfNeeded(gl: WebGLRenderingContext | WebGL2RenderingContext | null, visibleChunks: ChunkData[]) {
        let currentVRAM = 0;
        this.chunks.forEach(chunk => {
            currentVRAM += this.estimateChunkVRAM(chunk);
        });

        const isOverCount = this.chunks.size > MAX_CHUNKS_IN_CACHE;
        const isOverVRAM = currentVRAM > MAX_ESTIMATED_VRAM_BYTES;

        if (!isOverCount && !isOverVRAM) return;

        const protectedKeys = new Set<string>();
        visibleChunks.forEach(c => protectedKeys.add(this.chunkKeyStr(c)));

        for (const task of this.taskQueue) {
            protectedKeys.add(task.key);
        }

        const sortedChunks = Array.from(this.chunks.entries()).sort((a, b) => a[1].lastUsed - b[1].lastUsed);

        for (const [key, chunk] of sortedChunks) {
            if (this.chunks.size <= MAX_CHUNKS_IN_CACHE && currentVRAM <= MAX_ESTIMATED_VRAM_BYTES) {
                break;
            }

            if (protectedKeys.has(key)) continue;

            const chunkBytes = this.estimateChunkVRAM(chunk);
            if (chunkBytes === 0) continue; 

            if (gl) {
                chunk.layers.forEach((handle) => {
                    if (handle.texture) {
                        gl.deleteTexture(handle.texture);
                        GPUResourceRegistry.getInstance().unregisterTexture(handle);
                    }
                });
            }
            
            chunk.layers.clear();
            chunk.layerZooms.clear();
            
            chunk.dirtyLayers.add(ChunkLayer.BASE);
            chunk.dirtyLayers.add(ChunkLayer.INFRA);

            currentVRAM -= chunkBytes;
            this.freedBytesInCycle += chunkBytes;
            this.evictedInCycle++;
        }

        const now = performance.now();
        if (this.evictedInCycle > 0 && now - this.lastEvictionLogTime > EVICTION_LOG_INTERVAL) {
            if (DEBUG_CHUNKS) {
                console.log(`[Chunk Eviction] Soft-evicted ${this.evictedInCycle} chunks' textures, freed ${(this.freedBytesInCycle / 1024 / 1024).toFixed(2)} MB. Total chunks in memory: ${this.chunks.size}`);
            }
            this.lastEvictionLogTime = now;
            this.evictedInCycle = 0;
            this.freedBytesInCycle = 0;
        }
    }
}
