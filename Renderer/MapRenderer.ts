
import { GameMap, TerrainType, TileData } from '../Grid/GameMap';
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

export class MapRenderer {
    public map: GameMap;
    public hexSize: number;
    public assets: AssetManager;
    public forestData: Map<string, number>;
    public desertData: Map<string, number>;
    public animalManager: AnimalManager;

    // Terrain Sprites (Deserts + Mountains + Hills)
    private terrainSprites: TerrainSprite[] = [];
    
    // Pre-calculated metrics
    private hexWidth: number;
    private vertDist: number;
    private horizDist: number;

    // --- Optimization: Object Pools & Buckets ---
    // Avoid creating new Maps/Arrays every frame
    private _unitsByRow: Map<number, Unit[]> = new Map();
    private _citiesByRow: Map<number, City[]> = new Map();
    
    // Render Buckets for Row-by-Row drawing (Removes need for sorting)
    private _bucketInfra: (() => void)[] = [];
    private _bucketContent: (() => void)[] = [];
    private _bucketUnits: (() => void)[] = [];

    constructor(map: GameMap, hexSize: number = 64) {
        this.map = map;
        this.hexSize = hexSize;
        this.assets = new AssetManager();
        this.animalManager = new AnimalManager();
        this.forestData = new Map();
        this.desertData = new Map();

        this.hexWidth = Math.sqrt(3) * this.hexSize;
        // Vertical distance between rows in hex grid
        this.vertDist = (this.hexSize * 1.5) * ISO_FACTOR; 
        this.horizDist = this.hexWidth;
    }

