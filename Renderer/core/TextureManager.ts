

import { GPUTextureHandle, AtlasUVRect, MultiPackedAtlasResult } from './ITexture';
import { GPUResourceRegistry } from './GPUResourceRegistry';

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

        // 1. Integer Dimensions - Fix: Use Math.ceil to ensure texture covers the full requested float area
        const w = Math.max(1, Math.ceil(width));
        const h = Math.max(1, Math.ceil(height));

        // 2. Max Size Protection using cached value
        const maxSize = this.maxTextureSize;
        if (w > maxSize || h > maxSize) {
            console.error(`TextureManager: Render target size ${w}x${h} exceeds max texture size ${maxSize}`);
            return null;
        }

        const texture = gl.createTexture();
        if (!texture) return null;

        gl.bindTexture(gl.TEXTURE_2D, texture);

        // 3. WebGL2 Optimization vs WebGL1 Fallback
        const isWebGL2 = gl instanceof WebGL2RenderingContext;
        const isPowerOfTwo = (value: number) => (value & (value - 1)) === 0;
        const canHaveMipmaps = isWebGL2 || (isPowerOfTwo(w) && isPowerOfTwo(h));
        const mipLevels = canHaveMipmaps ? Math.floor(Math.log2(Math.max(w, h))) + 1 : 1;

        if (isWebGL2) {
            // texStorage2D is immutable and generally preferred in WebGL2
            gl.texStorage2D(gl.TEXTURE_2D, mipLevels, gl.RGBA8, w, h);
        } else {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        }

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        
        if (canHaveMipmaps) {
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
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
            let statusStr = "UNKNOWN_STATUS";
            switch (status) {
                case gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT: statusStr = "FRAMEBUFFER_INCOMPLETE_ATTACHMENT"; break;
                case gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT: statusStr = "FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT"; break;
                case gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS: statusStr = "FRAMEBUFFER_INCOMPLETE_DIMENSIONS"; break;
                case gl.FRAMEBUFFER_UNSUPPORTED: statusStr = "FRAMEBUFFER_UNSUPPORTED"; break;
            }
            console.error(`TextureManager: Framebuffer is incomplete: ${statusStr} (0x${status.toString(16)})`);
            
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
        
        // Determine Atlas Dimensions using cached max size
        const MAX_SIZE = this.maxTextureSize || 4096;
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

        // Helper to finalize the current batch into a texture
        const flushBatch = () => {
            if (currentBatch.length === 0) return;

            // Height is the bottom of the last row
            const totalHeight = Math.max(1, y + rowHeight);
            
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
            } else {
                console.error(`TextureManager: Failed to create texture for atlas ${currentAtlasId}`);
            }

            // Reset for next atlas
            currentBatch = [];
            currentAtlasId++;
            x = 0;
            y = 0;
            rowHeight = 0;
        };

        // Iterative Packing
        for (const [key, img] of images) {
            const w = img.width;
            const h = img.height;
            
            if (w === 0 || h === 0) {
                console.warn(`TextureManager: Skipping zero-size asset '${key}'`);
                continue;
            }

            if (w > ATLAS_WIDTH || h > ATLAS_HEIGHT_LIMIT) {
                console.warn(`TextureManager: Asset '${key}' (${w}x${h}) exceeds max texture dimensions (${ATLAS_WIDTH}x${ATLAS_HEIGHT_LIMIT}). Skipping.`);
                continue;
            }

            // Wrap to next row if full
            if (x + w > ATLAS_WIDTH) {
                x = 0;
                y += rowHeight;
                rowHeight = 0;
            }
            
            // Check if current texture is full (Vertical)
            if (y + h > ATLAS_HEIGHT_LIMIT) {
                flushBatch();
                // After flush, x, y, rowHeight are reset.
                // Logic continues to place this item at 0,0 of new atlas.
            }
            
            // Add to batch
            currentBatch.push({ key, img, x, y, w, h });
            
            x += w;
            rowHeight = Math.max(rowHeight, h);
        }

        // Final flush
        flushBatch();

        return { handles, rects: finalRects };
    }
}