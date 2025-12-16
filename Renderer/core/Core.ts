
/**
 * Represents a rectangular region in UV space (normalized 0..1).
 * Used to map sprites within a Texture Atlas.
 */
export interface UVRect {
    u: number; // Left
    v: number; // Top (depending on API, usually 0 is top or bottom)
    w: number; // Width
    h: number; // Height
}

/**
 * Extended UVRect that identifies which atlas texture the coordinates belong to.
 */
export interface AtlasUVRect extends UVRect {
    atlasId: number;
}

/**
 * An opaque handle representing a texture on the GPU.
 */
export interface GPUTextureHandle {
    id: number;
    width: number;
    height: number;
    texture: WebGLTexture | null;
    /**
     * Optional flag indicating how this texture was created.
     * 'upload' = Created from an image/canvas source.
     * 'fbo' = Created as an empty render target for a Framebuffer.
     */
    origin?: 'upload' | 'fbo';
    mipLevels?: number;
}

/**
 * Result structure for multi-atlas packing.
 * Contains a list of texture handles (one for each generated atlas) 
 * and a map of UV rects keyed by sprite name.
 */
export interface MultiPackedAtlasResult {
    handles: GPUTextureHandle[];
    rects: Map<string, AtlasUVRect>;
}

/**
 * A singleton class to track all allocated WebGL resources for debugging purposes.
 */
export class GPUResourceRegistry {
    private static instance: GPUResourceRegistry;

    private textures: Map<number, { handle: GPUTextureHandle, owner: string }> = new Map();
    private totalTextures: number = 0;
    private estimatedBytes: number = 0;
    private byOwner: Map<string, { count: number, bytes: number }> = new Map();

    private constructor() { }

    public static getInstance(): GPUResourceRegistry {
        if (!GPUResourceRegistry.instance) {
            GPUResourceRegistry.instance = new GPUResourceRegistry();
        }
        return GPUResourceRegistry.instance;
    }

    public registerTexture(handle: GPUTextureHandle, ownerTag: string): void {
        if (this.textures.has(handle.id)) {
            console.warn(`GPUResourceRegistry: Texture with ID ${handle.id} is already registered.`, handle);
            return;
        }

        const bytes = handle.width * handle.height * 4; // Assuming RGBA8

        this.totalTextures++;
        this.estimatedBytes += bytes;
        
        const ownerStats = this.byOwner.get(ownerTag) || { count: 0, bytes: 0 };
        ownerStats.count++;
        ownerStats.bytes += bytes;
        this.byOwner.set(ownerTag, ownerStats);

        this.textures.set(handle.id, { handle, owner: ownerTag });
    }

    public unregisterTexture(handle: GPUTextureHandle | null | undefined): void {
        if (!handle || !this.textures.has(handle.id)) {
            // It might have been unregistered already or was never registered.
            return;
        }

        const registration = this.textures.get(handle.id)!;
        const bytes = registration.handle.width * registration.handle.height * 4;

        this.totalTextures--;
        this.estimatedBytes -= bytes;

        const ownerStats = this.byOwner.get(registration.owner);
        if (ownerStats) {
            ownerStats.count--;
            ownerStats.bytes -= bytes;
            if (ownerStats.count <= 0) {
                this.byOwner.delete(registration.owner);
            }
        }

        this.textures.delete(handle.id);
    }

    public toDebugString(): string {
        const mb = (this.estimatedBytes / 1024 / 1024).toFixed(2);
        let output = `Textures: <span class='text-white'>${this.totalTextures}</span> | VRAM: <span class='text-white'>~${mb} MB</span>`;
        return output;
    }

    public onContextLost(): void {
        console.warn("GPUResourceRegistry: Context lost, resetting all stats.");
        this.textures.clear();
        this.byOwner.clear();
        this.totalTextures = 0;
        this.estimatedBytes = 0;
    }
}

export class WebGLProgramManager {
    static createProgram(gl: WebGLRenderingContext | WebGL2RenderingContext, vertexShaderSource: string, fragmentShaderSource: string): WebGLProgram | null {
        const vertexShader = WebGLProgramManager.compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = WebGLProgramManager.compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

        if (!vertexShader || !fragmentShader) return null;

        const program = gl.createProgram();
        if (!program) return null;

        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);

        const success = gl.getProgramParameter(program, gl.LINK_STATUS);
        if (!success) {
            console.error('WebGL Program Link Error:', gl.getProgramInfoLog(program));
            gl.deleteProgram(program);
            return null;
        }

