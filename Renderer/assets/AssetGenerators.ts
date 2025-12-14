
import { drawHexPath, ISO_FACTOR } from '../RenderUtils';

export const BLOCK_DEPTH = 12;

export function generateBaseFallback(): Map<string, HTMLImageElement> {
    const hexBaseSize = 64; 
    const tileW = Math.ceil(Math.sqrt(3) * hexBaseSize); 
    const tileH = Math.ceil((hexBaseSize * 2 * ISO_FACTOR) + BLOCK_DEPTH + 4); 

    const createBase = (color: string, shadowColor: string): HTMLImageElement => {
        const canvas = document.createElement('canvas');
        canvas.width = tileW;
        canvas.height = tileH;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            const cx = tileW / 2;
            const cy = (tileH - BLOCK_DEPTH) / 2;
            const r = hexBaseSize - 1;

            // Draw depth sides
            ctx.fillStyle = shadowColor;
            ctx.beginPath();
            const pts = [];
            for(let i=0; i<6; i++) {
                    const angle = (Math.PI / 180) * (60 * i + 30);
                    pts.push({
                        x: cx + r * Math.cos(angle),
                        y: cy + (r * Math.sin(angle) * ISO_FACTOR)
                    });
            }
            ctx.moveTo(pts[0].x, pts[0].y);
            ctx.lineTo(pts[1].x, pts[1].y);
            ctx.lineTo(pts[2].x, pts[2].y);
            ctx.lineTo(pts[3].x, pts[3].y);
            ctx.lineTo(pts[3].x, pts[3].y + BLOCK_DEPTH);
            ctx.lineTo(pts[2].x, pts[2].y + BLOCK_DEPTH);
            ctx.lineTo(pts[1].x, pts[1].y + BLOCK_DEPTH);
            ctx.lineTo(pts[0].x, pts[0].y + BLOCK_DEPTH);
            ctx.closePath();
            ctx.fill();

            // Draw Top Face
            ctx.beginPath();
            drawHexPath(ctx, cx, cy, r, ISO_FACTOR);
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();

            // Slight edge highlight
            ctx.strokeStyle = 'rgba(255,255,255,0.05)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
        const img = new Image();
        img.src = canvas.toDataURL();
        return img;
    };

    const map = new Map<string, HTMLImageElement>();
    map.set('base_land', createBase('#c9a67f', '#a68560')); 
    map.set('base_water', createBase('#3b82f6', '#1e3a8a'));
    
    // Updated Desert Base to Light Sand (#E6C88C) to blend seamlessly with lit voxels
    // Shadow is #C69C6D (Darker sand)
    map.set('base_desert', createBase('#E6C88C', '#C69C6D')); 
    
    return map;
}

export function generateForestFallback(): HTMLImageElement[] {
    const sizes = [32, 48, 64, 80];
    const colors = ['#86efac', '#4ade80', '#22c55e', '#15803d'];

    return sizes.map((size, i) => {
        const w = size;
        const h = size * 1.5;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            // Draw tree shape
            ctx.fillStyle = colors[i];
            ctx.beginPath();
            ctx.moveTo(w/2, 0); // Tip
            ctx.lineTo(w, h * 0.8); // Right bottom
            ctx.lineTo(w/2, h * 0.7); // Bottom center
            ctx.lineTo(0, h * 0.8); // Left bottom
            ctx.closePath();
            ctx.fill();

            // Trunk
            ctx.fillStyle = '#3f2c22';
            ctx.fillRect(w*0.4, h*0.7, w*0.2, h*0.3);
        }
        const img = new Image();
        img.src = canvas.toDataURL();
        return img;
    });
}

// --- EROSION SIMULATION CLASSES ---

export function generateDunePattern(): CanvasPattern | null {
  // Placeholder returning simple noise if called, to prevent crash, 
  // but Main Loop uses Voxel Engine now via TerrainErosion.ts.
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#C69C6D';
  ctx.fillRect(0,0,size,size);
  return ctx.createPattern(canvas, 'repeat');
}

