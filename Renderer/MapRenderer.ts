
import { GameMap, TerrainType, TileData, ResourceType, ImprovementType } from '../Grid/GameMap';
import { Hex, areHexesEqual, hexToString } from '../Grid/HexMath';
import { City } from '../Entities/City';
import { Unit } from '../Entities/Unit';
import { AssetManager } from './AssetManager';
import { Camera, hexToScreen, ISO_FACTOR } from './RenderUtils';
import { TerrainClustering } from './TerrainClustering';
import { TileDrawer } from './drawers/TileDrawer';
import { CityDrawer } from './drawers/CityDrawer';
import { UnitDrawer } from './drawers/UnitDrawer';
import { OverlayDrawer } from './drawers/OverlayDrawer';
import { TerrainErosion, TerrainSprite } from './assets/TerrainErosion';
import { AnimalManager } from './effects/AnimalManager';
import { ChunkManager } from './chunks/ChunkManager';
import { ChunkLayer, CHUNK_SIZE, ChunkData } from './chunks/ChunkTypes';

const DEBUG_CHUNKS = false; // Toggle to visualize chunk bounds

export class MapRenderer {
    public map: GameMap;
    public hexSize: number;
    public assets: AssetManager;
    public forestData: Map<string, number>;
    public desertData: Map<string, number>;
    public animalManager: AnimalManager;
    public chunkManager: ChunkManager;

    // Terrain Sprites (Deserts + Mountains + Hills)
    private terrainSprites: TerrainSprite[] = [];
    
    // Pre-calculated metrics
    private hexWidth: number;
    private vertDist: number;
    private horizDist: number;

    // --- Optimization: Object Pools & Buckets ---
    private _unitsByRow: Map<number, Unit[]> = new Map();
    private _citiesByRow: Map<number, City[]> = new Map();
    private _bucketUnits: (() => void)[] = [];

    constructor(map: GameMap, hexSize: number = 64) {
        this.map = map;
        this.hexSize = hexSize;
        this.assets = new AssetManager();
        this.animalManager = new AnimalManager();
        this.chunkManager = new ChunkManager(map, this.assets, hexSize, this.animalManager);
        this.forestData = new Map();
        this.desertData = new Map();

        this.hexWidth = Math.sqrt(3) * this.hexSize;
        this.vertDist = (this.hexSize * 1.5) * ISO_FACTOR; 
        this.horizDist = this.hexWidth;
    }

    public async initializeTerrain(onProgress: (pct: number, msg: string) => void) {
        onProgress(5, "Анализ леса...");
        this.forestData = TerrainClustering.analyze(this.map, TerrainType.FOREST);
        this.desertData = TerrainClustering.analyze(this.map, TerrainType.DESERT);
        
        // Pass data to Chunk Manager for baking
        this.chunkManager.forestData = this.forestData;
        this.chunkManager.desertData = this.desertData;

        await this.regenerateTerrain(onProgress);
    }

    public async regenerateTerrain(onProgress: (pct: number, msg: string) => void) {
        this.terrainSprites = await TerrainErosion.generateAll(this.map, this.hexSize, onProgress);
    }

    public update(deltaTime: number) {
        this.animalManager.update(deltaTime);
    }

