
import { hexToScreen, Camera } from '../RenderUtils';
import { AssetManager } from '../AssetManager';
import { NativeContext } from './ChunkTypes';
import { WebGLBatcher } from './WebGLBatcher';
import { TerrainType, TileData, ImprovementType, GameMap } from '../../Grid/GameMap';
import { WebGLProgramManager } from '../core/WebGLProgramManager';
import { AtlasUVRect } from '../core/ITexture';
import { getHexNeighbors, Hex } from '../../Grid/HexMath';

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