export function generateInterfaceSprites(
    canvas: HTMLCanvasElement, 
    uiMap: any, 
    uiTileW: number, 
    uiTileH: number, 
    uiBaseSize: number
) {
    const cols = 4;
    const rows = 1;
    
    canvas.width = uiTileW * cols;
    canvas.height = uiTileH * rows;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cx = uiTileW / 2;
    const cy = uiTileH / 2;
    const r = uiBaseSize - 2;

    // 1. Cursor (White Outline)
    ctx.save();
    ctx.translate(uiMap.cursor.x * uiTileW, 0);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 4;
    drawHexPath(ctx, cx, cy, r, ISO_FACTOR);
    ctx.stroke();
    ctx.restore();

    // 2. Highlight (White Fill - Hover)
    ctx.save();
    ctx.translate(uiMap.highlight.x * uiTileW, 0);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    drawHexPath(ctx, cx, cy, r, ISO_FACTOR);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 3. Move (Green Fill - Valid Move)
    ctx.save();
    ctx.translate(uiMap.move.x * uiTileW, 0);
    ctx.fillStyle = 'rgba(74, 222, 128, 0.3)';
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2;
    drawHexPath(ctx, cx, cy, r, ISO_FACTOR);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    
    // 4. Path Dot
    ctx.save();
    ctx.translate(uiMap.path.x * uiTileW, 0);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 8, 8 * ISO_FACTOR, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

export function generateFallbackAtlas(
    canvas: HTMLCanvasElement, 
    cols: number, 
    rows: number
) {
    const hexBaseSize = 64; 
    const tileW = Math.ceil(Math.sqrt(3) * hexBaseSize); 
    const tileH = Math.ceil((hexBaseSize * 2 * ISO_FACTOR) + BLOCK_DEPTH + 4); 
    
    canvas.width = tileW * cols;
    canvas.height = tileH * rows;
    
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // Helper to draw the 3D block side
    const drawBlock = (ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, fillFn: () => void, depthColor: string) => {
        const topY = cy;
        
        ctx.fillStyle = depthColor;
        ctx.beginPath();
        
        const pts = [];
        for(let i=0; i<6; i++) {
                const angle = (Math.PI / 180) * (60 * i + 30);
                pts.push({
                    x: cx + size * Math.cos(angle),
                    y: topY + (size * Math.sin(angle) * ISO_FACTOR)
                });
        }

        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(pts[1].x, pts[1].y);
        ctx.lineTo(pts[2].x, pts[2].y);
        ctx.lineTo(pts[3].x, pts[3].y);
        ctx.lineTo(pts[3].x, pts[3].y + BLOCK_DEPTH);
        ctx.lineTo(pts[2].x, pts[2].y + BLOCK_DEPTH);
        ctx.lineTo(pts[1].x, pts[1].y + BLOCK_DEPTH);
        ctx.lineTo(pts[0].x, pts[0].y + BLOCK_DEPTH);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        drawHexPath(ctx, cx, cy, size, ISO_FACTOR);
        ctx.closePath();
        fillFn(); 
    };

    const drawTile = (col: number, row: number, color: string, depthColor: string, detailFn?: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) => {
        ctx.save();
        ctx.translate(col * tileW, row * tileH);
        
        const cx = tileW / 2;
        const cy = (tileH - BLOCK_DEPTH) / 2;
        const r = hexBaseSize - 1;

        drawBlock(ctx, cx, cy, r, () => {
                ctx.fillStyle = color;
                ctx.fill();
                if (detailFn) {
                    ctx.save();
                    ctx.clip(); 
                    detailFn(ctx, tileW, tileH);
                    ctx.restore();
                }
        }, depthColor);

        drawHexPath(ctx, cx, cy, r, ISO_FACTOR);
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.restore();
    };

    drawTile(0, 0, '#3b82f6', '#1e3a8a', (c, w, h) => {
        c.fillStyle = 'rgba(255,255,255,0.1)';
        for(let i=0; i<5; i++) {
            const x = Math.random() * w;
            const y = Math.random() * h;
            c.beginPath();
            c.arc(x, y, 5, 0, Math.PI*2);
            c.fill();
        }
    });

    drawTile(1, 0, '#65a30d', '#365314');

    drawTile(2, 0, '#166534', '#14532d', (c, w, h) => {
            c.fillStyle = '#052e16';
            for(let i=0; i<6; i++) {
                const x = Math.random() * w*0.6 + w*0.2;
                const y = Math.random() * h*0.4 + h*0.1;
                c.beginPath();
                c.moveTo(x, y);
                c.lineTo(x+6, y+18);
                c.lineTo(x-6, y+18);
                c.fill();
            }
    });

    drawTile(0, 1, '#84cc16', '#4d7c0f', (c, w, h) => {
        c.fillStyle = 'rgba(0,0,0,0.1)';
        c.beginPath();
        c.arc(w/2, h/2, 15, 0, Math.PI*2);
        c.fill();
    });

    drawTile(1, 1, '#57534e', '#292524', (c, w, h) => {
            c.fillStyle = '#e7e5e4';
            c.beginPath();
            c.moveTo(w/2, 10);
            c.lineTo(w/2 + 10, 25);
            c.lineTo(w/2 - 10, 25);
            c.fill();
    });

    // Updated Desert Atlas Tile
    drawTile(2, 1, '#E6C88C', '#C69C6D');
}
