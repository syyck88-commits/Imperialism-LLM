
export const terrainWorkerScript = `
/* Worker Global Scope */
const ISO_FACTOR = Math.sqrt(3) / 4;
const BLOCK_DEPTH = 12;

/* --- Simplex Noise Implementation (Embedded) --- */
const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;

class SimplexNoise {
    constructor(seedVal) {
        this.perm = new Uint8Array(512);
        this.grad3 = new Float32Array([
            1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
            1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
            0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1
        ]);
        this.seed(seedVal || Date.now());
    }

    seed(s) {
        for (let i = 0; i < 256; i++) this.perm[i] = i;
        for (let i = 0; i < 256; i++) {
            const r = (s = (s * 1664525 + 1013904223) & 0xFFFFFFFF) & 0xFF;
            const t = this.perm[i];
            this.perm[i] = this.perm[r];
            this.perm[r] = t;
        }
        for (let i = 0; i < 256; i++) this.perm[i + 256] = this.perm[i];
    }

    noise2D(xin, yin) {
        let n0, n1, n2;
        const s = (xin + yin) * F2;
        const i = Math.floor(xin + s);
        const j = Math.floor(yin + s);
        const t = (i + j) * G2;
        const X0 = i - t;
        const Y0 = j - t;
        const x0 = xin - X0;
        const y0 = yin - Y0;
        let i1, j1;
        if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
        const x1 = x0 - i1 + G2;
        const y1 = y0 - j1 + G2;
        const x2 = x0 - 1.0 + 2.0 * G2;
        const y2 = y0 - 1.0 + 2.0 * G2;
        const ii = i & 255;
        const jj = j & 255;
        const gi0 = this.perm[ii + this.perm[jj]] % 12;
        const gi1 = this.perm[ii + i1 + this.perm[jj + j1]] % 12;
        const gi2 = this.perm[ii + 1 + this.perm[jj + 1]] % 12;
        let t0 = 0.5 - x0 * x0 - y0 * y0;
        if (t0 < 0) n0 = 0.0;
        else { t0 *= t0; n0 = t0 * t0 * (this.grad3[gi0 * 3] * x0 + this.grad3[gi0 * 3 + 1] * y0); }
        let t1 = 0.5 - x1 * x1 - y1 * y1;
        if (t1 < 0) n1 = 0.0;
        else { t1 *= t1; n1 = t1 * t1 * (this.grad3[gi1 * 3] * x1 + this.grad3[gi1 * 3 + 1] * y1); }
        let t2 = 0.5 - x2 * x2 - y2 * y2;
        if (t2 < 0) n2 = 0.0;
        else { t2 *= t2; n2 = t2 * t2 * (this.grad3[gi2 * 3] * x2 + this.grad3[gi2 * 3 + 1] * y2); }
        return 70.0 * (n0 + n1 + n2);
    }
}

/* --- Math Helpers --- */
function hexRound(q, r) {
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

function pixelToAxial(x, y, hexSize) {
    const q = (Math.sqrt(3)/3 * x - 1/3 * y) / hexSize;
    const r = (2/3 * y) / hexSize;
    return hexRound(q, r);
}

function axialToPixel(q, r, hexSize) {
    const x = hexSize * Math.sqrt(3) * (q + r/2);
    const y = (hexSize * Math.sqrt(3) / Math.sqrt(3)) * 1.5 * r;
    return { x, y };
}

function blurMap(source, w, h, r) {
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
    // Vertical
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

function getBoundarySets(customTiles, hexSize, offsetQ, offsetR) {
    const activeBoundary = [];
    const inactiveBoundary = [];
    const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
    const checked = new Set();

    customTiles.forEach(key => {
        const [globalQ, globalR] = key.split(',').map(Number);
        const q = globalQ - offsetQ; 
        const r = globalR - offsetR;
        let isActiveEdge = false;
        
        neighbors.forEach(([dq, dr]) => {
            const nq = globalQ + dq; const nr = globalR + dr;
            const nKey = nq + ',' + nr;
            if (!customTiles.has(nKey)) {
                isActiveEdge = true;
                if (!checked.has(nKey)) {
                    checked.add(nKey);
                    inactiveBoundary.push(axialToPixel(nq - offsetQ, nr - offsetR, hexSize));
                }
            }
        });
        if (isActiveEdge) activeBoundary.push(axialToPixel(q, r, hexSize));
    });
    return { activeCenters: activeBoundary, inactiveCenters: inactiveBoundary };
}

function getSDF(x, y, isInside, boundaryData, hexSize) {
    if (!boundaryData.activeCenters.length || !boundaryData.inactiveCenters.length) return -100;
    let minD = Infinity;
    const offset = (hexSize * Math.sqrt(3)) * 0.55; 
    
    const list = isInside ? boundaryData.inactiveCenters : boundaryData.activeCenters;
    const len = list.length;
    for (let i=0; i<len; i++) {
        const p = list[i];
        const d = (x - p.x)**2 + (y - p.y)**2;
        if (d < minD) minD = d;
    }
    return isInside ? Math.sqrt(minD) - offset : offset - Math.sqrt(minD);
}

/* --- Logic --- */

self.onmessage = function(e) {
    if (e.data.type === 'START') {
        const { clusterTiles, bounds, hexSize, config, seed, padding } = e.data;
        const startTime = performance.now();
        
        // Setup Dimensions
        const width = Math.ceil(bounds.maxX - bounds.minX + padding * 2);
        const height = Math.ceil(bounds.maxY - bounds.minY + padding * 2);
        const renderHeight = height + config.HEIGHT + 20;
        
        const globalOriginX = bounds.minX - padding;
        const globalOriginY = bounds.minY - padding;

        const tileSet = new Set(clusterTiles);
        const noiseGen = new SimplexNoise(seed);

        // Prep Buffers
        const buffer = new Uint8ClampedArray(width * renderHeight * 4);
        const heightMap = new Float32Array(width * height);
        const rawMap = new Float32Array(width * height);
        const maskMap = new Float32Array(width * height);

        // Boundaries
        const offsetPixel = axialToPixel(bounds.minQ, bounds.minR, hexSize);
        const boundaryData = getBoundarySets(tileSet, hexSize, bounds.minQ, bounds.minR);

        let maxHRaw = 0.001;

        // --- PASS 1: Calc ---
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                const drawX = globalOriginX + x;
                const drawY = globalOriginY + y;
                const unsquashedY = drawY / ISO_FACTOR;

                const sdfX = drawX - offsetPixel.x;
                const sdfY = unsquashedY - offsetPixel.y;
                
                const localAxial = pixelToAxial(drawX, unsquashedY, hexSize);
                const tileKey = localAxial.q + ',' + localAxial.r;
                const isInside = tileSet.has(tileKey);
                
                let sdf = getSDF(sdfX, sdfY, isInside, boundaryData, hexSize);
                sdf += noiseGen.noise2D(drawX * 0.025, unsquashedY * 0.025) * 15.0;
                
                const effectiveFadeRef = 4 * (hexSize * Math.sqrt(3));
                const fadeDist = Math.max(10.0, effectiveFadeRef * (config.BASE_EROSION / 100));
                
                const edgeFactor = Math.min(1.0, Math.max(0.0, sdf / fadeDist + 0.5));

                if (edgeFactor <= 0.01) continue;
                maskMap[idx] = edgeFactor;

                // Noise
                let amp = 1.0;
                let freq = config.SCALE * 0.001;
                let nTotal = 0;
                let maxAmp = 0;
                const warp = config.WARP_STRENGTH;
                
                const qx = noiseGen.noise2D(drawX * freq * 0.5, unsquashedY * freq * 0.5) * warp;
                const qy = noiseGen.noise2D(unsquashedY * freq * 0.5 + 5.2, drawX * freq * 0.5 + 1.3) * warp;
                const px = drawX + qx;
                const py = unsquashedY + qy;

                for (let i = 0; i < config.OCTAVES; i++) {
                    let n = noiseGen.noise2D(px * freq, py * freq);
                    if (config.NOISE_TYPE === 'RIDGED') n = 1.0 - Math.abs(n);
                    else if (config.NOISE_TYPE === 'BILLOWY') n = Math.abs(n);
                    else n = (n + 1) * 0.5;
                    
                    n = Math.pow(n, config.SHARPNESS);
                    nTotal += n * amp;
                    maxAmp += amp;
                    amp *= 0.5;
                    freq *= 2.0;
                }

                const hRaw = (nTotal / maxAmp) * config.HEIGHT;
                if (hRaw > maxHRaw) maxHRaw = hRaw;

                const taper = Math.max(0, (edgeFactor - 0.2) / 0.8);
                heightMap[idx] = hRaw * taper;
                rawMap[idx] = hRaw;
            }
        }

        // Blur
        blurMap(maskMap, width, height, Math.ceil(2 * config.RESOLUTION));

        // --- PASS 2: Render Pixels ---
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

                const stackH = Math.ceil(hVal);
                const baseDrawY = y + config.HEIGHT;

                for (let k = 0; k < stackH; k++) {
                    const drawY = baseDrawY - k;
                    if (drawY < 0 || drawY >= renderHeight) continue;
                    
                    const pIdx = (drawY * width + x) * 4;
                    let ao = (k / stackH) * 25;
                    if (normHeight > config.SNOW_LEVEL) ao *= 0.5;

                    let rPix = rFin, gPix = gFin, bPix = bFin;

                    // Sand Effect
                    if (config.type === 'DESERT' && k >= stackH - 2) {
                        const grainSeed = (x * 43.23 + (drawY) * 12.45);
                        const noiseVal = Math.abs((Math.sin(grainSeed) * 78923.456) % 1);
                        if (noiseVal > 0.95) { rPix+=40; gPix+=40; bPix+=40; }
                        else if (noiseVal > 0.90) { rPix+=20; gPix+=20; bPix+=20; }
                        else if (noiseVal < 0.1) { const d=15; rPix-=d; gPix-=d; bPix-=d; }
                    }

                    buffer[pIdx] = Math.max(0, rPix - ao);
                    buffer[pIdx+1] = Math.max(0, gPix - ao);
                    buffer[pIdx+2] = Math.max(0, bPix - ao);
                    buffer[pIdx+3] = 255;
                }
            }
        }

        self.postMessage({
            type: 'RESULT',
            buffer,
            width,
            height: renderHeight,
            minX: bounds.minX,
            minY: bounds.minY,
            maxY: bounds.maxY,
            padding,
            heightOffset: config.HEIGHT,
            duration: performance.now() - startTime
        }, [buffer.buffer]); // Transferable
    }
};
`;

export function createTerrainWorkerUrl() {
    const blob = new Blob([terrainWorkerScript], { type: 'application/javascript' });
    return URL.createObjectURL(blob);
}
