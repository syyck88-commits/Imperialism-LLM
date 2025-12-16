
import { ResourceType, ImprovementType } from '../../Grid/GameMap';
import { AssetManager } from '../AssetManager';
import { hexToScreen, ISO_FACTOR } from '../RenderUtils';
import { WebGLProgramManager } from '../core/Core';
import { ChunkData, CHUNK_SIZE } from '../chunks/Chunks';
import { SpriteVisualConfig } from '../assets/SpriteVisuals';
import { QualityManager } from '../../core/quality/QualityManager';

// x, y, w, h, u, v, uw, vh, flip/opacity
const INSTANCE_FLOAT_COUNT = 9;

// Helper for deterministic randomness based on tile coordinates
function pseudoRandom(seed: number): number {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

const vsSource = `
    attribute vec2 a_quadPosition; // (0, 0) to (1, 1)

    // Per-instance data
    attribute vec4 a_posDest; // x, y, w, h (Screen Coords)
    attribute vec4 a_uv;      // u, v, uw, vh
    attribute float a_flip;   // Sprite Pass: 1.0 or -1.0 (Flip). Shadow Pass: Opacity value.

    uniform vec2 u_resolution;
    uniform mediump float u_pass; // 0.0 = shadow, 1.0 = sprite. Explicit mediump to match FS.

    varying vec2 v_texCoord;
    varying vec2 v_quadCoord;
    varying float v_extra; // Passes a_flip/opacity to fragment

    void main() {
        v_quadCoord = a_quadPosition;
        v_extra = a_flip;

        // Calculate UVs (only relevant for sprite pass, but calculated anyway)
        vec2 finalUV = a_quadPosition;
        if (u_pass > 0.5 && a_flip < 0.0) {
            finalUV.x = 1.0 - finalUV.x;
        }
        
        v_texCoord = vec2(
            a_uv.x + finalUV.x * a_uv.z,
            a_uv.y + finalUV.y * a_uv.w
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
    varying vec2 v_quadCoord;
    varying float v_extra;
    
    uniform sampler2D u_texture;
    uniform mediump float u_pass; // 0.0 = shadow, 1.0 = sprite. Explicit mediump.

    void main() {
        if (u_pass < 0.5) {
            // Shadow Pass
            // Draw soft ellipse
            vec2 centered = v_quadCoord * 2.0 - 1.0; // map 0..1 to -1..1
            float dist = length(centered);
            // v_extra holds opacity
            float alpha = 1.0 - smoothstep(0.8, 1.0, dist);
            gl_FragColor = vec4(0.0, 0.0, 0.0, alpha * v_extra);
        } else {
            // Sprite Pass
            vec4 color = texture2D(u_texture, v_texCoord);
            if (color.a < 0.1) discard;
            gl_FragColor = color;
        }
    }
`;

interface RenderItem {
    x: number; y: number; w: number; h: number;
    uv: { u:number, v:number, w:number, h:number };
    atlasId: number;
    sortY: number;
    config: SpriteVisualConfig; // Added config for shadow drawing
    baseX: number; // Base coords for shadow anchor
    baseY: number;
    scaleFactor: number; // For shadow scaling
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
    private uPass: WebGLUniformLocation | null = null;

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
        this.uPass = this.gl.getUniformLocation(this.program, "u_pass");
        
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
        const currentHexSize = this.hexSize * camera.zoom;
        const isoOffset = currentHexSize * -0.2;
        const scaleFactor = currentHexSize / 64;
        
        const quality = QualityManager.getInstance().getSettings();

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
                            
                            // Clump Logic with Quality Override
                            let count = 1;
                            
                            // Priority: Quality Limiter > Config Clumping
                            if (quality.maxClumpCount > 0) {
                                count = quality.maxClumpCount;
                            } else {
                                const min = config.clumpMin || 0;
                                const max = config.clumpMax || 0;
                                
                                if (min > 0 || max > 0) {
                                    const seed = (q * 12345 + r * 67890);
                                    const range = Math.max(0, max - min);
                                    count = Math.max(1, min + Math.floor(pseudoRandom(seed) * (range + 1)));
                                }
                            }

                            for (let i = 0; i < count; i++) {
                                let drawH = currentHexSize * 0.8 * config.scale;
                                
                                let offX = 0;
                                let offY = 0;
                                let sortOffset = 0;

                                if (count > 1) {
                                    drawH *= 0.8;
                                    const seed = (q * 12345 + r * 67890 + i * 54321);
                                    const rndX = pseudoRandom(seed);
                                    const rndY = pseudoRandom(seed + 1);
                                    
                                    const radius = currentHexSize * 0.3 * (config.clumpSpread || 1.0);
                                    const angle = rndX * Math.PI * 2;
                                    const dist = Math.sqrt(rndY) * radius;
                                    
                                    offX = Math.cos(angle) * dist;
                                    offY = Math.sin(angle) * dist * ISO_FACTOR;
                                    sortOffset = offY;
                                }

                                const drawW = drawH * aspect;
                                const drawX = x + offX - drawW / 2 + (config.shiftX * camera.zoom);
                                const drawY = y + offY + isoOffset - drawH * 0.5 + (config.shiftY * camera.zoom);
                                
                                renderQueue.push({ 
                                    x: drawX, y: drawY, w: drawW, h: drawH, 
                                    uv: spriteUV, atlasId: spriteUV.atlasId, 
                                    sortY: drawY + drawH + sortOffset, 
                                    config,
                                    baseX: x + offX, baseY: y + offY, scaleFactor
                                });
                            }
                        }
                    }

                    // --- 2. Improvements ---
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
                                const drawH = currentHexSize * baseScale * config.scale;
                                const drawW = drawH * aspect;
                                const drawY = y + isoOffset - drawH + (currentHexSize * 1.1) + (config.shiftY * camera.zoom);
                                const drawX = x - drawW / 2 + (config.shiftX * camera.zoom);
                                
                                renderQueue.push({ 
                                    x: drawX, y: drawY, w: drawW, h: drawH, 
                                    uv: spriteUV, atlasId: spriteUV.atlasId, sortY: drawY + drawH,
                                    config,
                                    baseX: x, baseY: y, scaleFactor
                                });
                            }
                        }
                    }
                }
            }
        }
        if (renderQueue.length === 0) return;

        renderQueue.sort((a, b) => a.sortY - b.sortY);

        this.drawBatch(camera, renderQueue, quality.shadowsEnabled);
    }

    private drawBatch(camera: any, queue: RenderItem[], shadowsEnabled: boolean) {
        const gl = this.gl!;
        const adapter = this.instancingAdapter!;
        
        if (queue.length > this.maxInstances) {
             this.maxInstances = queue.length + 500;
             this.instanceData = new Float32Array(this.maxInstances * INSTANCE_FLOAT_COUNT);
             gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVBO);
             gl.bufferData(gl.ARRAY_BUFFER, this.instanceData.byteLength, gl.DYNAMIC_DRAW);
        }

        gl.useProgram(this.program!);
        gl.uniform2f(this.uResolution, camera.width, camera.height);
        gl.uniform1i(this.uTexture, 0);

        // Ensure we draw on top of everything
        gl.disable(gl.DEPTH_TEST);
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

        // --- 1. SHADOW PASS (Conditional) ---
        if (shadowsEnabled) {
            let shadowCount = 0;
            let idx = 0;
            
            for (const item of queue) {
                const { config, baseX, baseY, scaleFactor } = item;
                
                if ((config.drawShadow ?? true) && config.shadowScale > 0) {
                    const shadowW = 8 * scaleFactor * config.shadowScale * 2;
                    const shadowH = 4 * scaleFactor * config.shadowScale * 2;
                    const shadowShiftX = (config.shadowX || 0) * scaleFactor;
                    const shadowShiftY = (config.shadowY || 0) * scaleFactor;
                    
                    const shadowCenterX = item.x + item.w/2 + shadowShiftX;
                    const shadowCenterY = item.y + item.h + shadowShiftY;

                    this.instanceData[idx++] = shadowCenterX - shadowW / 2;
                    this.instanceData[idx++] = shadowCenterY - shadowH / 2;
                    this.instanceData[idx++] = shadowW;
                    this.instanceData[idx++] = shadowH;
                    
                    // Skip UVs, use Flip for Opacity
                    this.instanceData[idx++] = 0; this.instanceData[idx++] = 0; this.instanceData[idx++] = 0; this.instanceData[idx++] = 0;
                    this.instanceData[idx++] = config.shadowOpacity ?? 0.3; // Pass opacity in last float
                    
                    shadowCount++;
                }
            }
            
            if (shadowCount > 0) {
                gl.uniform1f(this.uPass, 0.0);
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instanceData.subarray(0, shadowCount * INSTANCE_FLOAT_COUNT));
                adapter.drawArraysInstanced(gl.TRIANGLES, 0, 6, shadowCount);
            }
        }

        // --- 2. SPRITE PASS ---
        let currentAtlasId = -1;
        let instanceCount = 0;
        let idx = 0;
        
        const flush = () => {
            if (instanceCount === 0) return;
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instanceData.subarray(0, instanceCount * INSTANCE_FLOAT_COUNT));
            adapter.drawArraysInstanced(gl.TRIANGLES, 0, 6, instanceCount);
            instanceCount = 0;
            idx = 0;
        };

        gl.uniform1f(this.uPass, 1.0);

        for (const item of queue) {
            if (currentAtlasId !== -1 && item.atlasId !== currentAtlasId) flush();
            
            if (currentAtlasId !== item.atlasId) {
                const atlas = this.assets.getMainAtlasById(item.atlasId);
                if (atlas?.texture) {
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, atlas.texture);
                    
                    // Safe filter application
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                    
                    // Only use Mipmap filter if texture supports it (created with mipLevels > 1)
                    if ((atlas.mipLevels ?? 1) > 1) {
                        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_NEAREST); 
                        // Note: Using NEAREST_MIPMAP_NEAREST keeps pixel art crisp while reducing aliasing
                    } else {
                        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                    }
                }
                currentAtlasId = item.atlasId;
            }

            this.instanceData[idx++] = item.x; this.instanceData[idx++] = item.y; this.instanceData[idx++] = item.w; this.instanceData[idx++] = item.h;
            this.instanceData[idx++] = item.uv.u; this.instanceData[idx++] = item.uv.v; this.instanceData[idx++] = item.uv.w; this.instanceData[idx++] = item.uv.h;
            this.instanceData[idx++] = 1.0; 
            
            instanceCount++;
            if (instanceCount >= this.maxInstances) flush();
        }
        flush();

        // --- Cleanup ---
        if (currentAtlasId !== -1) {
            // Restore safe defaults for other renderers
            const atlas = this.assets.getMainAtlasById(currentAtlasId);
            if (atlas?.texture) {
                 gl.bindTexture(gl.TEXTURE_2D, atlas.texture);
                 gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                 // Only set MIPMAP filter if supported
                 if ((atlas.mipLevels ?? 1) > 1) {
                     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
                 } else {
                     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                 }
            }
        }
        adapter.vertexAttribDivisor(this.locPosDest, 0);
        adapter.vertexAttribDivisor(this.locUV, 0);
        adapter.vertexAttribDivisor(this.locFlip, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }
}
