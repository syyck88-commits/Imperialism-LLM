
import { GameMap, ResourceType, ImprovementType } from '../../Grid/GameMap';
import { AssetManager } from '../AssetManager';
import { Camera, hexToScreen } from '../RenderUtils';
import { WebGLProgramManager, GPUTextureHandle, GPUResourceRegistry } from '../core/Core';
import { AnimalManager, AnimalInstance } from './AnimalManager';
import { ChunkData, CHUNK_SIZE } from '../chunks/Chunks';
import { QualityManager } from '../../core/quality/QualityManager';

const INSTANCE_FLOAT_COUNT = 9; // x, y, w, h, u, v, uw, vh, flip

const vsSource = `
    attribute vec2 a_quadPosition; // (0, 0) to (1, 1)

    // Per-instance data
    attribute vec4 a_posDest; // x, y, w, h (Screen Coords)
    attribute vec4 a_uv;      // u, v, uw, vh
    attribute float a_flip;   // 1.0 or -1.0

    uniform vec2 u_resolution;

    varying vec2 v_texCoord;
    varying vec2 v_quadCoord;

    void main() {
        v_quadCoord = a_quadPosition;
        
        vec2 finalUV = a_quadPosition;
        if (a_flip < 0.0) {
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
    
    uniform sampler2D u_texture;
    uniform float u_pass; // 0.0 for shadow, 1.0 for sprite

    void main() {
        if (u_pass < 0.5) {
            // Shadow pass: draw a soft ellipse
            vec2 centered = v_quadCoord * 2.0 - 1.0; // map 0..1 to -1..1
            float dist = length(centered);
            float alpha = 1.0 - smoothstep(0.9, 1.0, dist);
            gl_FragColor = vec4(0.0, 0.0, 0.0, alpha * 0.3);
        } else {
            // Sprite pass
            vec4 color = texture2D(u_texture, v_texCoord);
            if (color.a < 0.1) discard;
            gl_FragColor = color;
        }
    }
`;

export class AnimalInstancingManager {
    private gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
    private assets: AssetManager;
    private animalManager: AnimalManager;
    private map: GameMap;
    private hexSize: number;

    private program: WebGLProgram | null = null;
    private quadVBO: WebGLBuffer | null = null;
    private instanceVBO: WebGLBuffer | null = null;
    
    private instanceData: Float32Array; 
    private maxInstances: number = 2000;

    private animalTexture: GPUTextureHandle | null = null;

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

    constructor(map: GameMap, assets: AssetManager, animalManager: AnimalManager, hexSize: number) {
        this.map = map;
        this.assets = assets;
        this.animalManager = animalManager;
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

        if (!this.isSupported) return;

        this.program = WebGLProgramManager.createProgram(this.gl, vsSource, fsSource);
        if (!this.program) {
            this.isSupported = false;
            return;
        }

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
        this.gl = null;
        this.program = null;
        this.quadVBO = null;
        this.instanceVBO = null;
        this.animalTexture = null;
        this.isSupported = false;
    }