        return program;
    }

    static compileShader(gl: WebGLRenderingContext | WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
        const shader = gl.createShader(type);
        if (!shader) return null;

        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
        if (!success) {
            console.error('WebGL Shader Compile Error:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }

        return shader;
    }

    static getTerrainVertexShader(): string {
        return `
            attribute vec2 a_position;
            attribute vec2 a_texCoord;

            uniform vec2 u_resolution;

            varying vec2 v_texCoord;

            void main() {
                // Convert pixels to 0.0->1.0
                vec2 zeroToOne = a_position / u_resolution;
                
                // Convert 0->1 to 0->2
                vec2 zeroToTwo = zeroToOne * 2.0;
                
                // Convert 0->2 to -1->+1 (clip space)
                vec2 clipSpace = zeroToTwo - 1.0;
                
                // Flip Y axis (canvas vs webgl coords)
                gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
                
                v_texCoord = a_texCoord;
            }
        `;
    }

    static getTerrainFragmentShader(): string {
        return `
            precision mediump float;

            varying vec2 v_texCoord;
            uniform sampler2D u_texture;

            void main() {
                gl_FragColor = texture2D(u_texture, v_texCoord);
                
                // Discard fully transparent pixels to keep depth buffer clean if used, 
                // though for 2D batching painter's algorithm is usually relied upon.
                if (gl_FragColor.a < 0.01) discard;
            }
        `;
    }
}

/**
 * Manages GPU textures and handles the packing of sprites into Texture Atlases.
 */
export class TextureManager {
    private gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
    private nextId: number = 1;
    private maxTextureSize: number = 2048; // Safe fallback
    private registry = GPUResourceRegistry.getInstance();

    public init(gl: WebGLRenderingContext | WebGL2RenderingContext) {
        this.gl = gl;
        const param = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        if (param) {
            this.maxTextureSize = param;
        }
    }

    public createTextureFromSource(
        source: HTMLImageElement | HTMLCanvasElement | OffscreenCanvas,
        ownerTag: string = 'unknown',
        useMipmaps: boolean = false
    ): GPUTextureHandle | null {
        if (!this.gl) return null;
        const gl = this.gl;
        
        const texture = gl.createTexture();
        if (!texture) return null;

        gl.bindTexture(gl.TEXTURE_2D, texture);
        
        // Upload data
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source as TexImageSource);
        
        // Set parameters
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        
        const isWebGL2 = gl instanceof WebGL2RenderingContext;
        const isPowerOfTwo = (value: number) => (value & (value - 1)) === 0;
        let mipLevels = 1;

        if (useMipmaps) {
            if (isWebGL2 || (isPowerOfTwo(source.width) && isPowerOfTwo(source.height))) {
                mipLevels = Math.floor(Math.log2(Math.max(source.width, source.height))) + 1;
                gl.generateMipmap(gl.TEXTURE_2D);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
                
                const ext = (
                    gl.getExtension('EXT_texture_filter_anisotropic') ||
                    (gl as any).getExtension('WEBKIT_EXT_texture_filter_anisotropic') ||
                    (gl as any).getExtension('MOZ_EXT_texture_filter_anisotropic')
                );
                if (ext) {
                    const maxAniso = gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
                    gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(4, maxAniso));
                }
            } else {
                // Fallback for WebGL1 NPOT: turn off mipmaps
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            }
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        } else {
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        }

        // Unbind
        gl.bindTexture(gl.TEXTURE_2D, null);

        const handle: GPUTextureHandle = {
            id: this.nextId++,
            width: source.width,
            height: source.height,
            texture: texture,
            origin: 'upload',
            mipLevels
        };
        
        this.registry.registerTexture(handle, ownerTag);
        return handle;
    }

    /**
     * Creates an empty texture and an associated Framebuffer Object (FBO) for rendering.
     */
    public createRenderTarget(
        width: number, 
        height: number,
        ownerTag: string = 'unknown_fbo'
    ): { handle: GPUTextureHandle, fbo: WebGLFramebuffer } | null {
        if (!this.gl) return null;
        const gl = this.gl;

        const w = Math.max(1, Math.ceil(width));
        const h = Math.max(1, Math.ceil(height));

        const maxSize = this.maxTextureSize;
        if (w > maxSize || h > maxSize) {
            console.error(`TextureManager: Render target size ${w}x${h} exceeds max texture size ${maxSize}`);
            return null;
        }

        const texture = gl.createTexture();
        if (!texture) return null;

        gl.bindTexture(gl.TEXTURE_2D, texture);

        const isWebGL2 = gl instanceof WebGL2RenderingContext;
        const isPowerOfTwo = (value: number) => (value & (value - 1)) === 0;
        const canHaveMipmaps = isWebGL2 || (isPowerOfTwo(w) && isPowerOfTwo(h));
        const mipLevels = canHaveMipmaps ? Math.floor(Math.log2(Math.max(w, h))) + 1 : 1;

        if (isWebGL2) {
            gl.texStorage2D(gl.TEXTURE_2D, mipLevels, gl.RGBA8, w, h);
        } else {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        }

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        
        if (canHaveMipmaps) {
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        } else {
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        }

        const fbo = gl.createFramebuffer();
        if (!fbo) {
            gl.deleteTexture(texture);
            return null;
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.deleteFramebuffer(fbo);
            gl.deleteTexture(texture);
            return null;
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);

        const handle: GPUTextureHandle = {
            id: this.nextId++,
            width: w,
            height: h,
            texture,
            origin: 'fbo',
            mipLevels
        };

        this.registry.registerTexture(handle, ownerTag);

        return { handle, fbo };
    }

    /**
     * Creates texture atlases from a map of source images.
     * Packs images into textures, creating multiple atlases if the size limit is exceeded.
     */
    public createTextureAtlas(images: Map<string, HTMLImageElement | HTMLCanvasElement>): MultiPackedAtlasResult | null {
        if (!this.gl || images.size === 0) return null;
        
        const MAX_SIZE = this.maxTextureSize || 4096;
        // Use full width for atlas
        const ATLAS_WIDTH = Math.min(4096, MAX_SIZE);
        const ATLAS_HEIGHT_LIMIT = Math.min(4096, MAX_SIZE);
        
        const handles: GPUTextureHandle[] = [];
        const finalRects = new Map<string, AtlasUVRect>();

        let currentAtlasId = 0;
        let x = 0;
        let y = 0;
        let rowHeight = 0;

        interface PendingDraw {
            key: string;
            img: HTMLImageElement | HTMLCanvasElement;
            x: number;
            y: number;
            w: number;
            h: number;
        }

        let currentBatch: PendingDraw[] = [];

        const flushBatch = () => {
            if (currentBatch.length === 0) return;

            let totalHeight = Math.max(1, y + rowHeight);
            
            // Fix: Round height up to next Power of Two to ensure WebGL 1 Mipmap compatibility
            const nextPOT = Math.pow(2, Math.ceil(Math.log2(totalHeight)));
            // Clamp to max size, but prefer POT if possible
            if (nextPOT <= ATLAS_HEIGHT_LIMIT) {
                totalHeight = nextPOT;
            } else {
                // If larger than max texture, stick to max (already checked by ATLAS_HEIGHT_LIMIT in logic)
                totalHeight = Math.min(totalHeight, ATLAS_HEIGHT_LIMIT);
            }
            
            const canvas = document.createElement('canvas');
            canvas.width = ATLAS_WIDTH;
            canvas.height = totalHeight;
            
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const wInv = 1.0 / canvas.width;
            const hInv = 1.0 / canvas.height;

            for (const item of currentBatch) {
                ctx.drawImage(item.img, item.x, item.y);
                finalRects.set(item.key, {
                    u: item.x * wInv,
                    v: item.y * hInv,
                    w: item.w * wInv,
                    h: item.h * hInv,
                    atlasId: currentAtlasId
                });
            }

            const handle = this.createTextureFromSource(canvas, 'sprite_atlas', true);
            if (handle) {
                handles.push(handle);
            }

            currentBatch = [];
            currentAtlasId++;
            x = 0;
            y = 0;
            rowHeight = 0;
        };

        for (const [key, img] of images) {
            const w = img.width;
            const h = img.height;
            
            if (w === 0 || h === 0) continue;

            if (w > ATLAS_WIDTH || h > ATLAS_HEIGHT_LIMIT) {
                console.warn(`TextureManager: Asset '${key}' (${w}x${h}) too large. Skipping.`);
                continue;
            }

            if (x + w > ATLAS_WIDTH) {
                x = 0;
                y += rowHeight;
                rowHeight = 0;
            }
            
            if (y + h > ATLAS_HEIGHT_LIMIT) {
                flushBatch();
            }
            
            currentBatch.push({ key, img, x, y, w, h });
            x += w;
            rowHeight = Math.max(rowHeight, h);
        }

        flushBatch();

        return { handles, rects: finalRects };
    }
}

export class WebGLContext {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null;
  private terrainProgram: WebGLProgram | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2', { alpha: false });
    if (!this.gl) {
      console.warn("WebGL 2 not supported, falling back to WebGL 1");
      this.gl = canvas.getContext('webgl', { alpha: false }) as WebGL2RenderingContext;
    }
    
    if (this.gl) {
        this.initShaders();
    }
  }

  private initShaders() {
      if (!this.gl) return;
      
      const vs = WebGLProgramManager.getTerrainVertexShader();
      const fs = WebGLProgramManager.getTerrainFragmentShader();
      
      this.terrainProgram = WebGLProgramManager.createProgram(this.gl, vs, fs);
      
      if (this.terrainProgram) {
          console.log("WebGL Terrain Program Initialized");
      }
  }

  public getTerrainProgram(): WebGLProgram | null {
      return this.terrainProgram;
  }

  public getNativeContext(): any {
    return this.gl;
  }

  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  public clear(color: string): void {
    if (!this.gl) return;
    
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;

    this.gl.clearColor(r, g, b, 1.0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
  }

  public resize(width: number, height: number): void {
    if (!this.gl) return;
    
    if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width;
        this.canvas.height = height;
    }
    this.gl.viewport(0, 0, width, height);
  }
}
