
import { Hex, hexToString } from '../../Grid/HexMath';
import { ResourceType } from '../../Grid/GameMap';
import { AssetManager } from '../AssetManager';

export interface AnimalInstance {
    x: number; // relative to tile center (base coordinates)
    y: number; // relative to tile center
    state: 'IDLE' | 'WALK' | 'EAT';
    timer: number; // ms
    targetX: number;
    targetY: number;
    variant: number; // 0=Sheep, 1=Cow, 2=Bull
    flip: boolean;
    walkFrame: number; // 0 or 1
    walkFrameTimer: number;
}

export class AnimalManager {
    private animals: Map<string, AnimalInstance[]> = new Map();

    // Sprite Sheet Constants
    private readonly SHEET_COLS = 3;
    private readonly SHEET_ROWS = 3;
    
    // Bounds for movement relative to center (in base pixels)
    private readonly BOUNDS_RADIUS = 25;

    public update(deltaTime: number) {
        this.animals.forEach(group => {
            group.forEach(animal => {
                this.updateAnimal(animal, deltaTime);
            });
            // Sort by Y for depth within the tile
            group.sort((a, b) => a.y - b.y);
        });
    }

    private updateAnimal(animal: AnimalInstance, dt: number) {
        animal.timer -= dt;

        if (animal.state === 'WALK') {
            // Move towards target
            const dx = animal.targetX - animal.x;
            const dy = animal.targetY - animal.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const speed = 0.015 * dt;

            if (dist < 1) {
                // Arrived
                animal.x = animal.targetX;
                animal.y = animal.targetY;
                this.pickNextState(animal);
            } else {
                animal.x += (dx / dist) * speed;
                animal.y += (dy / dist) * speed;
                
                // Flip logic (Fixed: Inverted to prevent moonwalking)
                if (dx < -0.1) animal.flip = false; 
                if (dx > 0.1) animal.flip = true;

                // Animate legs
                animal.walkFrameTimer += dt;
                if (animal.walkFrameTimer > 200) {
                    animal.walkFrame = animal.walkFrame === 0 ? 1 : 0;
                    animal.walkFrameTimer = 0;
                }
            }
        } 
        else if (animal.timer <= 0) {
            this.pickNextState(animal);
        }
    }

    private pickNextState(animal: AnimalInstance) {
        const rand = Math.random();
        
        // 40% Eat, 60% Walk (from idle/eat)
        if (rand < 0.4) {
            animal.state = 'EAT';
            animal.timer = 2000 + Math.random() * 2000;
        } else if (rand < 0.7) {
            animal.state = 'IDLE';
            animal.timer = 1000 + Math.random() * 2000;
        } else {
            animal.state = 'WALK';
            // Pick random point in circle
            const angle = Math.random() * Math.PI * 2;
            const r = Math.random() * this.BOUNDS_RADIUS;
            animal.targetX = Math.cos(angle) * r;
            animal.targetY = Math.sin(angle) * r * 0.5; // Squash Y for iso perspective
        }
    }

    public getOrSpawnAnimals(hex: Hex, resourceType: ResourceType): AnimalInstance[] {
        const key = hexToString(hex);
        if (this.animals.has(key)) {
            return this.animals.get(key)!;
        }

        const newGroup: AnimalInstance[] = [];
        
        if (resourceType === ResourceType.WOOL) {
            // Spawn 3 Sheep by default (overriden by renderer clump max)
            for(let i=0; i<3; i++) this.spawn(newGroup, 0);
        } else if (resourceType === ResourceType.MEAT) {
            // Spawn 2 Cows, 1 Bull chance
            this.spawn(newGroup, 1);
            this.spawn(newGroup, 1);
            if (Math.random() > 0.7) this.spawn(newGroup, 2); // Bull
            else this.spawn(newGroup, 1); // Cow
        }

        this.animals.set(key, newGroup);
        return newGroup;
    }

    private spawn(group: AnimalInstance[], variant: number) {
        const angle = Math.random() * Math.PI * 2;
        const r = Math.random() * this.BOUNDS_RADIUS;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r * 0.5;

        group.push({
            x, y,
            state: 'IDLE',
            timer: Math.random() * 2000,
            targetX: x,
            targetY: y,
            variant,
            flip: Math.random() > 0.5,
            walkFrame: 0,
            walkFrameTimer: 0
        });
    }

