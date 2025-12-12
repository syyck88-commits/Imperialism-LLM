
// Renderer/assets/DesertErosion.ts
import { GameMap, TerrainType } from '../../Grid/GameMap';
import { ISO_FACTOR } from '../RenderUtils';
import { DesertGenerator } from './DesertGenerator';

export interface DesertSprite {
    x: number; // Экранная X координата
    y: number; // Экранная Y координата
    canvas: HTMLCanvasElement;
    depth: number; // Для сортировки (Y координата "дна" спрайта)
}

export class DesertErosion {
    
    private static async yieldToMain() {
        return new Promise(resolve => setTimeout(resolve, 0));
    }

    // Поиск связных областей (Flood Fill)
    private static findClusters(map: GameMap): Set<string>[] {
        const visited = new Set<string>();
        const clusters: Set<string>[] = [];
        const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];

        for (let r = 0; r < map.height; r++) {
            for (let c = 0; c < map.width; c++) {
                const q = c - (r - (r & 1)) / 2;
                const key = `${q},${r}`;
                const tile = map.getTile(q, r);

                if (tile && tile.terrain === TerrainType.DESERT && !visited.has(key)) {
                    // Новый кластер
                    const cluster = new Set<string>();
                    const stack = [{q, r}];
                    visited.add(key);
                    cluster.add(key);

                    while (stack.length > 0) {
                        const curr = stack.pop()!;
                        
                        for (const [dq, dr] of neighbors) {
                            const nq = curr.q + dq;
                            const nr = curr.r + dr;
                            const nKey = `${nq},${nr}`;
                            
                            if (map.isValid(nq, nr) && !visited.has(nKey)) {
                                const nTile = map.getTile(nq, nr);
                                if (nTile && nTile.terrain === TerrainType.DESERT) {
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

    // Вычисление границ кластера в пикселях
    private static getClusterBounds(cluster: Set<string>, hexSize: number) {
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minQ = Infinity, minR = Infinity;

        cluster.forEach(key => {
            const [q, r] = key.split(',').map(Number);
            if (q < minQ) minQ = q;
            if (r < minR) minR = r;

            const x = hexSize * Math.sqrt(3) * (q + r/2);
            const y = (hexSize * 1.5 * r) * ISO_FACTOR;

            // Расширяем границы гекса (ширина ~ hexSize * 1.73)
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

    // Главный метод
    public static async generateAsync(
        map: GameMap,
        hexSize: number,
        onProgress: (pct: number, msg: string) => void
    ): Promise<DesertSprite[]> {
        
        onProgress(10, "Анализ пустыни...");
        await this.yieldToMain();

        const clusters = this.findClusters(map);
        const sprites: DesertSprite[] = [];
        const total = clusters.length;

        for (let i = 0; i < total; i++) {
            const cluster = clusters[i];
            
            // Сообщаем прогресс
            const pct = 10 + Math.floor((i / total) * 80);
            onProgress(pct, `Генерация области ${i + 1}/${total}...`);
            await this.yieldToMain(); // Даем UI обновиться

            const bounds = this.getClusterBounds(cluster, hexSize);
            
            // Генерируем спрайт
            const canvas = DesertGenerator.generateSprite(cluster, bounds, hexSize);
            
            if (canvas) {
                // Must match PADDING in DesertGenerator (80 * RESOLUTION 1.0)
                sprites.push({
                    x: bounds.minX - 80, 
                    y: bounds.minY - 80,
                    canvas: canvas,
                    depth: bounds.maxY // Сортировка по нижней кромке
                });
            }
        }

        onProgress(100, "Пустыня готова");
        return sprites;
    }
}
