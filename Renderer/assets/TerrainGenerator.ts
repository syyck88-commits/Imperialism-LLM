
import { noise } from '../../utils/SimplexNoise';
import { ISO_FACTOR } from '../RenderUtils';

export interface BiomeConfig {
    type: 'DESERT' | 'MOUNTAIN' | 'HILLS';
    NOISE_TYPE: 'RIDGED' | 'BILLOWY' | 'STANDARD';
    RESOLUTION: number;
    HEIGHT: number;
    SCALE: number;
    SHARPNESS: number;
    WARP_STRENGTH: number;
    // Colors
    COL_TOP: [number, number, number]; 
    COL_MID: [number, number, number]; 
    COL_BOT: [number, number, number]; 
    COLOR_BIAS: number;
    BASE_EROSION: number;
    OCTAVES: number; 
    SNOW_LEVEL: number; // 0..1
}

// Presets (Updated to User Defaults)
export const DESERT_CONFIG: BiomeConfig = {
    type: 'DESERT',
    NOISE_TYPE: 'RIDGED',
    RESOLUTION: 1,
    HEIGHT: 43,
    SCALE: 4,
    SHARPNESS: 0.6,
    WARP_STRENGTH: 20,
    COL_TOP: [235, 215, 180],
    COL_MID: [195, 160, 110],
    COL_BOT: [149, 123, 101],
    COLOR_BIAS: 0.5,
    BASE_EROSION: 34,
    OCTAVES: 1,
    SNOW_LEVEL: 1.1
};

export const MOUNTAIN_CONFIG: BiomeConfig = {
    type: 'MOUNTAIN',
    NOISE_TYPE: 'RIDGED',
    RESOLUTION: 1,
    HEIGHT: 150,
    SCALE: 2,
    SHARPNESS: 0.6,
    WARP_STRENGTH: 5,
    COL_TOP: [250, 250, 255],
    COL_MID: [50, 49, 47],
    COL_BOT: [108, 92, 71],
    COLOR_BIAS: 0.6,
    BASE_EROSION: 60,
    OCTAVES: 4,
    SNOW_LEVEL: 0.85
};

export const HILLS_CONFIG: BiomeConfig = {
    type: 'HILLS',
    NOISE_TYPE: 'BILLOWY',
    RESOLUTION: 1,
    HEIGHT: 92,
    SCALE: 3,
    SHARPNESS: 0.1,
    WARP_STRENGTH: 10,
    COL_TOP: [83, 115, 63],
    COL_MID: [42, 67, 30],
    COL_BOT: [153, 129, 108],
    COLOR_BIAS: 0.1,
    BASE_EROSION: 29,
    OCTAVES: 2,
    SNOW_LEVEL: 1.1
};

interface BoundaryData {
    activeCenters: {x: number, y: number}[];
    inactiveCenters: {x: number, y: number}[];
}

function blurMap(source: Float32Array, w: number, h: number, r: number) {
    if (r < 1) return;
    const target = new Float32Array(source.length);
    
    // Horizontal
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let sum = 0;
            let count = 0;
            for (let k = -r; k <= r; k++) {
                const px = x + k;
                if (px >= 0 && px < w) {
                    sum += source[y * w + px];
                    count++;
                }
            }
            target[y * w + x] = sum / count;
        }
    }
    
    // Vertical (write back to source)
    for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++) {
            let sum = 0;
            let count = 0;
            for (let k = -r; k <= r; k++) {
                const py = y + k;
                if (py >= 0 && py < h) {
                    sum += target[py * w + x];
                    count++;
                }
            }
            source[y * w + x] = sum / count;
        }
    }
}

export class TerrainGenerator {

    public static getPadding(hexSize: number, scale: number): number {
        return (80 + hexSize * 2.5) * scale;
    }

    private static hexRound(q: number, r: number) {
        let x = q; let z = r; let y = -x-z;
        let rx = Math.round(x); let rz = Math.round(z); let ry = Math.round(y);
        const x_diff = Math.abs(rx - x);
        const y_diff = Math.abs(ry - y);
        const z_diff = Math.abs(rz - z);
        if (x_diff > y_diff && x_diff > z_diff) rx = -ry-rz;
        else if (y_diff > z_diff) ry = -rx-rz;
        else rz = -rx-ry;
        return { q: rx, r: rz };
    }

    private static pixelToAxial(x: number, y: number, hexSize: number) {
        const size = hexSize;
        const q = (Math.sqrt(3)/3 * x - 1/3 * y) / size;
        const r = (2/3 * y) / size;
        return this.hexRound(q, r);
    }

    private static axialToPixel(q: number, r: number, hexSize: number) {
        const x = hexSize * Math.sqrt(3) * (q + r/2);
        const y = (hexSize * Math.sqrt(3) / Math.sqrt(3)) * 1.5 * r;
        return { x, y };
    }