    public async initializeTerrain(onProgress: (pct: number, msg: string) => void) {
        onProgress(5, "Анализ леса...");
        this.forestData = TerrainClustering.analyze(this.map, TerrainType.FOREST);
        this.desertData = TerrainClustering.analyze(this.map, TerrainType.DESERT);
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

        // View Culling Calculation
        const margin = 2; // Small margin for base tiles
        const startRow = Math.floor(camera.y / this.vertDist) - margin;
        const endRow = Math.ceil((camera.y + visibleWorldHeight) / this.vertDist) + margin;
        
        // Horizontal culling is approximate due to stagger
        const startCol = Math.floor(camera.x / this.horizDist) - margin;
        const endCol = Math.ceil((camera.x + visibleWorldWidth) / this.horizDist) + margin;

        const minRow = Math.max(0, startRow);
        const maxRow = Math.min(this.map.height, endRow);
        const minCol = Math.max(0, startCol);
        const maxCol = Math.min(this.map.width, endCol);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // --- PRE-PROCESSING: Bucket Entities (Reuse Pools) ---
        this._unitsByRow.clear();
        this._citiesByRow.clear();

        for (const u of units) {
            // Fast visual row approximation
            const r = Math.round(u.visualPos.r);
            // View Culling for Units
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

        // Pre-calc visual dimensions for sprite loop optimization
        const finalHexSize = this.hexSize * camZoom;
        const halfHexW = (this.hexWidth / 2) * camZoom;
        const rowHeightStep = this.vertDist * camZoom;
        const colWidthStep = this.horizDist * camZoom;

        // --- LAYER 1: BASE TILES & DECALS ---
        // Optimization: Incremental coordinate calculation
        // y = (hexSize * 1.5 * r) * ISO_FACTOR * zoom - camera.y * zoom
        // x = hexSize * sqrt(3) * (c - (r - (r&1))/2 + r/2) * zoom ... simplified:
        // x = (col * width + (r%2 * width/2)) - camX
        
        let currentScreenY = (minRow * this.vertDist - camera.y) * camZoom;

        for (let r = minRow; r < maxRow; r++) {
            const isOdd = r & 1;
            // Calculate starting X for this row
            // Axial q = c - (r - (r&1)) / 2
            // World X = Width * (q + r/2)
            // Algebraic simplification for Grid Col C: X = Width * (C + (r%2)/2)
            
            let currentScreenX = (minCol * this.hexWidth + (isOdd ? this.hexWidth / 2 : 0) - camera.x) * camZoom;

            for (let c = minCol; c < maxCol; c++) {
                const q = c - (r - (r & 1)) / 2;
                
                if (this.map.isValid(q, r)) {
                    const tile = this.map.getTile(q, r);
                    if (tile) {
                        let visualTerrain = tile.terrain;
                        
                        // Underlay for 3D biomes
                        if (tile.terrain === TerrainType.MOUNTAIN || 
                            tile.terrain === TerrainType.HILLS || 
                            tile.terrain === TerrainType.DESERT || 
                            tile.terrain === TerrainType.FOREST) {
                            visualTerrain = TerrainType.PLAINS;
                        }

                        // Direct call to static drawer, passing pre-calced coords
                        TileDrawer.drawTexturedHex(ctx, currentScreenX, currentScreenY, finalHexSize, visualTerrain, this.assets);
                    }
                }
                currentScreenX += colWidthStep;
            }
            currentScreenY += rowHeightStep;
        }

        // --- LAYER 2: LARGE BIOME SPRITES ---
        // Optimized Culling: Check bounds in World Space first
        const camLeft = camera.x;
        const camTop = camera.y;
        const camRight = camera.x + visibleWorldWidth;
        const camBottom = camera.y + visibleWorldHeight;

        for (const sprite of this.terrainSprites) {
            const w = sprite.canvas.width;
            const h = sprite.canvas.height;

            // Fast AABB Check
            if (sprite.x > camRight || sprite.x + w < camLeft || 
                sprite.y > camBottom || sprite.y + h < camTop) {
                continue;
            }

            const destX = Math.floor((sprite.x - camLeft) * camZoom);
            const destY = Math.floor((sprite.y - camTop) * camZoom);
            const destW = Math.floor(w * camZoom);
            const destH = Math.floor(h * camZoom);

            ctx.drawImage(sprite.canvas, destX, destY, destW, destH);
        }

        // --- LAYER 3: SORTED ENTITIES (Row-by-Row with Buckets) ---
        // We reuse the incremental loop approach but fill buckets
        
        currentScreenY = (minRow * this.vertDist - camera.y) * camZoom;

        for (let r = minRow; r < maxRow; r++) {
            const isOdd = r & 1;
            let currentScreenX = (minCol * this.hexWidth + (isOdd ? this.hexWidth / 2 : 0) - camera.x) * camZoom;

            // Clear buckets for this row (alloc-free)
            this._bucketInfra.length = 0;
            this._bucketContent.length = 0;
            this._bucketUnits.length = 0;

            // 3.1 Tiles in this row
            for (let c = minCol; c < maxCol; c++) {
                const q = c - (r - (r & 1)) / 2;
                if (!this.map.isValid(q, r)) {
                    currentScreenX += colWidthStep;
                    continue;
                }
                
                const tile = this.map.getTile(q, r);
                if (tile) {
                    // Populate buckets via Drawers
                    TileDrawer.populateBuckets(
                        this._bucketInfra,
                        this._bucketContent,
                        ctx, 
                        {q, r}, 
                        currentScreenX,
                        currentScreenY, 
                        tile, 
                        camera, 
                        this.hexSize, 
                        this.assets, 
                        this.map,
                        selectedUnit,
                        validMoves,
                        this.animalManager,
                        this.forestData, 
                        this.desertData, 
                        time, 
                        windStrength
                    );
                }
                currentScreenX += colWidthStep;
            }

            // 3.2 Cities in this row
            const rowCities = this._citiesByRow.get(r);
            if (rowCities) {
                CityDrawer.populateBucket(this._bucketUnits, ctx, rowCities, camera, this.hexSize, this.assets);
            }

            // 3.3 Units in this row
            const rowUnits = this._unitsByRow.get(r);
            if (rowUnits) {
                UnitDrawer.populateBucket(this._bucketUnits, ctx, rowUnits, selectedUnit, camera, this.hexSize, this.assets);
            }

            // 3.4 Execute Draw Calls in Layer Order
            // No sorting needed!
            for (const draw of this._bucketInfra) draw();
            for (const draw of this._bucketContent) draw();
            for (const draw of this._bucketUnits) draw();

            currentScreenY += rowHeightStep;
        }

        // --- OVERLAYS ---
        OverlayDrawer.drawRadiusHighlight(ctx, camera, this.map, this.hexSize, this.assets, previewHighlightHex, selectedHex);
        OverlayDrawer.drawPath(ctx, path, selectedUnit, camera, this.hexSize, this.assets);
        OverlayDrawer.drawSelectionCursor(ctx, camera, this.hexSize, this.assets, selectedHex, selectedUnit);
    }

    public drawHighlight(ctx: CanvasRenderingContext2D, camera: Camera, hex: Hex) {
        OverlayDrawer.drawHighlight(ctx, camera, hex, this.hexSize, this.assets);
    }
}