    public drawAnimals(
        ctx: CanvasRenderingContext2D, 
        hex: Hex, 
        screenX: number, 
        screenY: number, 
        currentHexSize: number, // Actual size on screen (base * zoom)
        resourceType: ResourceType,
        assets: AssetManager,
        hasRanch: boolean = false
    ) {
        if (!assets.animalSpriteSheet) return;

        let animals = this.getOrSpawnAnimals(hex, resourceType);
        const sheet = assets.animalSpriteSheet;
        const config = assets.getConfig(`RES_${resourceType}`);
        
        // --- Apply CLUMP Counts ---
        // If config specifies Clump limits, we slice the array or spawn more
        // For animals, we'll just slice max or use min if needed (simple)
        let renderList = animals;
        
        if (config.clumpMax > 0 && animals.length > config.clumpMax) {
            renderList = animals.slice(0, config.clumpMax);
        }
        else if (config.clumpMin > 0 && animals.length < config.clumpMin) {
            // Need more? Spawn
            const typeVar = resourceType === ResourceType.WOOL ? 0 : 1;
            while (animals.length < config.clumpMin) {
                this.spawn(animals, typeVar);
            }
            renderList = animals;
        }

        // Calculate scaling factor based on zoom.
        // Assuming base tile size is around 64px for standard view.
        const scaleFactor = currentHexSize / 64; 

        const frameW = sheet.width / this.SHEET_COLS;
        const frameH = sheet.height / this.SHEET_ROWS;
        const aspect = frameW / frameH;

        // Visual scale adjustment * USER CONFIG
        const baseScale = 0.5 * config.scale; 

        // Apply Shift (scaled correctly by Zoom/ScaleFactor now)
        const globalShiftX = config.shiftX * scaleFactor;
        const globalShiftY = config.shiftY * scaleFactor;
        const shadowShiftX = (config.shadowX || 0) * scaleFactor;
        const shadowShiftY = (config.shadowY || 0) * scaleFactor;

        // Apply Distribution Spread
        // If Ranch is present, force tighter spread (1.0x) to look like a pen/pasture
        const spreadMult = hasRanch ? 1.0 : (config.clumpSpread || 1.0);

        renderList.forEach(animal => {
            let row = 0; // Idle
            if (animal.state === 'WALK') row = animal.walkFrame; // 0 or 1
            if (animal.state === 'EAT') row = 2;

            const col = animal.variant; // 0=Sheep, 1=Cow, 2=Bull

            // Apply Scale Factor to offset positions so they don't clump when zoomed in
            // Multiplied by spread setting
            const offsetX = (animal.x * spreadMult) * scaleFactor + globalShiftX;
            const offsetY = (animal.y * spreadMult) * scaleFactor + globalShiftY;

            if ((config.drawShadow ?? true) && config.shadowScale > 0) {
                // Draw shadow (Scaled)
                ctx.beginPath();
                const sx = screenX + offsetX + shadowShiftX;
                const sy = screenY + offsetY + shadowShiftY;
                ctx.ellipse(
                    sx, 
                    sy, 
                    8 * scaleFactor * config.shadowScale, 
                    4 * scaleFactor * config.shadowScale, 
                    0, 0, Math.PI * 2
                );
                ctx.fillStyle = `rgba(0,0,0,${config.shadowOpacity ?? 0.3})`;
                ctx.fill();
            }

            // Calculate Draw Dimensions (Scaled)
            const drawH = currentHexSize * baseScale; // Height relative to tile
            const drawW = drawH * aspect;
            
            const drawX = screenX + offsetX - drawW / 2;
            const drawY = screenY + offsetY - drawH + (5 * scaleFactor); // Anchor at feet

            ctx.save();
            if (animal.flip) {
                ctx.translate(drawX + drawW, drawY);
                ctx.scale(-1, 1);
                ctx.drawImage(sheet, col * frameW, row * frameH, frameW, frameH, 0, 0, drawW, drawH);
            } else {
                ctx.drawImage(sheet, col * frameW, row * frameH, frameW, frameH, drawX, drawY, drawW, drawH);
            }
            ctx.restore();
        });
    }
}
