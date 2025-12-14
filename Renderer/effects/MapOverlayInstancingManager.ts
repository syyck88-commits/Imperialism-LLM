
import { ResourceType, ImprovementType } from '../../Grid/GameMap';
import { AssetManager } from '../AssetManager';
import { hexToScreen, ISO_FACTOR } from '../RenderUtils';
import { WebGLProgramManager } from '../core/WebGLProgramManager';
import { ChunkData, CHUNK_SIZE } from '../chunks/ChunkTypes';
import { SpriteVisualConfig } from '../assets/SpriteVisuals';

// x, y, w, h, u, v, uw, vh, flip
const INSTANCE_FLOAT_COUNT = 9;

const vsSource = `
    attribute vec2 a_quadPosition; // (0, 0) to (1, 1)

    // Per-instance data
    attribute vec4 a_posDest; // x, y, w, h (Screen Coords)
    attribute vec4 a_uv;      // u, v, uw, vh
    attribute float a_flip;   // 1.0 or -1.0 (not used yet, but good for future)

    uniform vec2 u_resolution;

    varying vec2 v_texCoord;

    void main() {
        v_texCoord = vec2(
            a_uv.x + a_quadPosition.x * a_uv.z,
            a_uv.y + a_quadPosition.y * a_uv.w
        );

        vec2 pixelPos = vec2(
            a_posDest.x + a_quadPosition.x * a_posDest.z,
            a_posDest.y + a_quadPosition.y * a_posDest.w
        );

        vec2 zeroToTwo = (pixelPos / u_resolution) * 2.0;
        vec2 clipSpace = zeroToTwo - 1.0;
        
        gl_Position = vec4(clipSpace * vec2(1, -1), 0.0, 1.0);
    }
`;

const fsSource = `
    precision mediump float;
    varying vec2 v_texCoord;
    uniform sampler2D u_texture;

    void main() {
        vec4 color = texture2D(u_texture, v_texCoord);
        if (color.a < 0.1) discard;
        gl_FragColor = color;
    }
`;

interface RenderItem {
    x: number; y: number; w: number; h: number;
    uv: { u:number, v:number, w:number, h:number };
    atlasId: number;
    sortY: number;
}

export class MapOverlayInstancingManager {
    private gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
    private assets: AssetManager;
    private map: any;
    private hexSize: number;

    private program: WebGLProgram | null = null;
    private quadVBO: WebGLBuffer | null = null;
    private instanceVBO: WebGLBuffer | null = null;
    
    private instanceData: Float32Array; 
    private maxInstances: number = 5000;

    private instancingAdapter: {
        vertexAttribDivisor: (index: number, divisor: number) => void;
        drawArraysInstanced: (mode: GLenum, first: number, count: number, instanceCount: number) => void;
    } | null = null;
    
    public isSupported: boolean = false;

    // Locations
    private locQuad: number = -1;
    private locPosDest: number = -1;
    private locUV: number = -1;
    private locFlip: number = -1;
    private uResolution: WebGLUniformLocation | null = null;
    private uTexture: WebGLUniformLocation | null = null;

    constructor(map: any, assets: AssetManager, hexSize: number) {
        this.map = map;
        this.assets = assets;
        this.hexSize = hexSize;
        this.instanceData = new Float32Array(this.maxInstances * INSTANCE_FLOAT_COUNT);
    }

