import { UVRect } from '../core/ITexture';

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