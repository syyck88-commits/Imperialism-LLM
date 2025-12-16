
import { TerrainType, TileData, ResourceType, ImprovementType } from '../Grid/GameMap';
import { AssetManager } from './AssetManager';
import { Camera, hexToScreen, ISO_FACTOR } from './RenderUtils';
import { ChunkManager } from './chunks/ChunkManager';
import { ChunkData, ChunkLayer, NativeContext, CHUNK_SIZE } from './chunks/Chunks';
import { Unit } from '../Entities/Unit';
import { City } from '../Entities/City';
import { Hex } from '../Grid/HexMath';
import { AnimalManager } from './effects/AnimalManager';
import { ForestManager } from './effects/ForestManager';
import { AnimalInstancingManager } from './effects/AnimalInstancingManager';
import { MapOverlayInstancingManager } from './effects/MapOverlayInstancingManager';
import { UnitDrawer, OverlayDrawer } from './drawers/Drawers';
import { WebGLProgramManager, GPUTextureHandle, GPUResourceRegistry } from './core/Core';
import { TerrainErosion } from './assets/TerrainErosion';
import { TerrainClustering } from './TerrainClustering';

export class MapRenderer {
    public map: any;
    public assets: AssetManager;
    public chunkManager: ChunkManager;
    public animalManager: AnimalManager;
    public forestManager: ForestManager;
    public animalInstancingManager: AnimalInstancingManager;
    public mapOverlayInstancingManager: MapOverlayInstancingManager;
    public hexSize: number;

    private overlayCtx: CanvasRenderingContext2D | null = null;
    
    // WebGL properties
    private gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
    private terrainProgram: WebGLProgram | null = null;
    private biomeVBO: WebGLBuffer | null = null;
    private locPosition: number = -1;
    private locTexCoord: number = -1;
    private locResolution: WebGLUniformLocation | null = null;

    // Data for procedural generation
    private forestData: Map<string, number> = new Map();
    private desertData: Map<string, number> = new Map();
    private terrainSprites: any[] = [];

    // Diagnostics
    private missingBaseTextureLogCount = 0;
    private lastLogTime = 0;

    constructor(map: any, hexSize: number) {
        this.map = map;
        this.hexSize = hexSize;
        this.assets = new AssetManager();
        this.animalManager = new AnimalManager();
        this.chunkManager = new ChunkManager(this.map, this.assets, this.hexSize);
        // Managers are initialized later, but instantiated here
        this.animalInstancingManager = new AnimalInstancingManager(this.map, this.assets, this.animalManager, this.hexSize);
        this.mapOverlayInstancingManager = new MapOverlayInstancingManager(this.map, this.assets, this.hexSize);
    }

    public setOverlayContext(ctx: CanvasRenderingContext2D) {
        this.overlayCtx = ctx;
    }

    public setContext(ctx: WebGLRenderingContext | WebGL2RenderingContext) {
        this.gl = ctx;
        this.assets.initGL(this.gl);
        if (this.forestManager) this.forestManager.initGL(this.gl);
        if (this.animalInstancingManager) this.animalInstancingManager.initGL(this.gl);
        if (this.mapOverlayInstancingManager) this.mapOverlayInstancingManager.initGL(this.gl);
        this.initWebGL();
        // Ensure textures are ready if loaded before GL context or restored
        if (this.terrainSprites.length > 0) {
            this.ensureTerrainTextures();
        }
    }

    public onContextLost() {
        console.warn("MapRenderer: Context Lost. Clearing GL resources.");
        this.gl = null;
        this.terrainProgram = null;
        this.biomeVBO = null;
        this.locPosition = -1;
        this.locTexCoord = -1;
        this.locResolution = null;
        
        // Nullify procedural texture handles (they are invalid now)
        // We keep the canvas source so we can re-upload on restore
        this.terrainSprites.forEach(s => s.texture = null);
        
        this.assets.onContextLost();
        this.chunkManager.onContextLost();
        if (this.forestManager) this.forestManager.onContextLost();
        if (this.animalInstancingManager) this.animalInstancingManager.onContextLost();
        if (this.mapOverlayInstancingManager) this.mapOverlayInstancingManager.onContextLost();
    }

