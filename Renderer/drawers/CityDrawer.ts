
import { City } from '../../Entities/City';
import { AssetManager } from '../AssetManager';
import { Camera, hexToScreen, ISO_FACTOR } from '../RenderUtils';

export class CityDrawer {

    public static populateBucket(
        bucket: (() => void)[],
        ctx: CanvasRenderingContext2D,
        cities: City[],
        camera: Camera,
        hexSize: number,
        assets: AssetManager
    ) {
        for (const city of cities) {
            const { x, y } = hexToScreen(city.location.q, city.location.r, camera, hexSize);
            // Culling (Relaxed to ensure large city sprites don't pop)
            if (x < -200 || x > camera.width + 200 || y < -200 || y > camera.height + 200) continue;

            const config = assets.getConfig('STR_capital');

            // Pass 1: Base decal layer
            bucket.push(() => this.drawCity(assets.getStructureSprite('capital'), city, x, y, hexSize * camera.zoom, 'base', config, camera.zoom)(ctx));

            // Pass 2: Top structure layer
            bucket.push(() => this.drawCity(assets.getStructureSprite('capital'), city, x, y, hexSize * camera.zoom, 'top', config, camera.zoom)(ctx));
        }
    }

    private static drawCity(
        sprite: HTMLImageElement | null,
        city: City,
        x: number,
        y: number,
        size: number,
        pass: 'base' | 'top',
        config: { scale: number, shiftX: number, shiftY: number, drawShadow?: boolean, shadowScale?: number, shadowX?: number, shadowY?: number, shadowOpacity?: number },
        zoom: number
    ): (innerCtx: CanvasRenderingContext2D) => void {
        return (innerCtx: CanvasRenderingContext2D) => {
            if (!sprite) {
                if (pass === 'top') {
                    const isoOffset = size * -0.3;
                    innerCtx.font = `${size}px sans-serif`;
                    innerCtx.fillStyle = '#f8fafc';
                    innerCtx.fillText('🏰', x, y + isoOffset);

                    const textY = y + (size * -0.3);
                    innerCtx.font = `bold ${Math.floor(size * 0.4)}px monospace`;
                    innerCtx.fillStyle = '#fde68a';
                    innerCtx.shadowColor = 'rgba(0,0,0,0.8)';
                    innerCtx.shadowBlur = 4;
                    innerCtx.fillText(city.name, x, textY);
                    innerCtx.shadowBlur = 0;
                }
                return;
            }

            // --- Sprite Logic ---
            const hexWidth = Math.sqrt(3) * size;
            
            // Apply Config
            const scale = 2.1 * config.scale; 
            
            const drawW = hexWidth * scale;
            const aspect = sprite.width / sprite.height;
            const drawH = drawW / aspect;
            
            // Apply Zoom to Shifts
            const shiftX = config.shiftX * zoom;
            const shiftY = config.shiftY * zoom;

            const drawX = x - drawW / 2 + shiftX;
            const drawY = y - drawH * 0.65 + shiftY;

            if (pass === 'base') {
                // City Base Shadow
                if ((config.drawShadow ?? true) && (config.shadowScale || 0) > 0) {
                    const shadowXOffset = (config.shadowX || 0) * zoom;
                    const shadowYOffset = (config.shadowY || 0) * zoom;

                    innerCtx.save();
                    innerCtx.beginPath();
                    const shadowY = drawY + drawH * 0.9 + shadowYOffset;
                    const shadowX = x + shiftX + shadowXOffset;
                    innerCtx.ellipse(shadowX, shadowY, drawW * 0.3 * (config.shadowScale||1), drawH * 0.1 * (config.shadowScale||1), 0, 0, Math.PI * 2);
                    innerCtx.fillStyle = `rgba(0, 0, 0, ${config.shadowOpacity ?? 0.3})`;
                    innerCtx.fill();
                    innerCtx.restore();
                }
                innerCtx.drawImage(sprite, drawX, drawY, drawW, drawH);
            } else { // pass === 'top'
                innerCtx.save();
                
                // Adjusted clipping
                const clipHeight = (y - drawY) - (size * 4.5 * ISO_FACTOR);
                
                innerCtx.beginPath();
                innerCtx.rect(drawX, drawY, drawW, Math.max(0, clipHeight));
                innerCtx.clip();
                
                innerCtx.drawImage(sprite, drawX, drawY, drawW, drawH);
                
                innerCtx.restore();

                const textY = y - drawH * 0.7;
                innerCtx.font = `bold ${Math.floor(size * 0.4)}px monospace`;
                innerCtx.fillStyle = '#fde68a';
                innerCtx.shadowColor = 'rgba(0,0,0,0.8)';
                innerCtx.shadowBlur = 4;
                innerCtx.fillText(city.name, x + shiftX, textY + shiftY);
                innerCtx.shadowBlur = 0;
            }
        };
    }
}