    public render(
        ctx: CanvasRenderingContext2D,
        camera: Camera,
        cities: City[],
        units: Unit[],
        selectedUnit: Unit | null = null,
        validMoves: Hex[] = [],
        path: Hex[] = [],
        previewHighlightHex: Hex | null = null,
        selectedHex: Hex | null = null,
        time: number = 0,
        windStrength: number = 0.5
    ): void {
        const camZoom = camera.zoom;
        const visibleWorldWidth = camera.width / camZoom;
        const visibleWorldHeight = camera.height / camZoom;

        // 1. Chunk Management Update (Baking off-screen)
        this.chunkManager.update(camera);

        // Get visible chunks for rendering loops
        const visibleChunks = this.chunkManager.getVisibleChunks(camera);
        
        // Sort chunks by row to ensure correct Z-overlap
        visibleChunks.sort((a, b) => a.key.row - b.key.row || a.key.col - b.key.col);

        // --- LAYER 1: BASE TERRAIN (Chunks) ---
        for (const chunk of visibleChunks) {
            const base = chunk.layers.get(ChunkLayer.BASE);
            if (base) {
                const { sx, sy, dw, dh } = this.getChunkScreenRect(chunk, camera, ChunkLayer.BASE);
                ctx.drawImage(base, sx, sy, dw, dh);
                if (DEBUG_CHUNKS) {
                    ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(sx, sy, dw, dh);
                }
            }
        }

        // --- LAYER 2: PROCEDURAL BIOMES (Mountains/Deserts/Hills) ---
        // These are large sprites that sit on top of base terrain but MUST be under Infra/Content
        const camLeft = camera.x;
        const camTop = camera.y;
        const camRight = camera.x + visibleWorldWidth;
        const camBottom = camera.y + visibleWorldHeight;

        for (const sprite of this.terrainSprites) {
            const w = sprite.canvas.width;
            const h = sprite.canvas.height;
            // Simple culling
            if (sprite.x > camRight || sprite.x + w < camLeft || sprite.y > camBottom || sprite.y + h < camTop) continue;
            
            const destX = Math.floor((sprite.x - camLeft) * camZoom);
            const destY = Math.floor((sprite.y - camTop) * camZoom);
            ctx.drawImage(sprite.canvas, destX, destY, Math.floor(w * camZoom), Math.floor(h * camZoom));
        }

        // --- LAYER 3: INFRASTRUCTURE (Chunks) ---
        for (const chunk of visibleChunks) {
            const infra = chunk.layers.get(ChunkLayer.INFRA);
            if (infra) {
                const { sx, sy, dw, dh } = this.getChunkScreenRect(chunk, camera, ChunkLayer.INFRA);
                ctx.drawImage(infra, sx, sy, dw, dh);
            }
        }

        // --- LAYER 4: REAL-TIME FOREST (Animated) ---
        // Iterate visible chunks -> tiles to draw trees individually
        this.renderRealtimeLayer(ctx, visibleChunks, camera, (q, r, x, y, tile) => {
            if (tile.terrain === TerrainType.FOREST) {
                TileDrawer.drawForestRealtime(ctx, {q, r}, tile, x, y, camera, this.hexSize, this.assets, this.forestData, time, windStrength);
            }
        });

        // --- LAYER 5: STATIC CONTENT (Chunks) ---
        for (const chunk of visibleChunks) {
            const content = chunk.layers.get(ChunkLayer.CONTENT);
            if (content) {
                const { sx, sy, dw, dh } = this.getChunkScreenRect(chunk, camera, ChunkLayer.CONTENT);
                ctx.drawImage(content, sx, sy, dw, dh);
            }
        }

        // --- LAYER 6: REAL-TIME ANIMALS (Animated) ---
        // Iterate visible tiles for MEAT/WOOL
        this.renderRealtimeLayer(ctx, visibleChunks, camera, (q, r, x, y, tile) => {
            if ((tile.resource === ResourceType.MEAT || tile.resource === ResourceType.WOOL) && !tile.isHidden) {
                // If there's a ranch, it's drawn in static content, but animals are dynamic overlay
                const hasRanch = tile.improvement === ImprovementType.RANCH;
                this.animalManager.drawAnimals(ctx, {q, r}, x, y, this.hexSize * camera.zoom, tile.resource, this.assets, hasRanch);
            }
        });

        // --- LAYER 7: DYNAMIC ENTITIES (Units/Cities) ---
        this.renderDynamicEntities(ctx, camera, cities, units, selectedUnit, visibleWorldHeight);

        // --- LAYER 8: OVERLAYS (UI) ---
        OverlayDrawer.drawValidMoves(ctx, camera, this.hexSize, this.assets, validMoves);
        OverlayDrawer.drawRadiusHighlight(ctx, camera, this.map, this.hexSize, this.assets, previewHighlightHex, selectedHex);
        OverlayDrawer.drawPath(ctx, path, selectedUnit, camera, this.hexSize, this.assets);
        OverlayDrawer.drawSelectionCursor(ctx, camera, this.hexSize, this.assets, selectedHex, selectedUnit);
        
        if (this.mapRendererHoveredHex) { 
            // Fallback if needed
        }
    }