    public initGL(gl: WebGLRenderingContext | WebGL2RenderingContext) {
        this.gl = gl;
        
        if (gl instanceof WebGL2RenderingContext) {
            this.instancingAdapter = {
                vertexAttribDivisor: (index, divisor) => gl.vertexAttribDivisor(index, divisor),
                drawArraysInstanced: (mode, first, count, instanceCount) => gl.drawArraysInstanced(mode, first, count, instanceCount),
            };
            this.isSupported = true;
        } else {
            const ext = gl.getExtension('ANGLE_instanced_arrays');
            if (ext) {
                this.instancingAdapter = {
                    vertexAttribDivisor: (index, divisor) => ext.vertexAttribDivisorANGLE(index, divisor),
                    drawArraysInstanced: (mode, first, count, instanceCount) => ext.drawArraysInstancedANGLE(mode, first, count, instanceCount),
                };
                this.isSupported = true;
            }
        }

        if (!this.isSupported) {
             console.warn("MapOverlayInstancingManager: Instancing not supported.");
             return;
        }

        this.program = WebGLProgramManager.createProgram(this.gl, vsSource, fsSource);
        if (!this.program) { this.isSupported = false; return; }

        this.uResolution = this.gl.getUniformLocation(this.program, "u_resolution");
        this.uTexture = this.gl.getUniformLocation(this.program, "u_texture");
        this.locQuad = this.gl.getAttribLocation(this.program, "a_quadPosition");
        this.locPosDest = this.gl.getAttribLocation(this.program, "a_posDest");
        this.locUV = this.gl.getAttribLocation(this.program, "a_uv");
        this.locFlip = this.gl.getAttribLocation(this.program, "a_flip");

        this.quadVBO = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadVBO);
        const verts = [0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1];
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(verts), this.gl.STATIC_DRAW);

        this.instanceVBO = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.instanceVBO);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, this.instanceData.byteLength, this.gl.DYNAMIC_DRAW);
    }

    public onContextLost() {
        this.gl = null; this.program = null; this.quadVBO = null; this.instanceVBO = null;
        this.isSupported = false;
    }

    public render(camera: any, visibleChunks: ChunkData[]) {
        if (!this.gl || !this.program || !this.isSupported || !this.assets.isAtlasLoaded) return;

        const renderQueue: RenderItem[] = [];
        const size = this.hexSize * camera.zoom;
        const isoOffset = size * -0.2;

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
                    
                    // --- 1. Resources ---
                    if (tile.resource !== ResourceType.NONE && !tile.isHidden) {
                        const spriteKey = `RES_${tile.resource}`;
                        const spriteUV = this.assets.getSpriteUV(spriteKey);
                        if(spriteUV) {
                            const sprite = this.assets.getResourceSprite(tile.resource);
                            const config = this.assets.getConfig(spriteKey);
                            const aspect = sprite ? sprite.width / sprite.height : 1;
                            const drawH = size * 0.8 * config.scale;
                            const drawW = drawH * aspect;
                            const drawX = x - drawW / 2 + (config.shiftX * camera.zoom);
                            const drawY = y + isoOffset - drawH * 0.5 + (config.shiftY * camera.zoom);
                            renderQueue.push({ x: drawX, y: drawY, w: drawW, h: drawH, uv: spriteUV, atlasId: spriteUV.atlasId, sortY: drawY + drawH });
                        }
                    }

                    // --- 2. Improvements / Buildings ---
                    const imp = tile.improvement;
                    if (imp !== ImprovementType.NONE && ![ImprovementType.ROAD, ImprovementType.RAILROAD].includes(imp)) {
                        let spriteKey: string | null = null;
                        if (imp === ImprovementType.CITY) spriteKey = 'STR_capital';
                        else if (imp === ImprovementType.DEPOT) spriteKey = 'STR_depot';
                        else if (imp === ImprovementType.PORT) spriteKey = 'STR_port';
                        else if (imp === ImprovementType.MINE) spriteKey = 'STR_mine';
                        else if (imp === ImprovementType.FARM) spriteKey = 'STR_farm';
                        else if (imp === ImprovementType.LUMBER_MILL) spriteKey = 'STR_lumber_mill';
                        else if (imp === ImprovementType.OIL_WELL) spriteKey = 'STR_oil_well';
                        else if (imp === ImprovementType.RANCH) spriteKey = tile.resource === ResourceType.WOOL ? 'STR_ranch_wool' : 'STR_ranch_livestock';
                        else if (imp === ImprovementType.PLANTATION) {
                            if (tile.resource === ResourceType.COTTON) spriteKey = 'STR_plantation_cotton';
                            else if (tile.resource === ResourceType.FRUIT) spriteKey = 'STR_plantation_fruit';
                            else spriteKey = 'STR_plantation';
                        }
                        
                        if(spriteKey) {
                            const spriteUV = this.assets.getSpriteUV(spriteKey);
                            const sprite = this.assets.getStructureSprite(spriteKey.replace('STR_', ''));
                            if (spriteUV && sprite) {
                                const config = this.assets.getConfig(spriteKey);
                                const aspect = sprite.width / sprite.height;
                                const baseScale = imp === ImprovementType.CITY ? 2.1 : 1.5;
                                const drawH = size * baseScale * config.scale;
                                const drawW = drawH * aspect;
                                const drawY = y + isoOffset - drawH + (size * 1.1) + (config.shiftY * camera.zoom);
                                const drawX = x - drawW / 2 + (config.shiftX * camera.zoom);
                                renderQueue.push({ x: drawX, y: drawY, w: drawW, h: drawH, uv: spriteUV, atlasId: spriteUV.atlasId, sortY: drawY + drawH });
                            }
                        }
                    }
                }
            }
        }
        if (renderQueue.length === 0) return;

        renderQueue.sort((a, b) => a.sortY - b.sortY);

        this.drawBatch(camera, renderQueue);
    }

    private drawBatch(camera: any, queue: RenderItem[]) {
        const gl = this.gl!;
        const adapter = this.instancingAdapter!;
        
        gl.useProgram(this.program!);
        gl.uniform2f(this.uResolution, camera.width, camera.height);
        gl.uniform1i(this.uTexture, 0);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        const stride = INSTANCE_FLOAT_COUNT * 4;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
        gl.enableVertexAttribArray(this.locQuad);
        gl.vertexAttribPointer(this.locQuad, 2, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVBO);
        gl.enableVertexAttribArray(this.locPosDest); gl.vertexAttribPointer(this.locPosDest, 4, gl.FLOAT, false, stride, 0); adapter.vertexAttribDivisor(this.locPosDest, 1);
        gl.enableVertexAttribArray(this.locUV); gl.vertexAttribPointer(this.locUV, 4, gl.FLOAT, false, stride, 16); adapter.vertexAttribDivisor(this.locUV, 1);
        gl.enableVertexAttribArray(this.locFlip); gl.vertexAttribPointer(this.locFlip, 1, gl.FLOAT, false, stride, 32); adapter.vertexAttribDivisor(this.locFlip, 1);

        let currentAtlasId = -1;
        let instanceCount = 0;
        
        const flush = () => {
            if (instanceCount === 0) return;
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instanceData.subarray(0, instanceCount * INSTANCE_FLOAT_COUNT));
            adapter.drawArraysInstanced(gl.TRIANGLES, 0, 6, instanceCount);
            instanceCount = 0;
        };

        for (const item of queue) {
            if (currentAtlasId !== -1 && item.atlasId !== currentAtlasId) flush();
            if (currentAtlasId !== item.atlasId) {
                const atlas = this.assets.getMainAtlasById(item.atlasId);
                if (atlas?.texture) {
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, atlas.texture);
                    // Set crisp filtering for this pass
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                }
                currentAtlasId = item.atlasId;
            }

            const idx = instanceCount * INSTANCE_FLOAT_COUNT;
            this.instanceData[idx+0] = item.x; this.instanceData[idx+1] = item.y; this.instanceData[idx+2] = item.w; this.instanceData[idx+3] = item.h;
            this.instanceData[idx+4] = item.uv.u; this.instanceData[idx+5] = item.uv.v; this.instanceData[idx+6] = item.uv.w; this.instanceData[idx+7] = item.uv.h;
            this.instanceData[idx+8] = 1.0; // flip
            
            instanceCount++;
            if (instanceCount >= this.maxInstances) flush();
        }
        flush();

        // --- Cleanup and Restore State ---
        if (currentAtlasId !== -1) {
            const atlas = this.assets.getMainAtlasById(currentAtlasId);
            if (atlas?.texture) {
                 gl.bindTexture(gl.TEXTURE_2D, atlas.texture);
                 // Restore default filtering
                 gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                 gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            }
        }
        adapter.vertexAttribDivisor(this.locPosDest, 0);
        adapter.vertexAttribDivisor(this.locUV, 0);
        adapter.vertexAttribDivisor(this.locFlip, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }
}
