import { WebGLProgramManager } from './WebGLProgramManager';

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
    
    // Parse Hex color string (e.g. #0f172a) to float r,g,b
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