    public render(camera: Camera, visibleChunks: ChunkData[]) {
        if (!this.gl || !this.program || !this.isSupported || !this.assets.animalSpriteSheet) return;
        
        if (!this.animalTexture || !this.animalTexture.texture) {
            this.animalTexture = this.assets.textureManager.createTextureFromSource(this.assets.animalSpriteSheet, 'animal_sheet');
        }
        if (!this.animalTexture || !this.animalTexture.texture) return;

        const gl = this.gl;
        const adapter = this.instancingAdapter!;
        const quality = QualityManager.getInstance().getSettings();

        // --- 1. GATHER & SORT ---
        interface RenderItem {
            x:number, y:number, w:number, h:number, 
            u:number, v:number, flip:number, sortY:number,
            config: any,
            animalBaseX: number,
            animalBaseY: number,
            scaleFactor: number
        }
        const renderQueue: RenderItem[] = [];
        const currentHexSize = this.hexSize * camera.zoom;
        const scaleFactor = currentHexSize / 64;
        
        const sheetW = this.assets.animalSpriteSheet.width;
        const sheetH = this.assets.animalSpriteSheet.height;
        const frameW = sheetW / 3;
        const frameH = sheetH / 3;
        const aspect = frameW / frameH;
        const uvW = 1.0 / 3.0;
        const uvH = 1.0 / 3.0;

        for (const chunk of visibleChunks) {
            const startCol = chunk.key.col * CHUNK_SIZE;
            const startRow = chunk.key.row * CHUNK_SIZE;
            for (let r = startRow; r < startRow + CHUNK_SIZE; r++) {
                for (let c = startCol; c < startCol + CHUNK_SIZE; c++) {
                    const q = c - (r - (r & 1)) / 2;
                    if (!this.map.isValid(q, r)) continue;

                    const tile = this.map.getTile(q, r);
                    if (!tile || tile.isHidden || (tile.resource !== ResourceType.MEAT && tile.resource !== ResourceType.WOOL)) continue;

                    const tileKey = `${q},${r}`;
                    let animals = this.animalManager.getAnimals(tileKey);
                    if (!animals || animals.length === 0) {
                        animals = this.animalManager.getOrSpawnAnimals({q, r}, tile.resource);
                    }

                    const config = this.assets.getConfig(`RES_${tile.resource}`);
                    
                    // --- Min Population Logic ---
                    // Only apply min clump logic if quality permits > 1 item
                    if ((quality.maxClumpCount === 0 || quality.maxClumpCount > 1) && config.clumpMin > 0 && animals.length < config.clumpMin) {
                        this.animalManager.ensurePopulation(tileKey, tile.resource, config.clumpMin);
                        animals = this.animalManager.getAnimals(tileKey) || animals;
                    }

                    // --- Fix: Apply Clump Max and Spread ---
                    const spreadMult = config.clumpSpread || 1.0;
                    const pos = hexToScreen(q, r, camera, this.hexSize);
                    
                    // Priority: Quality Limit > Config Limit
                    let count = animals.length;
                    if (quality.maxClumpCount > 0 && count > quality.maxClumpCount) count = quality.maxClumpCount;
                    else if (config.clumpMax > 0 && count > config.clumpMax) count = config.clumpMax;
                    
                    const baseScale = 0.5 * config.scale;
                    const drawH = currentHexSize * baseScale;
                    const drawW = drawH * aspect;
                    const globalShiftX = config.shiftX * scaleFactor;
                    const globalShiftY = config.shiftY * scaleFactor;

                    for (let i = 0; i < count; i++) {
                        const anim = animals[i];
                        const offsetX = (anim.x * spreadMult) * scaleFactor + globalShiftX;
                        const offsetY = (anim.y * spreadMult) * scaleFactor + globalShiftY;
                        const drawX = pos.x + offsetX - drawW / 2;
                        const drawY = pos.y + offsetY - drawH + (5 * scaleFactor);

                        if (drawX > camera.width || drawX + drawW < 0 || drawY > camera.height || drawY + drawH < 0) continue;

                        let row = 0; 
                        if (anim.state === 'WALK') row = anim.walkFrame;
                        if (anim.state === 'EAT') row = 2;
                        const col = anim.variant;
                        
                        renderQueue.push({
                            x: drawX, y: drawY, w: drawW, h: drawH,
                            u: col * uvW, v: row * uvH, flip: anim.flip ? -1.0 : 1.0,
                            sortY: drawY + drawH,
                            config,
                            animalBaseX: pos.x + offsetX,
                            animalBaseY: pos.y + offsetY,
                            scaleFactor
                        });
                    }
                }
            }
        }

        if (renderQueue.length === 0) return;
        renderQueue.sort((a, b) => a.sortY - b.sortY);

        // --- 2. SETUP GL STATE ---
        if (renderQueue.length > this.maxInstances) {
             this.maxInstances = renderQueue.length + 500;
             this.instanceData = new Float32Array(this.maxInstances * INSTANCE_FLOAT_COUNT);
             gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVBO);
             gl.bufferData(gl.ARRAY_BUFFER, this.instanceData.byteLength, gl.DYNAMIC_DRAW);
        }
        