    private static getBoundarySets(customTiles: Set<string>, hexSize: number, offsetQ: number, offsetR: number): BoundaryData {
        const activeBoundary: {x: number, y: number}[] = [];
        const inactiveBoundary: {x: number, y: number}[] = [];
        const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
        const checked = new Set<string>();

        customTiles.forEach(key => {
            const [globalQ, globalR] = key.split(',').map(Number);
            const q = globalQ - offsetQ; 
            const r = globalR - offsetR;
            let isActiveEdge = false;
            
            neighbors.forEach(([dq, dr]) => {
                const nq = globalQ + dq; const nr = globalR + dr;
                const nKey = `${nq},${nr}`;
                if (!customTiles.has(nKey)) {
                    isActiveEdge = true;
                    if (!checked.has(nKey)) {
                        checked.add(nKey);
                        inactiveBoundary.push(this.axialToPixel(nq - offsetQ, nr - offsetR, hexSize));
                    }
                }
            });
            if (isActiveEdge) activeBoundary.push(this.axialToPixel(q, r, hexSize));
        });
        return { activeCenters: activeBoundary, inactiveCenters: inactiveBoundary };
    }

    private static getSDF(x: number, y: number, isInside: boolean, boundaryData: BoundaryData, hexSize: number): number {
        if (!boundaryData.activeCenters.length || !boundaryData.inactiveCenters.length) return -100;
        let minD = Infinity;
        const offset = (hexSize * Math.sqrt(3)) * 0.55; 
        
        const list = isInside ? boundaryData.inactiveCenters : boundaryData.activeCenters;
        for (const p of list) {
            const d = (x - p.x)**2 + (y - p.y)**2;
            if (d < minD) minD = d;
        }
        return isInside ? Math.sqrt(minD) - offset : offset - Math.sqrt(minD);
    }

    // --- GENERATION ---