    // Helper for Chunk Screen Rect with Layer-specific Zoom lookup
    private getChunkScreenRect(chunk: ChunkData, camera: Camera, layer: ChunkLayer) {
        const camZoom = camera.zoom;
        const sx = (chunk.worldX - camera.x) * camZoom;
        const sy = (chunk.worldY - camera.y) * camZoom;
        
        // Retrieve the specific zoom level this layer was built at.
        // Fallback to general lastBuiltZoom if specific is missing (should not happen with new Manager).
        const bakedZoom = chunk.layerZooms.get(layer) || chunk.lastBuiltZoom || 1;
        
        const relativeScale = camZoom / bakedZoom;
        const canvas = chunk.layers.get(layer);
        
        const dw = (canvas?.width || 0) * relativeScale;
        const dh = (canvas?.height || 0) * relativeScale;
        
        return { sx, sy, dw, dh };
    }

    // Helper for iterating visible tiles for Real-time effects
    private renderRealtimeLayer(
        ctx: CanvasRenderingContext2D, 
        chunks: any[], 
        camera: Camera,
        drawFn: (q: number, r: number, x: number, y: number, tile: TileData) => void
    ) {
        for (const chunk of chunks) {
            const startCol = chunk.key.col * CHUNK_SIZE;
            const startRow = chunk.key.row * CHUNK_SIZE;
            const endCol = startCol + CHUNK_SIZE;
            const endRow = startRow + CHUNK_SIZE;

            for (let r = startRow; r < endRow; r++) {
                for (let c = startCol; c < endCol; c++) {
                    if (r >= this.map.height || c >= this.map.width) continue;
                    
                    const q = c - (r - (r & 1)) / 2;
                    const tile = this.map.getTile(q, r);
                    if (tile) {
                        const { x, y } = hexToScreen(q, r, camera, this.hexSize);
                        drawFn(q, r, x, y, tile);
                    }
                }
            }
        }
    }

    private renderDynamicEntities(
        ctx: CanvasRenderingContext2D,
        camera: Camera,
        cities: City[],
        units: Unit[],
        selectedUnit: Unit | null,
        visibleHeight: number
    ) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        this._unitsByRow.clear();
        this._citiesByRow.clear();

        const margin = 2;
        const startRow = Math.floor(camera.y / this.vertDist) - margin;
        const endRow = Math.ceil((camera.y + visibleHeight) / this.vertDist) + margin;
        const minRow = Math.max(0, startRow);
        const maxRow = Math.min(this.map.height, endRow);

        for (const u of units) {
            const r = Math.round(u.visualPos.r);
            if (r >= minRow && r < maxRow) {
                if (!this._unitsByRow.has(r)) this._unitsByRow.set(r, []);
                this._unitsByRow.get(r)!.push(u);
            }
        }

        for (const c of cities) {
            const r = c.location.r;
            if (r >= minRow && r < maxRow) {
                if (!this._citiesByRow.has(r)) this._citiesByRow.set(r, []);
                this._citiesByRow.get(r)!.push(c);
            }
        }

        for (let r = minRow; r < maxRow; r++) {
            this._bucketUnits.length = 0;

            const rowCities = this._citiesByRow.get(r);
            if (rowCities) {
                CityDrawer.populateBucket(this._bucketUnits, ctx, rowCities, camera, this.hexSize, this.assets);
            }

            const rowUnits = this._unitsByRow.get(r);
            if (rowUnits) {
                UnitDrawer.populateBucket(this._bucketUnits, ctx, rowUnits, selectedUnit, camera, this.hexSize, this.assets);
            }

            for (const draw of this._bucketUnits) draw();
        }
    }

    // Placeholder for property needed in Game.ts but handled differently
    private mapRendererHoveredHex: Hex | null = null;

    public drawHighlight(ctx: CanvasRenderingContext2D, camera: Camera, hex: Hex) {
        OverlayDrawer.drawHighlight(ctx, camera, hex, this.hexSize, this.assets);
    }
}
