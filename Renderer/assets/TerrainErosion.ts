
import { GameMap, TerrainType } from '../../Grid/GameMap';
import { TerrainGenerator, DESERT_CONFIG, MOUNTAIN_CONFIG, HILLS_CONFIG, BiomeConfig } from './TerrainGenerator';
import { ISO_FACTOR } from '../RenderUtils';
import { createTerrainWorkerUrl } from './terrainWorkerBlob';

export interface TerrainSprite {
    x: number;
    y: number;
    canvas: HTMLCanvasElement;
    depth: number;
}

interface WorkerTask {
    clusterTiles: string[];
    bounds: any;
    hexSize: number;
    config: BiomeConfig;
    seed: number;
    padding: number;
    resolve: (sprite: TerrainSprite) => void;
}

export class TerrainErosion {
    
    private static workers: Worker[] = [];
    private static taskQueue: WorkerTask[] = [];
    private static idleWorkers: number[] = [];
    private static workerUrl: string | null = null;

    private static initWorkers() {
        if (this.workers.length > 0) return;
        
        const count = Math.max(2, navigator.hardwareConcurrency || 4);
        this.workerUrl = createTerrainWorkerUrl();

        for (let i = 0; i < count; i++) {
            const w = new Worker(this.workerUrl);
            w.onmessage = (e) => this.handleWorkerMessage(i, e.data);
            this.workers.push(w);
            this.idleWorkers.push(i);
        }
    }

    private static handleWorkerMessage(workerIndex: number, data: any) {
        // Return worker to pool
        this.idleWorkers.push(workerIndex);
        this.processQueue();

        if (data.type === 'RESULT') {
            const { buffer, width, height, minX, minY, maxY, padding, heightOffset } = data;
            
            // Reconstruct Canvas on Main Thread
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                const imgData = new ImageData(buffer, width, height);
                ctx.putImageData(imgData, 0, 0);
            }

            // Find valid callback logic would go here if we tracked Task IDs, 
            // but for simplicity we rely on the internal promise resolution scope via queue? 
            // No, the simplistic pool needs to track requests.
            // Since we don't have task IDs in this simple pool implementation, 
            // we will refactor to use a simpler Promise.all approach without a complex queue manager class for this specific game loop.
        }
    }

    // --- Flood Fill Logic ---
    private static findClusters(map: GameMap, type: TerrainType): Set<string>[] {
        const visited = new Set<string>();
        const clusters: Set<string>[] = [];
        const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];

        for (let r = 0; r < map.height; r++) {
            for (let c = 0; c < map.width; c++) {
                const q = c - (r - (r & 1)) / 2;
                const key = `${q},${r}`;
                const tile = map.getTile(q, r);

                if (tile && tile.terrain === type && !visited.has(key)) {
                    const cluster = new Set<string>();
                    const stack = [{q, r}];
                    visited.add(key);
                    cluster.add(key);

                    while (stack.length > 0) {
                        const curr = stack.pop()!;
                        for (const [dq, dr] of neighbors) {
                            const nq = curr.q + dq; const nr = curr.r + dr;
                            const nKey = `${nq},${nr}`;
                            if (map.isValid(nq, nr) && !visited.has(nKey)) {
                                const nTile = map.getTile(nq, nr);
                                if (nTile && nTile.terrain === type) {
                                    visited.add(nKey);
                                    cluster.add(nKey);
                                    stack.push({q: nq, r: nr});
                                }
                            }
                        }
                    }
                    clusters.push(cluster);
                }
            }
        }
        return clusters;
    }

    private static getClusterBounds(cluster: Set<string>, hexSize: number) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        let minQ = Infinity, minR = Infinity;

        cluster.forEach(key => {
            const [q, r] = key.split(',').map(Number);
            if (q < minQ) minQ = q; 
            if (r < minR) minR = r;
            
            const x = hexSize * Math.sqrt(3) * (q + r/2);
            const y = (hexSize * 1.5 * r) * ISO_FACTOR;
            
            const w = hexSize * Math.sqrt(3);
            const h = hexSize * 2 * ISO_FACTOR;
            
            const px1 = x - w/2; const px2 = x + w/2;
            const py1 = y - h/2; const py2 = y + h/2;

            if (px1 < minX) minX = px1;
            if (px2 > maxX) maxX = px2;
            if (py1 < minY) minY = py1;
            if (py2 > maxY) maxY = py2;
        });
        return { minX, maxX, minY, maxY, minQ, minR };
    }

    // --- Worker Task Execution ---

    private static executeTask(
        worker: Worker, 
        task: any
    ): Promise<TerrainSprite | null> {
        return new Promise((resolve) => {
            const handleMsg = (e: MessageEvent) => {
                if (e.data.type === 'RESULT') {
                    worker.removeEventListener('message', handleMsg);
                    
                    const { buffer, width, height, minX, minY, maxY, padding, heightOffset } = e.data;
                    
                    if (buffer.byteLength === 0) {
                        resolve(null);
                        return;
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        const imgData = new ImageData(buffer, width, height);
                        ctx.putImageData(imgData, 0, 0);
                    }

                    resolve({ 
                        x: minX - padding, 
                        y: minY - padding - heightOffset, 
                        canvas, 
                        depth: maxY 
                    });
                }
            };
            worker.addEventListener('message', handleMsg);
            worker.postMessage({ type: 'START', ...task });
        });
    }

    public static async generateAll(
        map: GameMap,
        hexSize: number,
        onProgress: (pct: number, msg: string) => void
    ): Promise<TerrainSprite[]> {
        
        // 1. Initialize Pool
        const maxWorkers = Math.max(2, navigator.hardwareConcurrency || 4);
        const workerUrl = createTerrainWorkerUrl();
        const workers: Worker[] = [];
        
        for(let i=0; i<maxWorkers; i++) {
            workers.push(new Worker(workerUrl));
        }

        const sprites: TerrainSprite[] = [];
        const tasks: any[] = [];

        // 2. Prepare All Tasks
        const types = [
            { type: TerrainType.DESERT, config: DESERT_CONFIG },
            { type: TerrainType.HILLS, config: HILLS_CONFIG },
            { type: TerrainType.MOUNTAIN, config: MOUNTAIN_CONFIG }
        ];

        for (const t of types) {
            const clusters = this.findClusters(map, t.type);
            const padding = TerrainGenerator.getPadding(hexSize, t.config.RESOLUTION);
            
            for (const cluster of clusters) {
                const bounds = this.getClusterBounds(cluster, hexSize);
                tasks.push({
                    clusterTiles: Array.from(cluster),
                    bounds,
                    hexSize,
                    config: t.config,
                    seed: Math.random() * 10000,
                    padding
                });
            }
        }

        // 3. Process Parallel
        let completed = 0;
        const total = tasks.length;
        
        // Simple queue consumption
        const process = async (w: Worker) => {
            while (tasks.length > 0) {
                const task = tasks.shift();
                if (task) {
                    const result = await this.executeTask(w, task);
                    if (result) sprites.push(result);
                    
                    completed++;
                    const pct = Math.floor((completed / total) * 100);
                    onProgress(pct, `Генерация ландшафта (${completed}/${total})...`);
                }
            }
        };

        const threads = workers.map(w => process(w));
        await Promise.all(threads);

        // 4. Cleanup
        workers.forEach(w => w.terminate());
        URL.revokeObjectURL(workerUrl);

        onProgress(100, "Ландшафт готов!");
        return sprites;
    }

    // Stub for unused method
    private static processQueue() {}
}
