
import { GPUTextureHandle, UVRect, WebGLProgramManager, AtlasUVRect, GPUResourceRegistry } from '../core/Core';
import { ISO_FACTOR, hexToScreen, Camera } from '../RenderUtils';
import { TerrainType, TileData, ImprovementType, GameMap, ResourceType } from '../../Grid/GameMap';
import { AssetManager } from '../AssetManager';
import { getHexNeighbors, Hex } from '../../Grid/HexMath';

// --- From ChunkTypes.ts ---

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

// --- From WebGLBatcher.ts ---

export class WebGLBatcher {
    private gl: WebGLRenderingContext | WebGL2RenderingContext;
    
    private readonly FLOAT_PER_VERTEX = 4;
    private readonly VERTICES_PER_QUAD = 6;
    private readonly STRIDE = this.FLOAT_PER_VERTEX * 4; // bytes

    private buffer: Float32Array;
    private vertexCount: number = 0;
    private maxQuads: number;

    constructor(gl: WebGLRenderingContext | WebGL2RenderingContext, maxQuads: number = 2048) {
        this.gl = gl;
        this.maxQuads = maxQuads;
        this.buffer = new Float32Array(maxQuads * this.VERTICES_PER_QUAD * this.FLOAT_PER_VERTEX);
    }

    public clear() {
        this.vertexCount = 0;
    }

    public pushVertices(vertices: number[]) {
        if (this.vertexCount * this.FLOAT_PER_VERTEX + vertices.length > this.buffer.length) {
            console.warn("WebGLBatcher: Buffer overflow, ignoring vertices.");
            return;
        }
        this.buffer.set(vertices, this.vertexCount * this.FLOAT_PER_VERTEX);
        this.vertexCount += vertices.length / this.FLOAT_PER_VERTEX;
    }

    public pushQuad(x: number, y: number, w: number, h: number, uv: UVRect) {
        if (this.vertexCount / this.VERTICES_PER_QUAD >= this.maxQuads) {
            console.warn("WebGLBatcher: Buffer overflow, ignoring quad. Consider flushing or resizing.");
            return;
        }

        let idx = this.vertexCount * this.FLOAT_PER_VERTEX;

        const x1 = x;
        const y1 = y;
        const x2 = x + w;
        const y2 = y + h;

        const u1 = uv.u;
        const v1 = uv.v;
        const u2 = uv.u + uv.w;
        const v2 = uv.v + uv.h;

        // Tri 1: Top-Left, Bottom-Left, Top-Right
        this.buffer[idx++] = x1; this.buffer[idx++] = y1; this.buffer[idx++] = u1; this.buffer[idx++] = v1;
        this.buffer[idx++] = x1; this.buffer[idx++] = y2; this.buffer[idx++] = u1; this.buffer[idx++] = v2;
        this.buffer[idx++] = x2; this.buffer[idx++] = y1; this.buffer[idx++] = u2; this.buffer[idx++] = v1;
        
        // Tri 2: Bottom-Left, Bottom-Right, Top-Right
        this.buffer[idx++] = x1; this.buffer[idx++] = y2; this.buffer[idx++] = u1; this.buffer[idx++] = v2;
        this.buffer[idx++] = x2; this.buffer[idx++] = y2; this.buffer[idx++] = u2; this.buffer[idx++] = v2;
        this.buffer[idx++] = x2; this.buffer[idx++] = y1; this.buffer[idx++] = u2; this.buffer[idx++] = v1;

        this.vertexCount += this.VERTICES_PER_QUAD;
    }

    public getBuffer(): Float32Array {
        return this.buffer;
    }

    public getVertexCount(): number {
        return this.vertexCount;
    }
    
    public getActiveData(): Float32Array {
        return this.buffer.subarray(0, this.vertexCount * this.FLOAT_PER_VERTEX);
    }
}

// --- From WebGLChunkLayerBuilder.ts ---

/**
 * Helper function moved from legacy InfrastructureDrawer to make this module self-contained.
 * Determines if a tile has an improvement that should connect to the road/rail network.
 */
function isConnectable(t: TileData): boolean {
    return t.improvement === ImprovementType.ROAD || 
        t.improvement === ImprovementType.RAILROAD || 
        t.improvement === ImprovementType.CITY || 
        t.improvement === ImprovementType.DEPOT ||
        t.improvement === ImprovementType.PORT ||
        t.improvement === ImprovementType.MINE ||
        t.improvement === ImprovementType.FARM ||
        t.improvement === ImprovementType.LUMBER_MILL ||
        t.improvement === ImprovementType.RANCH ||
        t.improvement === ImprovementType.PLANTATION ||
        t.improvement === ImprovementType.OIL_WELL;
}

