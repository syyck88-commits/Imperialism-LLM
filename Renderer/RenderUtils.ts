
import { Hex } from '../Grid/HexMath';

export interface Camera {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
}

export const ISO_FACTOR = Math.sqrt(3) / 4; 

/**
 * Converts Axial Coordinates (q, r) to Screen Pixels (x, y) with Isometric Projection.
 */
export const hexToScreen = (q: number, r: number, camera: Camera, hexSize: number) => {
    const worldX = hexSize * Math.sqrt(3) * (q + r/2);
    // Squash Y axis for isometric look
    const worldY = (hexSize * 1.5 * r) * ISO_FACTOR;

    const screenX = worldX * camera.zoom - camera.x * camera.zoom;
    const screenY = worldY * camera.zoom - camera.y * camera.zoom;

    return { x: screenX, y: screenY };
};

// Cache for Path2D objects based on hex size
const pathCache = new Map<number, Path2D>();

/**
 * Returns a cached Path2D for a hexagon of the given size.
 */
export const getHexPath2D = (size: number, scaleY: number = 1.0): Path2D => {
    // We key by size. If scaleY varies wildly, we might need a composite key,
    // but typically scaleY is constant (ISO_FACTOR) or 1.0. 
    // For this engine, we assume scaleY is usually ISO_FACTOR for map tiles.
    // If you use different scales, append scale to key.
    const key = (size * 1000) + scaleY; 
    
    if (!pathCache.has(key)) {
        const path = new Path2D();
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 180) * (60 * i + 30);
            const px = size * Math.cos(angle);
            const py = size * Math.sin(angle) * scaleY;
            if (i === 0) path.moveTo(px, py);
            else path.lineTo(px, py);
        }
        path.closePath();
        pathCache.set(key, path);
    }
    return pathCache.get(key)!;
};

export const drawHexPath = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, scaleY: number = 1.0) => {
    // For immediate mode drawing without Path2D (legacy support or dynamic shapes)
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 180) * (60 * i + 30);
        const px = x + size * Math.cos(angle);
        const py = y + (size * Math.sin(angle) * scaleY);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.closePath();
};
