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