export class WebGLChunkLayerBuilder {
    private gl: WebGLRenderingContext | WebGL2RenderingContext;
    private mockCamera: Camera;
    private hexSize: number;
    private assets: AssetManager;

    private batchers: Map<number, WebGLBatcher> = new Map();
    private vbo: WebGLBuffer | null = null;
    private program: WebGLProgram | null = null;
    
    private fbo: WebGLFramebuffer | null = null;
    private renderTarget: any | null = null;

    private locPosition: number = -1;
    private locTexCoord: number = -1;
    private locResolution: WebGLUniformLocation | null = null;
    private locTexture: WebGLUniformLocation | null = null;
    
    constructor(
        gl: WebGLRenderingContext | WebGL2RenderingContext,
        mockCamera: Camera,
        hexSize: number,
        assets: AssetManager
    ) {
        this.gl = gl;
        this.mockCamera = mockCamera;
        this.hexSize = hexSize;
        this.assets = assets;

        this.initGPUResources();
    }

    private initGPUResources() {
        if (!this.vbo) {
            this.vbo = this.gl.createBuffer();
        }
        
        if (!(this.gl as any).__terrainProgram) {
             const vs = WebGLProgramManager.getTerrainVertexShader();
             const fs = WebGLProgramManager.getTerrainFragmentShader();
             (this.gl as any).__terrainProgram = WebGLProgramManager.createProgram(this.gl, vs, fs);
        }
        
        this.program = (this.gl as any).__terrainProgram;

        if (this.program) {
            this.locPosition = this.gl.getAttribLocation(this.program, "a_position");
            this.locTexCoord = this.gl.getAttribLocation(this.program, "a_texCoord");
            this.locResolution = this.gl.getUniformLocation(this.program, "u_resolution");
            this.locTexture = this.gl.getUniformLocation(this.program, "u_texture");
        }

        if (!this.renderTarget) {
            const rt = this.assets.textureManager.createRenderTarget(this.mockCamera.width, this.mockCamera.height, 'chunk_fbo');
            if (rt) {
                this.renderTarget = rt.handle;
                this.fbo = rt.fbo;
            } else {
                console.error("WebGLChunkLayerBuilder: Failed to create render target");
            }
        }
    }

    public isValid(): boolean {
        return this.renderTarget !== null && this.fbo !== null && this.program !== null;
    }

    public getNativeContext(): NativeContext {
        return this.gl;
    }

    public clear(): void {
        for (const batcher of this.batchers.values()) {
            batcher.clear();
        }
    }

    public getMockCamera(): Camera {
        return this.mockCamera;
    }

    private getBatcher(atlasId: number): WebGLBatcher {
        let batcher = this.batchers.get(atlasId);
        if (!batcher) {
            batcher = new WebGLBatcher(this.gl, 4096);
            this.batchers.set(atlasId, batcher);
        }
        return batcher;
    }

    public addBaseHex(x: number, y: number, size: number, type: TerrainType) {
        const gridWidth = Math.sqrt(3) * size;
        const scale = gridWidth / 128; 
        const drawW = 128 * scale;
        
        let baseType = 'BASE_base_land';
        if (type === TerrainType.WATER) baseType = 'BASE_base_water';
        if (type === TerrainType.DESERT) baseType = 'BASE_base_desert';
        
        const baseUV = this.assets.getSpriteUV(baseType);
        
        if (baseUV) {
            const spriteH = drawW * 1.15;
            const batcher = this.getBatcher(baseUV.atlasId);
            batcher.pushQuad(x - drawW/2, y - spriteH * 0.4, drawW, spriteH, baseUV);
        }

        const isProcedural = type === TerrainType.FOREST || type === TerrainType.DESERT || type === TerrainType.MOUNTAIN || type === TerrainType.HILLS;

        if (!isProcedural && type !== TerrainType.PLAINS && type !== TerrainType.WATER) {
             const overlayType = `TERRAIN_${type}`;
             const overlayUV = this.assets.getSpriteUV(overlayType);
             
             if (overlayUV) {
                 const drawH = drawW;
                 const batcher = this.getBatcher(overlayUV.atlasId);
                 batcher.pushQuad(x - drawW/2, y - drawH/2, drawW, drawH, overlayUV);
             }
        }
    }
    
