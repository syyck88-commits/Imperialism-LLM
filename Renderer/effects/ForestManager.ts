import { GameMap, ImprovementType, TerrainType } from '../../Grid/GameMap';
import { Hex, hexToString } from '../../Grid/HexMath';
import { AssetManager } from '../AssetManager';
import { Camera, ISO_FACTOR, hexToScreen } from '../RenderUtils';
import { WebGLProgramManager } from '../core/WebGLProgramManager';
import { AtlasUVRect } from '../core/ITexture';

// Helper to generate deterministic random numbers
function pseudoRandom(seed: number): number {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

// Static data for a single tree, calculated once at init
interface TreeInstance {
    hex: Hex;
    x: number; // world x of tree base
    y: number; // world y of tree base
    variant: number;
    baseScale: number;
    flip: boolean;
    phase: number; // for wind animation
    uv: AtlasUVRect | null;
    sortKey: number; // y-coord for painter's algorithm
    // FIX: Add missing properties
    depth: number;
    hasRoad: boolean;
    hasBuilding: boolean;
}

// Data packed into the instance buffer for a single tree
interface InstanceData {
    x: number;
    y: number;
    w: number;
    h: number;
    u: number;
    v: number;
    uw: number;
    uh: number;
    phase: number;
    flip: number; // 1.0 or -1.0
}

const INSTANCE_FLOAT_COUNT = 10; // The number of floats per instance

const vsSource = `
    attribute vec2 a_quadPosition; // (-0.5, -0.5) to (0.5, 0.5)

    // Per-instance data (10 floats total)
    attribute vec4 a_instanceTransform; // x, y, width, height
    attribute vec4 a_instanceUv;        // u, v, u_width, v_height
    attribute vec2 a_instanceParams;    // phase, flip

    uniform vec2 u_resolution;
    uniform float u_time;
    uniform float u_windStrength;

    varying vec2 v_texCoord;

    void main() {
        float phase = a_instanceParams.x;
        float flip = a_instanceParams.y; // 1.0 or -1.0

        float sway = 0.0;
        if (a_quadPosition.y < 0.0) { // Sway top vertices (quad is from y=-0.5 to 0.5)
            float sway_amount = sin(u_time * 2.5 + phase) * 0.08 * u_windStrength;
            sway = sway_amount * a_instanceTransform.z; // Sway is proportional to width
        }

        // Calculate vertex position in pixels, anchored at bottom-center
        // The original logic drew downwards from the anchor (y to y+h). This is corrected
        // to draw upwards (y-h to y) to match the 2D renderer and correct vertical position.
        vec2 pixel_pos = a_instanceTransform.xy + vec2(
            a_quadPosition.x * a_instanceTransform.z, 
            (a_quadPosition.y + 0.5) * a_instanceTransform.w - a_instanceTransform.w
        ) + vec2(sway, 0.0);

        // Convert to clip space
        vec2 clipSpace = (pixel_pos / u_resolution) * 2.0 - 1.0;
        gl_Position = vec4(clipSpace * vec2(1, -1), 0.0, 1.0);

        // Calculate texture coordinates, handling flip
        float u = a_instanceUv.x + (a_quadPosition.x * flip + 0.5) * a_instanceUv.z;
        float v = a_instanceUv.y + (a_quadPosition.y + 0.5) * a_instanceUv.w;
        v_texCoord = vec2(u, v);
    }
`;

const fsSource = `
    precision mediump float;
    varying vec2 v_texCoord;
    uniform sampler2D u_texture;

    void main() {
        gl_FragColor = texture2D(u_texture, v_texCoord);
        if (gl_FragColor.a < 0.1) discard;
    }
`;

export class ForestManager {
    private gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
    private assets: AssetManager;
    private allTrees: TreeInstance[] = [];
    private hexSize: number;

    private program: WebGLProgram | null = null;
    private quadVBO: WebGLBuffer | null = null;
    private instanceVBO: WebGLBuffer | null = null;
    private instanceData: Float32Array;
    private maxInstances: number = 20000;
    
    private instancingAdapter: {
        vertexAttribDivisor: (index: number, divisor: number) => void;
        drawArraysInstanced: (mode: GLenum, first: number, count: number, instanceCount: number) => void;
    } | null = null;
    private isSupported: boolean = false;


    private loc_quadPosition: number = -1;
    private loc_instanceTransform: number = -1;
    private loc_instanceUv: number = -1;
    private loc_instanceParams: number = -1;
    private u_resolution: WebGLUniformLocation | null = null;
    private u_texture: WebGLUniformLocation | null = null;
    private u_time: WebGLUniformLocation | null = null;
    private u_windStrength: WebGLUniformLocation | null = null;

    constructor(map: GameMap, assets: AssetManager, forestData: Map<string, number>, hexSize: number) {
        this.assets = assets;
        this.hexSize = hexSize;
        this.instanceData = new Float32Array(this.maxInstances * INSTANCE_FLOAT_COUNT);
        this._generateStaticTreeData(map, forestData);
    }

    public initGL(gl: WebGLRenderingContext | WebGL2RenderingContext) {
        this.gl = gl;
        
        if (gl instanceof WebGL2RenderingContext) {
            console.log("ForestManager: Using WebGL2 native instancing.");
            this.instancingAdapter = {
                vertexAttribDivisor: (index, divisor) => gl.vertexAttribDivisor(index, divisor),
                drawArraysInstanced: (mode, first, count, instanceCount) => gl.drawArraysInstanced(mode, first, count, instanceCount),
            };
            this.isSupported = true;
        } else {
            const ext = gl.getExtension('ANGLE_instanced_arrays');
            if (ext) {
                console.log("ForestManager: Using ANGLE_instanced_arrays extension.");
                this.instancingAdapter = {
                    vertexAttribDivisor: (index, divisor) => ext.vertexAttribDivisorANGLE(index, divisor),
                    drawArraysInstanced: (mode, first, count, instanceCount) => ext.drawArraysInstancedANGLE(mode, first, count, instanceCount),
                };
                this.isSupported = true;
            }
        }

        if (!this.isSupported) {
            console.error("ForestManager: Instanced rendering is not supported in this browser.");
            return;
        }

        this.program = WebGLProgramManager.createProgram(this.gl, vsSource, fsSource);
        if (!this.program) {
            this.isSupported = false; // Program compilation failed
            return;
        }

        // Uniforms
        this.u_resolution = this.gl.getUniformLocation(this.program, "u_resolution");
        this.u_texture = this.gl.getUniformLocation(this.program, "u_texture");
        this.u_time = this.gl.getUniformLocation(this.program, "u_time");
        this.u_windStrength = this.gl.getUniformLocation(this.program, "u_windStrength");

        // Attributes
        this.loc_quadPosition = this.gl.getAttribLocation(this.program, "a_quadPosition");
        this.loc_instanceTransform = this.gl.getAttribLocation(this.program, "a_instanceTransform");
        this.loc_instanceUv = this.gl.getAttribLocation(this.program, "a_instanceUv");
        this.loc_instanceParams = this.gl.getAttribLocation(this.program, "a_instanceParams");

        // Quad VBO (static)
        this.quadVBO = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadVBO);
        const quadVerts = [ -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5 ];
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(quadVerts), this.gl.STATIC_DRAW);

        // Instance VBO (dynamic)
        this.instanceVBO = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.instanceVBO);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, this.instanceData.byteLength, this.gl.DYNAMIC_DRAW);
    }

    public onContextLost() {
        this.gl = null;
        this.program = null;
        this.quadVBO = null;
        this.instanceVBO = null;
        this.instancingAdapter = null;
        this.isSupported = false;
    }

    private _generateStaticTreeData(map: GameMap, forestData: Map<string, number>) {
        console.time("Generate Static Tree Data");
        for (let r = 0; r < map.height; r++) {
            for (let c = 0; c < map.width; c++) {
                const q = c - (r - (r & 1)) / 2;
                const hex = {q, r};
                const key = hexToString(hex);
                const tile = map.getTile(q, r);

                if (!tile || tile.terrain !== TerrainType.FOREST) continue;

                const hasRoad = tile.improvement === ImprovementType.ROAD || tile.improvement === ImprovementType.RAILROAD;
                const hasBuilding = tile.improvement !== ImprovementType.NONE && !hasRoad;
                const depth = forestData.get(key) || 1;

                const seed = (q * 12345 + r * 67890);
                const rng = (offset: number) => pseudoRandom(seed + offset);

                let minTrees = 3, randomAdd = 3, spreadMult = 0.75, sizeMultiplier = 1.0;
                if (depth >= 3) { minTrees = 7; randomAdd = 4; spreadMult = 0.7; }
                else if (depth === 2) { minTrees = 5; randomAdd = 3; }
                else { minTrees = 3; randomAdd = 2; spreadMult = 0.8; }
                if (hasRoad) { minTrees = 2; randomAdd = 2; sizeMultiplier = 0.65; spreadMult = 0.9; }
                if (hasBuilding) { minTrees = 1; randomAdd = 2; sizeMultiplier = 0.6; spreadMult = 1.1; }

                const treeCount = minTrees + Math.floor(rng(0) * randomAdd);

                for (let i = 0; i < treeCount; i++) {
                    const angle = rng(i + 1) * Math.PI * 2;
                    let distBase = Math.sqrt(rng(i + 2));
                    if (hasRoad || hasBuilding) distBase = 0.5 + (distBase * 0.5);

                    const dist = distBase * (this.hexSize * spreadMult);
                    const offsetX = Math.cos(angle) * dist;
                    const offsetY = Math.sin(angle) * dist * ISO_FACTOR;

                    const rVar = rng(i + 3);
                    let variant = 1;
                    if (depth >= 3) variant = rVar > 0.3 ? 4 : 3;
                    else if (depth === 2) variant = rVar > 0.4 ? 3 : 2;
                    else variant = rVar > 0.5 ? 2 : 1;

                    let baseScale = 0.8;
                    if (depth >= 3) { baseScale = 1.0 + (rng(i+4) * 0.4); if (depth > 4 && rVar > 0.8 && variant === 4) baseScale = 1.7; }
                    else if (depth === 2) { baseScale = 0.8 + (rng(i+4) * 0.2); }
                    else { baseScale = 0.6 + (rng(i+4) * 0.2); }
                    baseScale *= sizeMultiplier;

                    const { x: worldX, y: worldY } = hexToScreen(q, r, {x:0, y:0, zoom:1, width:0, height:0}, this.hexSize);

                    this.allTrees.push({
                        hex,
                        x: worldX + offsetX,
                        y: worldY + offsetY,
                        depth, hasRoad, hasBuilding,
                        variant, baseScale,
                        flip: rng(i + 99) > 0.5,
                        phase: rng(i * 10) * Math.PI * 2,
                        uv: null, // will be resolved later
                        sortKey: worldY + offsetY,
                    });
                }
            }
        }
        console.timeEnd("Generate Static Tree Data");
    }

    private _resolveTreeUVs() {
        for(const tree of this.allTrees) {
            if (!tree.uv) {
                tree.uv = this.assets.getSpriteUV(`FOREST_${tree.variant}`);
            }
        }
    }

    public render(camera: Camera, time: number, windStrength: number) {
        if (!this.gl || !this.program || !this.isSupported || !this.assets.isAtlasLoaded || !this.instancingAdapter) return;
        
        this._resolveTreeUVs(); // Lazy resolve UVs once atlas is loaded

        const gl = this.gl;
        const adapter = this.instancingAdapter;

        const visibleTrees: TreeInstance[] = [];
        const viewRect = {
            x: camera.x,
            y: camera.y,
            w: camera.width / camera.zoom,
            h: camera.height / camera.zoom
        };
        const buffer = this.hexSize * 4; // Add a buffer around viewport

        for (const tree of this.allTrees) {
            if (tree.x > viewRect.x - buffer && tree.x < viewRect.x + viewRect.w + buffer &&
                tree.y > viewRect.y - buffer && tree.y < viewRect.y + viewRect.h + buffer) {
                visibleTrees.push(tree);
            }
        }
        
        if (visibleTrees.length === 0) return;

        visibleTrees.sort((a, b) => a.sortKey - b.sortKey);

        let instanceCount = 0;
        let currentAtlasId = -1;

        const flush = () => {
            if (instanceCount === 0) return;
            
            gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVBO);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instanceData.subarray(0, instanceCount * INSTANCE_FLOAT_COUNT));

            const atlas = this.assets.getMainAtlasById(currentAtlasId);
            if(atlas && atlas.texture) {
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, atlas.texture);
            } else {
                return; // Can't draw without a texture
            }
            
            adapter.drawArraysInstanced(gl.TRIANGLES, 0, 6, instanceCount);
            instanceCount = 0;
        };

        gl.useProgram(this.program);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.uniform2f(this.u_resolution, camera.width, camera.height);
        gl.uniform1f(this.u_time, time);
        gl.uniform1f(this.u_windStrength, windStrength);
        if (this.u_texture) gl.uniform1i(this.u_texture, 0);

        // Setup attributes
        const stride = INSTANCE_FLOAT_COUNT * 4;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
        gl.enableVertexAttribArray(this.loc_quadPosition);
        gl.vertexAttribPointer(this.loc_quadPosition, 2, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVBO);
        gl.enableVertexAttribArray(this.loc_instanceTransform);
        gl.vertexAttribPointer(this.loc_instanceTransform, 4, gl.FLOAT, false, stride, 0);
        adapter.vertexAttribDivisor(this.loc_instanceTransform, 1);
        
        gl.enableVertexAttribArray(this.loc_instanceUv);
        gl.vertexAttribPointer(this.loc_instanceUv, 4, gl.FLOAT, false, stride, 16);
        adapter.vertexAttribDivisor(this.loc_instanceUv, 1);
        
        gl.enableVertexAttribArray(this.loc_instanceParams);
        gl.vertexAttribPointer(this.loc_instanceParams, 2, gl.FLOAT, false, stride, 32);
        adapter.vertexAttribDivisor(this.loc_instanceParams, 1);

        // Populate and draw batches
        for (const tree of visibleTrees) {
            if (!tree.uv) continue;
            if (currentAtlasId !== -1 && tree.uv.atlasId !== currentAtlasId) {
                flush();
            }
            currentAtlasId = tree.uv.atlasId;

            const sprite = this.assets.getForestSprite(tree.variant);
            if (!sprite) continue;

            const aspect = sprite.width / sprite.height;
            const drawH = (this.hexSize * 1.0 * tree.baseScale) * camera.zoom;
            const drawW = drawH * aspect;
            
            const screenX = (tree.x - camera.x) * camera.zoom;
            const screenY = (tree.y - camera.y) * camera.zoom;
            
            const idx = instanceCount * INSTANCE_FLOAT_COUNT;
            this.instanceData[idx + 0] = screenX;
            this.instanceData[idx + 1] = screenY;
            this.instanceData[idx + 2] = drawW;
            this.instanceData[idx + 3] = drawH;
            this.instanceData[idx + 4] = tree.uv.u;
            this.instanceData[idx + 5] = tree.uv.v;
            this.instanceData[idx + 6] = tree.uv.w;
            this.instanceData[idx + 7] = tree.uv.h;
            this.instanceData[idx + 8] = tree.phase;
            this.instanceData[idx + 9] = tree.flip ? -1.0 : 1.0;
            
            instanceCount++;
            if (instanceCount >= this.maxInstances) {
                flush();
            }
        }
        flush();

        // Cleanup
        adapter.vertexAttribDivisor(this.loc_instanceTransform, 0);
        adapter.vertexAttribDivisor(this.loc_instanceUv, 0);
        adapter.vertexAttribDivisor(this.loc_instanceParams, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }
}