    private initWebGL() {
        if (!this.gl) return;
        
        const vs = WebGLProgramManager.getTerrainVertexShader();
        const fs = WebGLProgramManager.getTerrainFragmentShader();
        
        this.terrainProgram = WebGLProgramManager.createProgram(this.gl, vs, fs);
        
        if (this.terrainProgram) {
            this.locPosition = this.gl.getAttribLocation(this.terrainProgram, "a_position");
            this.locTexCoord = this.gl.getAttribLocation(this.terrainProgram, "a_texCoord");
            this.locResolution = this.gl.getUniformLocation(this.terrainProgram, "u_resolution");
            
            this.biomeVBO = this.gl.createBuffer();
        }
    }

    public async initializeTerrain(onProgress: (pct: number, msg: string) => void) {
        // 1. Analyze Clusters for Procedural Rules
        this.forestData = TerrainClustering.analyze(this.map, TerrainType.FOREST);
        this.desertData = TerrainClustering.analyze(this.map, TerrainType.DESERT);
        
        this.chunkManager.forestData = this.forestData;
        this.chunkManager.desertData = this.desertData;

        // 1.5 Initialize Forest Manager with data
        this.forestManager = new ForestManager(this.map, this.assets, this.forestData, this.hexSize);
        if (this.gl) this.forestManager.initGL(this.gl);

        // 2. Generate Biome Sprites
        await this.regenerateTerrain(onProgress);
    }

    public async regenerateTerrain(onProgress: (pct: number, msg: string) => void) {
        // Invalidate base to force redraw of ground under biomes if needed
        this.chunkManager.invalidateAll(ChunkLayer.BASE);
        
        // Cleanup old GPU resources to prevent VRAM leaks
        if (this.gl && this.terrainSprites.length > 0) {
            let freed = 0;
            for (const sprite of this.terrainSprites) {
                if (sprite.texture && sprite.texture.texture) {
                    this.gl.deleteTexture(sprite.texture.texture);
                    GPUResourceRegistry.getInstance().unregisterTexture(sprite.texture);
                    // Detach handle to assist GC
                    sprite.texture = null; 
                    freed++;
                }
            }
            if (freed > 0) {
                console.log(`MapRenderer: Freed ${freed} old biome textures from GPU.`);
            }
        }

        this.terrainSprites = await TerrainErosion.generateAll(this.map, this.hexSize, onProgress);
        console.log(`MapRenderer: Generated ${this.terrainSprites.length} procedural biome sprites.`);
        
        if (this.gl) {
            this.ensureTerrainTextures();
        }
    }

    private ensureTerrainTextures() {
        if (!this.gl) return;
        
        const maxTexSize = this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) || 4096;
        let uploadedCount = 0;