    public addInfraTile(hex: Hex, tile: TileData, map: GameMap) {
        if (!isConnectable(tile)) return;
        
        const baseUV = this.assets.getSpriteUV('BASE_base_land');
        if (!baseUV) return;
        
        // Use a tiny part from the center of the texture for a solid-like color
        const subUV: AtlasUVRect = { 
            ...baseUV, 
            u: baseUV.u + baseUV.w * 0.45,
            v: baseUV.v + baseUV.h * 0.45,
            w: baseUV.w * 0.1, 
            h: baseUV.h * 0.1 
        };

        const p1 = hexToScreen(hex.q, hex.r, this.mockCamera, this.hexSize);
        const neighbors = getHexNeighbors(hex);

        for (const n of neighbors) {
            // Canonical check: only draw if current hex is "smaller" to avoid drawing each segment twice
            if (hex.r > n.r || (hex.r === n.r && hex.q > n.q)) {
                continue;
            }

            if (!map.isValid(n.q, n.r)) continue;
            
            const nTile = map.getTile(n.q, n.r);
            if (nTile && isConnectable(nTile)) {
                const p2 = hexToScreen(n.q, n.r, this.mockCamera, this.hexSize);

                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const len = Math.sqrt(dx*dx + dy*dy);
                if (len === 0) continue;

                const perpX = -dy / len;
                const perpY = dx / len;

                const width = Math.max(2, 6 * this.mockCamera.zoom) / 2;

                const v1x = p1.x - perpX * width;
                const v1y = p1.y - perpY * width;
                const v2x = p1.x + perpX * width;
                const v2y = p1.y + perpY * width;
                const v3x = p2.x - perpX * width;
                const v3y = p2.y - perpY * width;
                const v4x = p2.x + perpX * width;
                const v4y = p2.y + perpY * width;

                const batcher = this.getBatcher(subUV.atlasId);
                batcher.pushVertices([
                    v1x, v1y, subUV.u, subUV.v,
                    v2x, v2y, subUV.u + subUV.w, subUV.v,
                    v3x, v3y, subUV.u, subUV.v + subUV.h,
                    
                    v3x, v3y, subUV.u, subUV.v + subUV.h,
                    v2x, v2y, subUV.u + subUV.w, subUV.v,
                    v4x, v4y, subUV.u + subUV.w, subUV.v + subUV.h
                ]);
            }
        }
    }

    public addCityTile(hex: Hex, tile: TileData) {
        // This method is now intentionally left empty.
        // The city sprite is rendered by MapOverlayInstancingManager for crispness.
    }

    public flush() {
        if (!this.program || !this.vbo) return;

        const prevViewport = this.gl.getParameter(this.gl.VIEWPORT);

        if (this.fbo) {
            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.fbo);
            this.gl.viewport(0, 0, this.mockCamera.width, this.mockCamera.height);
            this.gl.clearColor(0.0, 0.0, 0.0, 0.0);
            this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        }

        this.gl.useProgram(this.program);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vbo);

        this.gl.enableVertexAttribArray(this.locPosition);
        this.gl.vertexAttribPointer(this.locPosition, 2, this.gl.FLOAT, false, 16, 0);

        this.gl.enableVertexAttribArray(this.locTexCoord);
        this.gl.vertexAttribPointer(this.locTexCoord, 2, this.gl.FLOAT, false, 16, 8);

        this.gl.uniform2f(this.locResolution, this.mockCamera.width, this.mockCamera.height);
        
        for (const [atlasId, batcher] of this.batchers) {
            if (batcher.getVertexCount() === 0) continue;

            const atlas = this.assets.getMainAtlasById(atlasId);
            if (atlas && atlas.texture) {
                this.gl.activeTexture(this.gl.TEXTURE0);
                this.gl.bindTexture(this.gl.TEXTURE_2D, atlas.texture);
                if (this.locTexture !== null) {
                    this.gl.uniform1i(this.locTexture, 0);
                }

                this.gl.bufferData(this.gl.ARRAY_BUFFER, batcher.getActiveData(), this.gl.DYNAMIC_DRAW);
                this.gl.drawArrays(this.gl.TRIANGLES, 0, batcher.getVertexCount());
            }
        }

        this.gl.disableVertexAttribArray(this.locPosition);
        this.gl.disableVertexAttribArray(this.locTexCoord);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
        this.gl.useProgram(null);

        if (this.fbo) {
            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
        }

        if (prevViewport) {
            this.gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);
        }
    }

    public getRenderedTexture(): any | null {
        return this.renderTarget;
    }

    public dispose() {
        if (this.fbo) {
            this.gl.deleteFramebuffer(this.fbo);
            this.fbo = null;
        }
        if (this.vbo) {
            this.gl.deleteBuffer(this.vbo);
            this.vbo = null;
        }
    }
}

// --- From ChunkRenderer.ts ---

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
