
import { ChunkData, ChunkKey, ChunkLayer, CHUNK_SIZE, CHUNK_PADDING_TILES } from './ChunkTypes';
import { GameMap, TileData } from '../../Grid/GameMap';
import { AssetManager } from '../AssetManager';
import { ChunkRenderer } from './ChunkRenderer';
import { Camera, hexToScreen, ISO_FACTOR } from '../RenderUtils';
import { AnimalManager } from '../effects/AnimalManager';

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
    private animalManager: AnimalManager;
    
    // Dependencies needed for drawing
    public forestData: Map<string, number> = new Map();
    public desertData: Map<string, number> = new Map();

    // Task Management
    private dirtyChunks: Set<string> = new Set();
    private taskQueue: DirtyTask[] = [];
    private taskHead: number = 0;
    
    // Interaction & Zoom Control
    private lastCamX: number = 0;
    private lastCamY: number = 0;
    private lastCamZoom: number = 0;
    private lastInteractionTime: number = 0;
    private targetZoomBucket: number = 1.0;
    private currentZoomBucket: number = 1.0;

    constructor(map: GameMap, assets: AssetManager, hexSize: number, animalManager: AnimalManager) {
        this.map = map;
        this.assets = assets;
        this.hexSize = hexSize;
        this.animalManager = animalManager;

        // Subscribe to map changes
        this.map.onTileChanged(this.handleTileChange.bind(this));

        // Subscribe to config changes
        window.addEventListener('SPRITE_CONFIG_CHANGED', (e: any) => {
            const key = e.detail?.key as string;
            this.handleConfigChange(key);
        });
    }

    private handleConfigChange(key: string) {
        if (key.startsWith('STR_') || key.startsWith('RES_')) {
            this.invalidateAll(ChunkLayer.CONTENT);
        } else if (!key.startsWith('UNIT_')) {
            this.invalidateAll(ChunkLayer.BASE);
            this.invalidateAll(ChunkLayer.INFRA);
            this.invalidateAll(ChunkLayer.CONTENT);
        }
    }

    public invalidateAll(layer: ChunkLayer) {
        for (const [key, chunk] of this.chunks) {
            chunk.dirtyLayers.add(layer);
            chunk.isDirty = true;
            this.dirtyChunks.add(key);
        }
    }

    private getChunkKey(col: number, row: number): string {
        return `${Math.floor(col / CHUNK_SIZE)},${Math.floor(row / CHUNK_SIZE)}`;
    }

    private getChunkCoords(keyStr: string): ChunkKey {
        const [c, r] = keyStr.split(',').map(Number);
        return { col: c, row: r };
    }

    private handleTileChange(q: number, r: number, data: Partial<TileData>) {
        const col = q + (r - (r & 1)) / 2;
        const row = r;
        
        const key = this.getChunkKey(col, row);
        const chunk = this.getOrCreateChunk(key);

        if (data.terrain !== undefined) {
            chunk.dirtyLayers.add(ChunkLayer.BASE);
            chunk.dirtyLayers.add(ChunkLayer.CONTENT);
        }
        
        if (data.improvement !== undefined || data.improvementLevel !== undefined) {
            chunk.dirtyLayers.add(ChunkLayer.INFRA);
            chunk.dirtyLayers.add(ChunkLayer.CONTENT);
            this.invalidateNeighbors(col, row);
        }

        if (data.resource !== undefined || data.isHidden !== undefined || data.isProspected !== undefined) {
            chunk.dirtyLayers.add(ChunkLayer.CONTENT);
        }

        chunk.isDirty = true;
        this.dirtyChunks.add(key);
    }

    private invalidateNeighbors(col: number, row: number) {
        const cLocal = col % CHUNK_SIZE;
        const rLocal = row % CHUNK_SIZE;
        
        if (cLocal === 0 || cLocal === CHUNK_SIZE - 1 || rLocal === 0 || rLocal === CHUNK_SIZE - 1) {
             const cKey = Math.floor(col / CHUNK_SIZE);
             const rKey = Math.floor(row / CHUNK_SIZE);
             this.markChunkDirty(`${cKey+1},${rKey}`, ChunkLayer.INFRA);
             this.markChunkDirty(`${cKey-1},${rKey}`, ChunkLayer.INFRA);
             this.markChunkDirty(`${cKey},${rKey+1}`, ChunkLayer.INFRA);
             this.markChunkDirty(`${cKey},${rKey-1}`, ChunkLayer.INFRA);
        }
    }

    private markChunkDirty(key: string, layer: ChunkLayer) {
        if (this.chunks.has(key)) {
            const c = this.chunks.get(key)!;
            c.dirtyLayers.add(layer);
            c.isDirty = true;
            this.dirtyChunks.add(key);
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

            const baseHexWidth = Math.sqrt(3) * this.hexSize;
            const baseRowHeight = this.hexSize * 1.5 * ISO_FACTOR;

            const padX = baseHexWidth * (CHUNK_PADDING_TILES / 2);
            const padY = baseRowHeight * (CHUNK_PADDING_TILES / 2);

            const worldX = startWorldX - padX;
            const worldY = startWorldY - padY;

            this.chunks.set(key, {
                key: { col: chunkCol, row: chunkRow },
                worldX,
                worldY,
                layers: new Map(),
                layerZooms: new Map(),
                isDirty: true,
                dirtyLayers: new Set([ChunkLayer.BASE, ChunkLayer.INFRA, ChunkLayer.CONTENT]),
                lastBuiltZoom: 1.0
            });
            this.dirtyChunks.add(key);
        }
        return this.chunks.get(key)!;
    }

    public update(camera: Camera) {
        const now = performance.now();

        // 1. Interaction Detection (Throttle work during movement)
        if (Math.abs(camera.x - this.lastCamX) > 1 || 
            Math.abs(camera.y - this.lastCamY) > 1 || 
            Math.abs(camera.zoom - this.lastCamZoom) > 0.001) {
            this.lastInteractionTime = now;
            this.lastCamX = camera.x;
            this.lastCamY = camera.y;
            this.lastCamZoom = camera.zoom;
        }
        const isInteracting = (now - this.lastInteractionTime) < 200;

        // 2. Zoom Bucket Logic (Debounced)
        let neededBucket = 1.0;
        if (camera.zoom < 0.75) neededBucket = 0.5;
        else if (camera.zoom > 1.5) neededBucket = 2.0;

        if (neededBucket !== this.targetZoomBucket) {
            this.targetZoomBucket = neededBucket;
        }

        // Only switch bucket if idle to prevent stutter during zoom
        if (!isInteracting && this.currentZoomBucket !== this.targetZoomBucket) {
            this.currentZoomBucket = this.targetZoomBucket;
            // Invalidate all layers to rebuild at new crispness
            this.invalidateAll(ChunkLayer.BASE);
            this.invalidateAll(ChunkLayer.INFRA);
            this.invalidateAll(ChunkLayer.CONTENT);
        }

        // 3. Populate Task Queue (Prioritized by Distance)
        if (this.taskHead >= this.taskQueue.length && this.dirtyChunks.size > 0) {
            // Reset queue
            this.taskQueue = [];
            this.taskHead = 0;

            const camCenterX = camera.x + (camera.width / camera.zoom) / 2;
            const camCenterY = camera.y + (camera.height / camera.zoom) / 2;
            
            // Convert Set to Array and Sort by distance to camera
            const sortedKeys = Array.from(this.dirtyChunks).sort((a, b) => {
                const cA = this.chunks.get(a);
                const cB = this.chunks.get(b);
                if (!cA || !cB) return 0;
                
                const distA = (cA.worldX - camCenterX)**2 + (cA.worldY - camCenterY)**2;
                const distB = (cB.worldX - camCenterX)**2 + (cB.worldY - camCenterY)**2;
                return distA - distB;
            });

            // Create granular tasks
            for (const key of sortedKeys) {
                const chunk = this.chunks.get(key);
                if (chunk) {
                    if (chunk.dirtyLayers.has(ChunkLayer.BASE)) 
                        this.taskQueue.push({ key, layer: ChunkLayer.BASE, zoom: this.currentZoomBucket });
                    
                    if (chunk.dirtyLayers.has(ChunkLayer.INFRA)) 
                        this.taskQueue.push({ key, layer: ChunkLayer.INFRA, zoom: this.currentZoomBucket });
                    
                    if (chunk.dirtyLayers.has(ChunkLayer.CONTENT)) 
                        this.taskQueue.push({ key, layer: ChunkLayer.CONTENT, zoom: this.currentZoomBucket });
                }
            }
            this.dirtyChunks.clear();
        }

        // 4. Execute Tasks (Time Budget)
        const timeBudget = isInteracting ? 1.0 : 8.0; // 1ms during move, 8ms during idle
        const startTime = performance.now();

        while (this.taskHead < this.taskQueue.length) {
            if (performance.now() - startTime > timeBudget) break;

            const task = this.taskQueue[this.taskHead++];
            const chunk = this.chunks.get(task.key);
            
            if (chunk) {
                ChunkRenderer.rebuildLayer(
                    chunk, task.layer, this.map, this.assets, this.hexSize,
                    task.zoom, this.forestData, this.desertData, this.animalManager
                );
                
                chunk.dirtyLayers.delete(task.layer);
                chunk.layerZooms.set(task.layer, task.zoom); // Track specific layer zoom
                
                if (chunk.dirtyLayers.size === 0) {
                    chunk.isDirty = false;
                    chunk.lastBuiltZoom = task.zoom;
                }
            }
        }

        // Compact Queue to prevent memory leak
        if (this.taskHead > 2000) {
            this.taskQueue = this.taskQueue.slice(this.taskHead);
            this.taskHead = 0;
        }
    }

    public getVisibleChunks(camera: Camera): ChunkData[] {
        const visible: ChunkData[] = [];
        
        const wx = camera.x;
        const wy = camera.y;
        const ww = camera.width / camera.zoom;
        const wh = camera.height / camera.zoom;

        const baseHexWidth = this.hexSize * Math.sqrt(3);
        const baseRowHeight = this.hexSize * 1.5 * ISO_FACTOR;

        const chunkPixelW = CHUNK_SIZE * baseHexWidth + (baseHexWidth * CHUNK_PADDING_TILES);
        const chunkPixelH = CHUNK_SIZE * baseRowHeight + (baseHexWidth * CHUNK_PADDING_TILES);

        const maxColChunk = Math.ceil(this.map.width / CHUNK_SIZE);
        const maxRowChunk = Math.ceil(this.map.height / CHUNK_SIZE);

        for (let r = 0; r < maxRowChunk; r++) {
            for (let c = 0; c < maxColChunk; c++) {
                const key = `${c},${r}`;
                const chunk = this.getOrCreateChunk(key);
                
                const cx = chunk.worldX;
                const cy = chunk.worldY;
                
                if (cx < wx + ww && cx + chunkPixelW > wx &&
                    cy < wy + wh && cy + chunkPixelH > wy) {
                    visible.push(chunk);
                }
            }
        }
        
        return visible;
    }
}