        for (const sprite of this.terrainSprites) {
            if (!sprite.texture) {
                if (sprite.canvas.width > maxTexSize || sprite.canvas.height > maxTexSize) {
                    console.warn(`MapRenderer: Biome sprite too large for WebGL (${sprite.canvas.width}x${sprite.canvas.height}), Max: ${maxTexSize}. Skipping.`);
                    continue;
                }
                sprite.texture = this.assets.textureManager.createTextureFromSource(sprite.canvas, 'biome');
                if (sprite.texture) uploadedCount++;
            }
        }
        if (uploadedCount > 0) {
            console.log(`MapRenderer: Uploaded ${uploadedCount} biome textures to GPU.`);
        }
    }

    public update(deltaTime: number) {
        this.animalManager.update(deltaTime);
    }

    public render(
        ctx: NativeContext,
        camera: Camera,
        cities: City[],
        units: Unit[],
        selectedUnit: Unit | null,
        validMoves: Hex[],
        currentPath: Hex[],
        previewHighlight: Hex | null,
        selectedHex: Hex | null,
        time: number,
        windStrength: number
    ) {
        // Update chunks
        this.chunkManager.update(camera, this.gl);

        // Render Chunks
        const visibleChunks = this.chunkManager.getVisibleChunks(camera, this.gl);
        
        visibleChunks.sort((a, b) => {
            if (a.key.row !== b.key.row) return a.key.row - b.key.row;
            return a.key.col - b.key.col;
        });

        if (this.gl) {
            const gl = this.gl;
            const now = performance.now();
            
            // 1. Draw BASE Chunks (Ground)
            for (const chunk of visibleChunks) {
                const layer = chunk.layers.get(ChunkLayer.BASE);
                if (layer) {
                    this.renderChunkGL(chunk, ChunkLayer.BASE, layer, gl, camera);
                } else {
                    if (now - this.lastLogTime > 1000) { 
                        if (this.missingBaseTextureLogCount > 0) {
                            console.warn(`[Flicker] ${this.missingBaseTextureLogCount} visible chunks were missing BASE textures in the last second.`);
                        }
                        this.missingBaseTextureLogCount = 0;
                        this.lastLogTime = now;
                    }
                    this.missingBaseTextureLogCount++;
                }
            }

            // 2. Draw Procedural Biomes (Mountains/Hills/Deserts)
            this.renderBiomesGL(gl, camera);

            // 2.5 Draw Forests (Instanced)
            if (this.forestManager) {
                this.forestManager.render(camera, time, windStrength);
            }

            // 3. Draw INFRA Chunks (now just Roads/Rails)
            for (const chunk of visibleChunks) {
                const layer = chunk.layers.get(ChunkLayer.INFRA);
                if (layer) this.renderChunkGL(chunk, ChunkLayer.INFRA, layer, gl, camera);
            }

            // 4.5 NEW: Draw crisp overlay sprites (Resources, Buildings, City)
            if (this.mapOverlayInstancingManager) {
                this.mapOverlayInstancingManager.render(camera, visibleChunks);
            }

            // 4.6 Draw Animals (Instanced)
            if (this.animalInstancingManager) {
                this.animalInstancingManager.render(camera, visibleChunks);
            }

        }

        // 5. Draw Overlay (UI + Animated Animals Fallback)
        if (this.overlayCtx) {
            this.renderOverlay(
                this.overlayCtx, 
                camera, 
                cities, 
                units, 
                selectedUnit, 
                validMoves, 
                currentPath, 
                previewHighlight, 
                selectedHex,
                visibleChunks,
                time,
                windStrength
            );
        }
    }

    private renderBiomesGL(gl: WebGLRenderingContext | WebGL2RenderingContext, camera: Camera) {
        if (!this.terrainProgram || !this.biomeVBO || this.terrainSprites.length === 0) return;

        gl.useProgram(this.terrainProgram);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        gl.enableVertexAttribArray(this.locPosition);
        gl.enableVertexAttribArray(this.locTexCoord);
        gl.uniform2f(this.locResolution, camera.width, camera.height);

        for (const sprite of this.terrainSprites) {
            if (!sprite.texture || !sprite.texture.texture) continue;

            const sx = Math.floor((sprite.x - camera.x) * camera.zoom);
            const sy = Math.floor((sprite.y - camera.y) * camera.zoom);
            const dw = Math.floor(sprite.canvas.width * camera.zoom);
            const dh = Math.floor(sprite.canvas.height * camera.zoom);

            if (sx + dw < 0 || sx > camera.width || sy + dh < 0 || sy > camera.height) continue;

            const x1 = sx, y1 = sy, x2 = sx + dw, y2 = sy + dh;
            const bufferData = new Float32Array([
                x1, y1, 0, 0, x1, y2, 0, 1, x2, y1, 1, 0,
                x1, y2, 0, 1, x2, y1, 1, 0, x2, y2, 1, 1
            ]);

            gl.bindBuffer(gl.ARRAY_BUFFER, this.biomeVBO);
            gl.bufferData(gl.ARRAY_BUFFER, bufferData, gl.DYNAMIC_DRAW);
            gl.vertexAttribPointer(this.locPosition, 2, gl.FLOAT, false, 16, 0);
            gl.vertexAttribPointer(this.locTexCoord, 2, gl.FLOAT, false, 16, 8);
            gl.bindTexture(gl.TEXTURE_2D, sprite.texture.texture);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
        }

        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.useProgram(null);
    }

    private getChunkScreenRect(chunk: ChunkData, camera: Camera, layerId: ChunkLayer) {
        const layerObj = chunk.layers.get(layerId);
        let w = 0, h = 0;
        if (layerObj) {
            w = layerObj.width;
            h = layerObj.height;
        }
        
        const layerZoom = chunk.layerZooms.get(layerId) || 1.0;
        const scale = camera.zoom / layerZoom;
        
        const sx = (chunk.worldX - camera.x) * camera.zoom;
        const sy = (chunk.worldY - camera.y) * camera.zoom;
        
        return {
            sx: Math.floor(sx),
            sy: Math.floor(sy),
            dw: w * scale,
            dh: h * scale
        };
    }

    private renderChunkGL(chunk: ChunkData, layerId: ChunkLayer, textureHandle: GPUTextureHandle, gl: WebGLRenderingContext | WebGL2RenderingContext, camera: Camera) {
        if (!this.terrainProgram || !this.biomeVBO || !textureHandle.texture) return;

        const { sx, sy, dw, dh } = this.getChunkScreenRect(chunk, camera, layerId); 

        const x1 = sx, y1 = sy, x2 = sx + dw, y2 = sy + dh;
        const flipY = textureHandle.origin === 'fbo';
        const vTop = flipY ? 1 : 0;
        const vBottom = flipY ? 0 : 1;
        const bufferData = new Float32Array([
            x1, y1, 0, vTop, x1, y2, 0, vBottom, x2, y1, 1, vTop,
            x1, y2, 0, vBottom, x2, y1, 1, vTop, x2, y2, 1, vBottom
        ]);

        gl.useProgram(this.terrainProgram);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.biomeVBO);
        gl.bufferData(gl.ARRAY_BUFFER, bufferData, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(this.locPosition);
        gl.vertexAttribPointer(this.locPosition, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(this.locTexCoord);
        gl.vertexAttribPointer(this.locTexCoord, 2, gl.FLOAT, false, 16, 8);
        gl.uniform2f(this.locResolution, camera.width, camera.height);
        gl.bindTexture(gl.TEXTURE_2D, textureHandle.texture);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        gl.disableVertexAttribArray(this.locPosition);
        gl.disableVertexAttribArray(this.locTexCoord);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.useProgram(null);
    }

    public drawHighlight(ctx: NativeContext, camera: Camera, hex: Hex | null) {
        if (this.overlayCtx && hex) {
            OverlayDrawer.drawHighlight(this.overlayCtx, camera, hex, this.hexSize, this.assets);
        }
    }

    private renderOverlay(
        ctx: CanvasRenderingContext2D, 
        camera: Camera, 
        cities: City[], 
        units: Unit[], 
        selectedUnit: Unit | null, 
        validMoves: Hex[], 
        currentPath: Hex[], 
        previewHighlight: Hex | null, 
        selectedHex: Hex | null,
        visibleChunks: ChunkData[],
        time: number,
        windStrength: number
    ) {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        // Fallback drawing for animals if WebGL instancing is not supported
        if (!this.animalInstancingManager || !this.animalInstancingManager.isSupported) {
            for (const chunk of visibleChunks) {
                const startCol = chunk.key.col * CHUNK_SIZE;
                const startRow = chunk.key.row * CHUNK_SIZE;
                for (let r = startRow; r < startRow + CHUNK_SIZE; r++) {
                    for (let c = startCol; c < startCol + CHUNK_SIZE; c++) {
                        const q = c - (r - (r & 1)) / 2;
                        if (!this.map.isValid(q, r)) continue;
                        const tile = this.map.getTile(q, r);
                        if (!tile) continue;
                        const { x, y } = hexToScreen(q, r, camera, this.hexSize);
                        if (x < -100 || x > camera.width + 100 || y < -100 || y > camera.height + 100) continue;

                        if (tile.resource === ResourceType.MEAT || tile.resource === ResourceType.WOOL) {
                            if (!tile.isHidden) {
                                const hasRanch = tile.improvement === ImprovementType.RANCH;
                                this.animalManager.drawAnimals(
                                    ctx, {q, r}, x, y, this.hexSize * camera.zoom, 
                                    tile.resource, this.assets, hasRanch
                                );
                            }
                        }
                    }
                }
            }
        }

        // --- UI, Selection, Units, Cities ---
        if (previewHighlight || selectedHex) OverlayDrawer.drawRadiusHighlight(ctx, camera, this.map, this.hexSize, this.assets, previewHighlight, selectedHex);
        OverlayDrawer.drawValidMoves(ctx, camera, this.hexSize, this.assets, validMoves);
        OverlayDrawer.drawSelectionCursor(ctx, camera, this.hexSize, this.assets, selectedHex, selectedUnit);
        if (currentPath.length > 0) OverlayDrawer.drawPath(ctx, currentPath, selectedUnit, camera, this.hexSize, this.assets);

        const unitBucket: (() => void)[] = [];
        UnitDrawer.populateBucket(unitBucket, ctx, units, selectedUnit, camera, this.hexSize, this.assets);
        unitBucket.forEach(fn => fn());
    }
}
