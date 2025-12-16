
import { Hex, hexToString } from '../../Grid/HexMath';
import { ResourceType } from '../../Grid/GameMap';
import { AssetManager } from '../AssetManager';
import { QualityManager } from '../../core/quality/QualityManager';

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

    // Performance Throttling
    private updateInterval: number = 1000 / 60;
    private accumulator: number = 0;

    constructor() {
        const qualityManager = QualityManager.getInstance();
        const settings = qualityManager.getSettings();
        this.updateInterval = settings.animalsUpdateHz > 0 ? 1000 / settings.animalsUpdateHz : Infinity;
        
        qualityManager.addListener((newSettings) => {
            if(newSettings.animalsUpdateHz > 0) {
                this.updateInterval = 1000 / newSettings.animalsUpdateHz;
            } else {
                this.updateInterval = Infinity; // Effectively disable updates
            }
        });
    }

    public update(deltaTime: number) {
        if (!isFinite(this.updateInterval)) return;

        this.accumulator += deltaTime;
        if (this.accumulator < this.updateInterval) {
            return;
        }

        const updateDelta = this.accumulator;
        this.accumulator = 0;

        this.animals.forEach(group => {
            group.forEach(animal => {
                this.updateAnimal(animal, updateDelta);
            });
            // Sort by Y for depth within the tile
            group.sort((a, b) => a.y - b.y);
        });
    }

    public getAnimals(key: string): AnimalInstance[] | undefined {
        return this.animals.get(key);
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
        
        // Respect global quality limit even on spawn
        const maxClumps = QualityManager.getInstance().getSettings().maxClumpCount;
        const spawnLimit = maxClumps > 0 ? maxClumps : 3;

        if (resourceType === ResourceType.WOOL) {
            // Spawn Sheep
            for(let i=0; i < spawnLimit; i++) this.spawn(newGroup, 0);
        } else if (resourceType === ResourceType.MEAT) {
            // Spawn Cows/Bulls
            for(let i=0; i < spawnLimit; i++) {
                if (i === 0) this.spawn(newGroup, 1); // Ensure at least 1 cow
                else if (Math.random() > 0.7) this.spawn(newGroup, 2); // Bull chance
                else this.spawn(newGroup, 1);
            }
        }

        this.animals.set(key, newGroup);
        return newGroup;
    }

    public ensurePopulation(key: string, resourceType: ResourceType, minCount: number) {
        const group = this.animals.get(key);
        if (!group) return;

        // Force cap based on quality
        const maxClumps = QualityManager.getInstance().getSettings().maxClumpCount;
        const effectiveMin = maxClumps > 0 ? Math.min(minCount, maxClumps) : minCount;

        // If current count is less than required minimum, spawn more
        while (group.length < effectiveMin) {
            if (resourceType === ResourceType.WOOL) {
                this.spawn(group, 0); // Sheep
            } else {
                // Cow/Bull chance
                if (Math.random() > 0.7) this.spawn(group, 2); // Bull
                else this.spawn(group, 1); // Cow
            }
        }
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
        const quality = QualityManager.getInstance().getSettings();
        
        // --- Apply CLUMP Counts ---
        
        // 1. Quality Limit Override
        let renderList = animals;
        if (quality.maxClumpCount > 0 && animals.length > quality.maxClumpCount) {
            renderList = animals.slice(0, quality.maxClumpCount);
        } else {
            // 2. Config Max Count slicing
            if (config.clumpMax > 0 && animals.length > config.clumpMax) {
                renderList = animals.slice(0, config.clumpMax);
            }
            
            // 3. Min Count enforcement (Only if quality allows)
            if (config.clumpMin > 0 && animals.length < config.clumpMin) {
                const key = hexToString(hex);
                this.ensurePopulation(key, resourceType, config.clumpMin);
                animals = this.animals.get(key) || animals;
                // Re-slice just in case
                renderList = animals; 
            }
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
        const spreadMult = config.clumpSpread || 1.0;

        renderList.forEach(animal => {
            let row = 0; // Idle
            if (animal.state === 'WALK') row = animal.walkFrame; // 0 or 1
            if (animal.state === 'EAT') row = 2;

            const col = animal.variant; // 0=Sheep, 1=Cow, 2=Bull

            // Apply Scale Factor to offset positions so they don't clump when zoomed in
            // Multiplied by spread setting
            const offsetX = (animal.x * spreadMult) * scaleFactor + globalShiftX;
            const offsetY = (animal.y * spreadMult) * scaleFactor + globalShiftY;

            if (quality.shadowsEnabled && (config.drawShadow ?? true) && config.shadowScale > 0) {
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
