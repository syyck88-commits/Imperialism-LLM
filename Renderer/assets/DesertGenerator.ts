// Renderer/assets/DesertGenerator.ts

import { noise } from '../../utils/SimplexNoise';
import { ISO_FACTOR } from '../RenderUtils';

// Обновленный конфиг с правильными диапазонами
export const GEN_CONFIG = {
    RESOLUTION: 1.0,    
    SAND_HEIGHT: 30,    
    DUNE_SCALE: 25,     
    SHARPNESS: 2.0,     // < 1.0 = круглые холмы, > 1.0 = острые пики
    WARP_STRENGTH: 20,  
    COLOR_BIAS: 0.5,    
    BASE_EROSION: 20,   // % отступа от края маски (Edge Fade)
    COL_PEAK: [235, 215, 180], // Светлый песок
    COL_MID: [195, 160, 110],  // Средний
    COL_BOT: [165, 125, 85]      // Тень
};

export type GenConfigType = typeof GEN_CONFIG;

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

export class DesertGenerator {

    // Вспомогательные функции координат
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

    // --- SDF LOGIC ---
    
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
                const nq = globalQ + dq;
                const nr = globalR + dr;
                const nKey = `${nq},${nr}`;

                if (!customTiles.has(nKey)) {
                    isActiveEdge = true;
                    if (!checked.has(nKey)) {
                        checked.add(nKey);
                        const p = this.axialToPixel(nq - offsetQ, nr - offsetR, hexSize);
                        inactiveBoundary.push(p);
                    }
                }
            });

            if (isActiveEdge) {
                const p = this.axialToPixel(q, r, hexSize);
                activeBoundary.push(p);
            }
        });

        return { activeCenters: activeBoundary, inactiveCenters: inactiveBoundary };
    }

    private static getSDF(x: number, y: number, isInside: boolean, boundaryData: BoundaryData, hexSize: number): number {
        if (!boundaryData.activeCenters.length || !boundaryData.inactiveCenters.length) return -100;

        let minD = Infinity;
        // Adjust offset to control how much the "blob" expands/contracts
        const offset = (hexSize * Math.sqrt(3)) * 0.55; 

        if (isInside) {
            for (const p of boundaryData.inactiveCenters) {
                const d = (x - p.x)**2 + (y - p.y)**2;
                if (d < minD) minD = d;
            }
            return Math.sqrt(minD) - offset;
        } else {
            for (const p of boundaryData.activeCenters) {
                const d = (x - p.x)**2 + (y - p.y)**2;
                if (d < minD) minD = d;
            }
            return offset - Math.sqrt(minD);
        }
    }

    // НОВЫЙ МЕТОД: Генерация превью (быстрый тест на 7 тайлах)
    public static generatePreview(canvas: HTMLCanvasElement, config: GenConfigType) {
        // Создаем искусственный кластер (центр + 6 соседей)
        const mockTiles = new Set<string>(['0,0', '1,0', '-1,0', '0,1', '0,-1', '1,-1', '-1,1']);
        
        // Эмулируем границы для этого кластера
        const bounds = { minX: -100, maxX: 100, minY: -100, maxY: 100, minQ: -1, minR: -1 }; 
        const hexSize = 32; // Фиксированный размер для превью

        // Вызываем основную логику, но с фейковыми данными
        const result = this.generateSprite(mockTiles, bounds, hexSize, config, true);
        if (result) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(result, 0, 0);
            }
        }
    }

    // ОБНОВЛЕННЫЙ МЕТОД ГЕНЕРАЦИИ
    public static generateSprite(
        targetTiles: Set<string>,
        bounds: { minX: number, maxX: number, minY: number, maxY: number, minQ: number, minR: number },
        hexSize: number,
        configOverride?: GenConfigType, // Возможность передать конфиг (для превью)
        isPreview: boolean = false
    ): HTMLCanvasElement | null {
        
        // Используем переданный конфиг или глобальный
        const cfg = configOverride || GEN_CONFIG;
        
        const scale = cfg.RESOLUTION;
        const PADDING = 80 * scale; 

        // Расчет размеров канваса
        let width, height, globalOriginX, globalOriginY;

        if (isPreview) {
            // Фиксированный размер для превью
            width = 300;
            height = 300;
            globalOriginX = -150;
            globalOriginY = -150;
        } else {
            width = Math.ceil(bounds.maxX - bounds.minX + PADDING * 2);
            height = Math.ceil(bounds.maxY - bounds.minY + PADDING * 2);
            globalOriginX = bounds.minX - PADDING;
            globalOriginY = bounds.minY - PADDING;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height; // + запас высоты если нужно
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        const imgData = ctx.createImageData(width, height);
        const data = imgData.data;

        // Важно: Для превью пересчитываем границы SDF относительно (0,0)
        // Для реальной карты - относительно переданных minQ, minR
        const refQ = isPreview ? 0 : bounds.minQ;
        const refR = isPreview ? 0 : bounds.minR;

        const boundaryData = this.getBoundarySets(targetTiles, hexSize, refQ, refR);
        
        const heightMap = new Float32Array(width * height);
        const rawMap = new Float32Array(width * height);
        const maskMap = new Float32Array(width * height);

        let maxHRaw = 0.001;
        noise.seed(Date.now()); // Или фиксированный сид для превью

        // Вектор смещения для SDF (центр кластера в пикселях)
        const offsetPixel = this.axialToPixel(refQ, refR, hexSize);

        // --- PASS 1: CALCULATION ---
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                
                const drawX = globalOriginX + x;
                const drawY = globalOriginY + y;
                const unsquashedY = drawY / ISO_FACTOR;

                // 1. SDF Calculation
                const sdfX = drawX - offsetPixel.x;
                const sdfY = unsquashedY - offsetPixel.y;
                
                // Проверка "внутри ли тайла"
                // Для SDF нам нужны локальные координаты сетки
                const localAxial = this.pixelToAxial(drawX, unsquashedY, hexSize);
                const tileKey = `${localAxial.q},${localAxial.r}`;
                const isInside = targetTiles.has(tileKey);

                let sdf = this.getSDF(sdfX, sdfY, isInside, boundaryData, hexSize);

                // --- UPDATE 1: Perturbation ---
                sdf += noise.noise2D(drawX * 0.025, unsquashedY * 0.025) * 15.0;

                // --- UPDATE 2: Fixed Effective Fade ---
                // ~4 tiles wide reference for consistent fading regardless of cluster size
                const effectiveFadeRef = 4 * (hexSize * Math.sqrt(3)); 
                const fadeDist = Math.max(10.0, effectiveFadeRef * (cfg.BASE_EROSION / 100));
                
                // Плавное затухание по краям маски
                // +0.5 biases the fade to allow more solid center
                const edgeFactor = Math.min(1.0, Math.max(0.0, sdf / fadeDist + 0.5));
                maskMap[idx] = edgeFactor;

                // 2. Noise Generation
                const freq = cfg.DUNE_SCALE * 0.001; // Скейлинг
                
                // Warping
                const warp = cfg.WARP_STRENGTH;
                const qx = noise.noise2D(drawX * freq * 0.5, unsquashedY * freq * 0.5) * warp;
                const qy = noise.noise2D(unsquashedY * freq * 0.5 + 5.2, drawX * freq * 0.5 + 1.3) * warp;

                const px = drawX + qx;
                const py = unsquashedY + qy;

                let n = noise.noise2D(px * freq, py * freq);
                
                // Ridge / Sharpness
                n = 1.0 - Math.abs(n); // Ridged (делает хребты)
                n = Math.pow(Math.max(0, n), cfg.SHARPNESS); 

                const hRaw = n * cfg.SAND_HEIGHT;
                if (hRaw > maxHRaw) maxHRaw = hRaw;

                // Store raw height (apply mask later during render for tapering)
                heightMap[idx] = hRaw;
                rawMap[idx] = hRaw;
            }
        }

        // --- UPDATE 3: Blur Pass ---
        // Smooth the mask to remove hexagon stepping artifacts
        blurMap(maskMap, width, height, Math.ceil(2 * scale));

        // --- PASS 2: RENDER (Voxel Stacking) ---
        const [rP, gP, bP] = cfg.COL_PEAK;
        const [rM, gM, bM] = cfg.COL_MID;
        const [rB, gB, bB] = cfg.COL_BOT;
        const bias = cfg.COLOR_BIAS;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                const mask = maskMap[idx];
                
                if (mask <= 0.01) continue;

                // Apply mask to height now
                const hVal = heightMap[idx] * Math.sqrt(mask);
                const rawVal = rawMap[idx];

                // Градиент цвета
                let t = rawVal / maxHRaw;
                t = Math.min(1, Math.max(0, t));
                
                let r, g, b;
                if (t < bias) {
                    const lt = t / bias;
                    r = rB*(1-lt) + rM*lt;
                    g = gB*(1-lt) + gM*lt;
                    b = bB*(1-lt) + bM*lt;
                } else {
                    const lt = (t - bias) / (1 - bias);
                    r = rM*(1-lt) + rP*lt;
                    g = gM*(1-lt) + gP*lt;
                    b = bM*(1-lt) + bP*lt;
                }

                // Смешивание краев
                const rFin = Math.floor(rB*(1-mask) + r*mask);
                const gFin = Math.floor(gB*(1-mask) + g*mask);
                const bFin = Math.floor(bB*(1-mask) + b*mask);

                const stackH = Math.ceil(hVal) + 2;
                const baseDrawY = y + cfg.SAND_HEIGHT; // Сдвиг вниз

                for (let k = 0; k < stackH; k++) {
                    const drawY = baseDrawY - k;
                    if (drawY < 0 || drawY >= height) continue;
                    
                    const pIdx = (drawY * width + x) * 4;
                    const ao = (k / stackH) * 25; // AO
                    
                    data[pIdx] = Math.max(0, rFin - ao);
                    data[pIdx+1] = Math.max(0, gFin - ao);
                    data[pIdx+2] = Math.max(0, bFin - ao);
                    data[pIdx+3] = 255;
                }
            }
        }

        ctx.putImageData(imgData, 0, 0);
        return canvas;
    }
}