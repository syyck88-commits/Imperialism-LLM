import { drawHexPath, ISO_FACTOR } from '../RenderUtils';

export const BLOCK_DEPTH = 12;

// --- BASE sprites in this project are 512x512, and their content is shifted upward.
// addBaseHex() draws them with y - spriteH*0.4, so we place the hex center at 0.4*H in the source image.
const BASE_IMG = 512;
const BASE_CENTER_Y = Math.round(BASE_IMG * 0.40);
const BASE_CENTER_X = BASE_IMG / 2;
// Scale depth visually to match 512 art convention (128->512 = x4)
const BASE_DEPTH = BLOCK_DEPTH * 4;

export function generateBaseFallback(): Map<string, HTMLImageElement> {
    const createBase = (color: string, shadowColor: string, label: string): HTMLImageElement => {
        const canvas = document.createElement('canvas');
        canvas.width = BASE_IMG;
        canvas.height = BASE_IMG;

        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.clearRect(0, 0, BASE_IMG, BASE_IMG);

            const cx = BASE_CENTER_X;
            const cy = BASE_CENTER_Y;
            const r = 240; // fits well inside 512

            // Precompute hex points (flat-ish) with ISO squash baked in
            const pts: { x: number; y: number }[] = [];
            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI / 180) * (60 * i + 30);
                pts.push({
                    x: cx + r * Math.cos(angle),
                    y: cy + (r * Math.sin(angle) * ISO_FACTOR)
                });
            }

            // Depth sides polygon (same shape logic as your original)
            ctx.fillStyle = shadowColor;
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            ctx.lineTo(pts[1].x, pts[1].y);
            ctx.lineTo(pts[2].x, pts[2].y);
            ctx.lineTo(pts[3].x, pts[3].y);
            ctx.lineTo(pts[3].x, pts[3].y + BASE_DEPTH);
            ctx.lineTo(pts[2].x, pts[2].y + BASE_DEPTH);
            ctx.lineTo(pts[1].x, pts[1].y + BASE_DEPTH);
            ctx.lineTo(pts[0].x, pts[0].y + BASE_DEPTH);
            ctx.closePath();
            ctx.fill();

            // Top face
            ctx.beginPath();
            drawHexPath(ctx, cx, cy, r, ISO_FACTOR);
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();

            // Edge
            ctx.strokeStyle = 'rgba(255,255,255,0.08)';
            ctx.lineWidth = 4;
            ctx.stroke();

            // Debug letter (big, readable)
            ctx.fillStyle = 'rgba(0,0,0,0.30)';
            ctx.font = 'bold 140px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, cx, cy);
        }

        const img = new Image();
        img.src = canvas.toDataURL();
        return img;
    };

    const map = new Map<string, HTMLImageElement>();
    map.set('base_land', createBase('#c9a67f', '#a68560', 'L'));
    map.set('base_water', createBase('#3b82f6', '#1e3a8a', 'W'));
    map.set('base_desert', createBase('#E6C88C', '#C69C6D', 'D'));
    return map;
}

export function generateForestFallback(): HTMLImageElement[] {
    const sizes = [32, 48, 64, 80];
    const colors = ['#86efac', '#4ade80', '#22c55e', '#15803d'];

    return sizes.map((size, i) => {
        const w = size;
        const h = Math.floor(size * 1.5);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;

        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = colors[i];
            ctx.beginPath();
            ctx.arc(w / 2, h * 0.45, w * 0.35, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#3f2c22';
            ctx.fillRect(w * 0.42, h * 0.62, w * 0.16, h * 0.30);

            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.font = `bold ${Math.max(10, Math.floor(w * 0.35))}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('T', w / 2, h * 0.45);
        }

        const img = new Image();
        img.src = canvas.toDataURL();
        return img;
    });
}

// --- EROSION SIMULATION CLASSES ---

export function generateDunePattern(): CanvasPattern | null {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#C69C6D';
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.moveTo(0, 18);
    ctx.lineTo(size, 30);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, 42);
    ctx.lineTo(size, 54);
    ctx.stroke();

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

    const drawBlock = (ctx2: CanvasRenderingContext2D, cx: number, cy: number, size: number, fillFn: () => void, depthColor: string) => {
        const pts: { x: number; y: number }[] = [];
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 180) * (60 * i + 30);
            pts.push({
                x: cx + size * Math.cos(angle),
                y: cy + (size * Math.sin(angle) * ISO_FACTOR)
            });
        }

        ctx2.fillStyle = depthColor;
        ctx2.beginPath();
        ctx2.moveTo(pts[0].x, pts[0].y);
        ctx2.lineTo(pts[1].x, pts[1].y);
        ctx2.lineTo(pts[2].x, pts[2].y);
        ctx2.lineTo(pts[3].x, pts[3].y);
        ctx2.lineTo(pts[3].x, pts[3].y + BLOCK_DEPTH);
        ctx2.lineTo(pts[2].x, pts[2].y + BLOCK_DEPTH);
        ctx2.lineTo(pts[1].x, pts[1].y + BLOCK_DEPTH);
        ctx2.lineTo(pts[0].x, pts[0].y + BLOCK_DEPTH);
        ctx2.closePath();
        ctx2.fill();

        ctx2.beginPath();
        drawHexPath(ctx2, cx, cy, size, ISO_FACTOR);
        ctx2.closePath();
        fillFn();
    };

    const drawTile = (col: number, row: number, color: string, depthColor: string) => {
        ctx.save();
        ctx.translate(col * tileW, row * tileH);

        const cx = tileW / 2;
        const cy = (tileH - BLOCK_DEPTH) / 2;
        const r = hexBaseSize - 1;

        ctx.clearRect(0, 0, tileW, tileH);

        drawBlock(ctx, cx, cy, r, () => {
            ctx.fillStyle = color;
            ctx.fill();
        }, depthColor);

        drawHexPath(ctx, cx, cy, r, ISO_FACTOR);
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.restore();
    };

    drawTile(0, 0, '#3b82f6', '#1e3a8a');
    drawTile(1, 0, '#65a30d', '#365314');
    drawTile(2, 0, '#166534', '#14532d');
    drawTile(0, 1, '#84cc16', '#4d7c0f');
    drawTile(1, 1, '#57534e', '#292524');
    drawTile(2, 1, '#E6C88C', '#C69C6D');
}