        gl.useProgram(this.program);
        gl.uniform2f(this.uResolution, camera.width, camera.height);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.animalTexture.texture);
        gl.uniform1i(this.uTexture, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
        gl.enableVertexAttribArray(this.locQuad);
        gl.vertexAttribPointer(this.locQuad, 2, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVBO);
        const stride = INSTANCE_FLOAT_COUNT * 4;
        gl.enableVertexAttribArray(this.locPosDest);
        gl.vertexAttribPointer(this.locPosDest, 4, gl.FLOAT, false, stride, 0);
        adapter.vertexAttribDivisor(this.locPosDest, 1);
        gl.enableVertexAttribArray(this.locUV);
        gl.vertexAttribPointer(this.locUV, 4, gl.FLOAT, false, stride, 16);
        adapter.vertexAttribDivisor(this.locUV, 1);
        gl.enableVertexAttribArray(this.locFlip);
        gl.vertexAttribPointer(this.locFlip, 1, gl.FLOAT, false, stride, 32);
        adapter.vertexAttribDivisor(this.locFlip, 1);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        // --- 3. SHADOW PASS (Conditional) ---
        if (quality.shadowsEnabled) {
            let idx = 0;
            let shadowCount = 0;
            
            for (const item of renderQueue) {
                const { config, animalBaseX, animalBaseY, scaleFactor } = item;
                const shadowScale = config.shadowScale ?? 0;
                
                if ((config.drawShadow ?? true) && shadowScale > 0) {
                    const shadowW = 8 * scaleFactor * shadowScale * 2;
                    const shadowH = 4 * scaleFactor * shadowScale * 2;
                    const shadowShiftX = (config.shadowX || 0) * scaleFactor;
                    const shadowShiftY = (config.shadowY || 0) * scaleFactor;
                    const shadowCenterX = animalBaseX + shadowShiftX;
                    const shadowCenterY = animalBaseY + shadowShiftY;

                    this.instanceData[idx++] = shadowCenterX - shadowW / 2;
                    this.instanceData[idx++] = shadowCenterY - shadowH / 2;
                    this.instanceData[idx++] = shadowW;
                    this.instanceData[idx++] = shadowH;
                    idx += 5; // Skip UVs and flip
                    shadowCount++;
                } else {
                    // Fill dummy data for alignment if mixed (not needed here as we repack active buffer)
                    // but since we draw range 0..shadowCount, we just skip pushing to buffer.
                }
            }
            
            if (shadowCount > 0) {
                gl.uniform1f(this.uPass, 0.0);
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instanceData.subarray(0, shadowCount * INSTANCE_FLOAT_COUNT));
                adapter.drawArraysInstanced(gl.TRIANGLES, 0, 6, shadowCount);
            }
        }

        // --- 4. SPRITE PASS ---
        let idx = 0;
        for (const item of renderQueue) {
            this.instanceData[idx++] = item.x;
            this.instanceData[idx++] = item.y;
            this.instanceData[idx++] = item.w;
            this.instanceData[idx++] = item.h;
            this.instanceData[idx++] = item.u;
            this.instanceData[idx++] = item.v;
            this.instanceData[idx++] = uvW;
            this.instanceData[idx++] = uvH;
            this.instanceData[idx++] = item.flip;
        }
        gl.uniform1f(this.uPass, 1.0);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instanceData.subarray(0, idx));
        adapter.drawArraysInstanced(gl.TRIANGLES, 0, 6, renderQueue.length);

        // --- 5. CLEANUP ---
        adapter.vertexAttribDivisor(this.locPosDest, 0);
        adapter.vertexAttribDivisor(this.locUV, 0);
        adapter.vertexAttribDivisor(this.locFlip, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }
}