    public static generatePreview(canvas: HTMLCanvasElement, config: BiomeConfig) {
        const mockTiles = new Set<string>(['0,0', '1,0', '-1,0', '0,1', '0,-1', '1,-1', '-1,1']);
        const bounds = { minX: -100, maxX: 100, minY: -100, maxY: 100, minQ: -1, minR: -1 }; 
        const hexSize = 32;

        const result = this.generateSprite(mockTiles, bounds, hexSize, config, true);
        if (result) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(result, 0, 0);
            }
        }
    }

    public static generateSprite(
        targetTiles: Set<string>,
        bounds: { minX: number, maxX: number, minY: number, maxY: number, minQ: number, minR: number },
        hexSize: number,
        config: BiomeConfig,
        isPreview: boolean = false
    ): HTMLCanvasElement | null {
        
        const scale = config.RESOLUTION;
        const PADDING = this.getPadding(hexSize, scale);
        
        let width, height, globalOriginX, globalOriginY;

        if (isPreview) {
            width = 300;
            height = 300;
            globalOriginX = -150;
            globalOriginY = -150 + config.HEIGHT;
        } else {
            width = Math.ceil(bounds.maxX - bounds.minX + PADDING * 2);
            height = Math.ceil(bounds.maxY - bounds.minY + PADDING * 2);
            globalOriginX = bounds.minX - PADDING;
            globalOriginY = bounds.minY - PADDING;
        }

        const renderHeight = height + config.HEIGHT + 20;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = renderHeight;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        const imgData = ctx.createImageData(width, renderHeight); 
        const data = imgData.data;

        const refQ = isPreview ? 0 : bounds.minQ;
        const refR = isPreview ? 0 : bounds.minR;

        const boundaryData = this.getBoundarySets(targetTiles, hexSize, refQ, refR);
        const offsetPixel = this.axialToPixel(refQ, refR, hexSize);
        
        const heightMap = new Float32Array(width * height);
        const rawMap = new Float32Array(width * height);
        const maskMap = new Float32Array(width * height);

        let maxHRaw = 0.001;
        noise.seed(Date.now() + Math.random()*1000);

        // --- PASS 1: CALCULATION ---
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                const drawX = globalOriginX + x;
                const drawY = globalOriginY + y;
                const unsquashedY = drawY / ISO_FACTOR;

                const sdfX = drawX - offsetPixel.x;
                const sdfY = unsquashedY - offsetPixel.y;
                
                const localAxial = this.pixelToAxial(drawX, unsquashedY, hexSize);
                const tileKey = `${localAxial.q},${localAxial.r}`;
                const isInside = targetTiles.has(tileKey);
                
                let sdf = this.getSDF(sdfX, sdfY, isInside, boundaryData, hexSize);

                sdf += noise.noise2D(drawX * 0.025, unsquashedY * 0.025) * 15.0;
                
                const effectiveFadeRef = 4 * (hexSize * Math.sqrt(3));
                const fadeDist = Math.max(10.0, effectiveFadeRef * (config.BASE_EROSION / 100));
                
                const edgeFactor = Math.min(1.0, Math.max(0.0, sdf / fadeDist + 0.5));

                if (edgeFactor <= 0.01) continue;
                maskMap[idx] = edgeFactor;

                // Noise Gen
                let amp = 1.0;
                let freq = config.SCALE * 0.001;
                let nTotal = 0;
                let maxAmp = 0;

                const warp = config.WARP_STRENGTH;
                const qx = noise.noise2D(drawX * freq * 0.5, unsquashedY * freq * 0.5) * warp;
                const qy = noise.noise2D(unsquashedY * freq * 0.5 + 5.2, drawX * freq * 0.5 + 1.3) * warp;
                const px = drawX + qx;
                const py = unsquashedY + qy;

                for (let i = 0; i < config.OCTAVES; i++) {
                    let n = noise.noise2D(px * freq, py * freq);
                    
                    if (config.NOISE_TYPE === 'RIDGED') {
                        n = 1.0 - Math.abs(n); 
                    } else if (config.NOISE_TYPE === 'BILLOWY') {
                        n = Math.abs(n);
                    } else {
                        n = (n + 1) * 0.5;
                    }

                    n = Math.pow(n, config.SHARPNESS);
                    
                    nTotal += n * amp;
                    maxAmp += amp;
                    amp *= 0.5;
                    freq *= 2.0;
                }

                const hRaw = (nTotal / maxAmp) * config.HEIGHT;
                if (hRaw > maxHRaw) maxHRaw = hRaw;

                // Taper logic to remove cliff artifacts
                // Height tapers to 0 when edgeFactor is below 0.2 (20% of fade distance)
                // This ensures there is a flat rim around the biome
                const taper = Math.max(0, (edgeFactor - 0.2) / 0.8);
                
                heightMap[idx] = hRaw * taper;
                rawMap[idx] = hRaw; 
            }
        }

        // Box Blur on Mask
        blurMap(maskMap, width, height, Math.ceil(2 * scale));

        // --- PASS 2: RENDER ---
        const [rT, gT, bT] = config.COL_TOP;
        const [rM, gM, bM] = config.COL_MID;
        const [rB, gB, bB] = config.COL_BOT;
        const bias = config.COLOR_BIAS;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                const mask = maskMap[idx];
                
                if (mask <= 0.01) continue;

                const hVal = heightMap[idx];
                const rawVal = rawMap[idx]; 
                
                // If height is negligible, skip drawing to avoid 1px specks on flat ground
                if (hVal < 1.0) continue;

                let r, g, b;
                const normHeight = hVal / config.HEIGHT; 

                if (normHeight > config.SNOW_LEVEL) {
                    r = 255; g = 255; b = 255;
                } else {
                    let t = rawVal / maxHRaw; 
                    t = Math.min(1, Math.max(0, t));
                    
                    if (t < bias) {
                        const lt = t / bias;
                        r = rB*(1-lt) + rM*lt; g = gB*(1-lt) + gM*lt; b = bB*(1-lt) + bM*lt;
                    } else {
                        const lt = (t - bias) / (1 - bias);
                        r = rM*(1-lt) + rT*lt; g = gM*(1-lt) + gT*lt; b = bM*(1-lt) + bT*lt;
                    }
                }

                const rFin = Math.floor(rB*(1-mask) + r*mask);
                const gFin = Math.floor(gB*(1-mask) + g*mask);
                const bFin = Math.floor(bB*(1-mask) + b*mask);

                // Fix Cliff: stackH is exactly the height, no +2 base buffer
                const stackH = Math.ceil(hVal);
                const baseDrawY = y + config.HEIGHT;

                for (let k = 0; k < stackH; k++) {
                    const drawY = baseDrawY - k;
                    if (drawY < 0 || drawY >= renderHeight) continue;
                    
                    const pIdx = (drawY * width + x) * 4;

                    let ao = (k / stackH) * 25;
                    if (normHeight > config.SNOW_LEVEL) ao *= 0.5;

                    let rPix = rFin;
                    let gPix = gFin;
                    let bPix = bFin;

                    // --- SAND GRAINS EFFECT ---
                    // Reduced intensity for smoother look
                    if (config.type === 'DESERT' && k >= stackH - 2) {
                        const grainSeed = (x * 43.23 + (drawY) * 12.45);
                        const noiseVal = Math.abs((Math.sin(grainSeed) * 78923.456) % 1);

                        if (noiseVal > 0.95) { 
                            // Rare Sparkle
                            rPix = Math.min(255, rPix + 40);
                            gPix = Math.min(255, gPix + 40);
                            bPix = Math.min(255, bPix + 40);
                        } else if (noiseVal > 0.90) {
                            // Minor Glint
                            rPix = Math.min(255, rPix + 20);
                            gPix = Math.min(255, gPix + 20);
                            bPix = Math.min(255, bPix + 20);
                        } else if (noiseVal < 0.1) {
                            // Grain Shadow
                            const depth = 15; 
                            rPix = Math.max(0, rPix - depth);
                            gPix = Math.max(0, gPix - depth);
                            bPix = Math.max(0, bPix - depth);
                        }
                    }

                    data[pIdx] = Math.max(0, rPix - ao);
                    data[pIdx+1] = Math.max(0, gPix - ao);
                    data[pIdx+2] = Math.max(0, bPix - ao);
                    data[pIdx+3] = 255;
                }
            }
        }

        ctx.putImageData(imgData, 0, 0);
        return canvas;
    }
}
