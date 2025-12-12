
import { Unit } from '../../Entities/Unit';
import { AssetManager } from '../AssetManager';
import { Camera, hexToScreen, ISO_FACTOR } from '../RenderUtils';

export class UnitDrawer {

    public static populateBucket(
        bucket: (() => void)[],
        ctx: CanvasRenderingContext2D,
        units: Unit[],
        selectedUnit: Unit | null,
        camera: Camera,
        hexSize: number,
        assets: AssetManager
    ) {
        for (const unit of units) {
            const { x, y } = hexToScreen(unit.visualPos.q, unit.visualPos.r, camera, hexSize);
            // Culling
            if (x < -50 || x > camera.width + 50 || y < -50 || y > camera.height + 50) continue;

            bucket.push(() => this.drawUnit(unit, selectedUnit, x, y, hexSize, camera, assets)(ctx));
        }
    }

    private static drawUnit(
        unit: Unit,
        selectedUnit: Unit | null,
        x: number,
        y: number,
        hexSize: number,
        camera: Camera,
        assets: AssetManager
    ) {
        return (ctx: CanvasRenderingContext2D) => {
            const size = hexSize * camera.zoom;
            const isoOffset = size * -0.2; // Stand on top of block

            if (selectedUnit && unit.id === selectedUnit.id) {
                ctx.beginPath();
                ctx.ellipse(x, y + isoOffset, size * 0.6, size * 0.6 * ISO_FACTOR, 0, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(251, 191, 36, 0.4)';
                ctx.fill();
                ctx.strokeStyle = '#fbbf24';
                ctx.lineWidth = 2;
                ctx.stroke();
            }

            const sprite = assets.getUnitSprite(unit.type);
            
            if (sprite) {
                // CONFIG LOOKUP
                const config = assets.getConfig(`UNIT_${unit.type}`);

                const aspect = sprite.width / sprite.height;
                // Base 1.5 multiplier times config scale
                const drawH = size * 1.5 * config.scale; 
                const drawW = drawH * aspect;
                
                // Shifts (Scaled by Zoom to prevent drift)
                const shiftXScaled = config.shiftX * camera.zoom;
                const shiftYScaled = config.shiftY * camera.zoom;

                const drawX = x - drawW / 2 + shiftXScaled;
                const drawY = y + isoOffset - drawH + (size * 0.2) + shiftYScaled;

                // Blob Shadow
                if ((config.drawShadow ?? true) && config.shadowScale > 0) {
                     const shadowXScaled = (config.shadowX || 0) * camera.zoom;
                     const shadowYScaled = (config.shadowY || 0) * camera.zoom;

                     ctx.beginPath();
                     const sx = x + shiftXScaled + shadowXScaled;
                     const sy = y + isoOffset + shadowYScaled;
                     ctx.ellipse(sx, sy, drawW * 0.3 * config.shadowScale, drawW * 0.15 * config.shadowScale, 0, 0, Math.PI * 2);
                     ctx.fillStyle = `rgba(0,0,0,${config.shadowOpacity ?? 0.3})`;
                     ctx.fill();
                }

                ctx.drawImage(sprite, drawX, drawY, drawW, drawH);
            } else {
                ctx.font = `${Math.floor(size * 0.8)}px sans-serif`;
                ctx.fillStyle = '#ffffff';
                ctx.fillText(unit.getEmoji(), x, y + isoOffset - size*0.1);
            }

            if (unit.movesLeft < unit.maxMoves) {
                const barW = size * 0.66;
                const barH = 4 * camera.zoom;
                ctx.fillStyle = '#ef4444'; 
                ctx.fillRect(x - size/3, y + isoOffset + size/2, barW, barH);
                ctx.fillStyle = '#fbbf24'; 
                ctx.fillRect(x - size/3, y + isoOffset + size/2, barW * (unit.movesLeft / unit.maxMoves), barH);
            }
        };
    }
}
