
import { TerrainType, ResourceType } from '../Grid/GameMap';
import { UnitType } from '../Entities/Unit';
import { ISO_FACTOR } from './RenderUtils';
import { 
    generateBaseFallback, 
    generateForestFallback, 
    generateDunePattern, 
    generateInterfaceSprites, 
    generateFallbackAtlas, 
    BLOCK_DEPTH 
} from './assets/AssetGenerators';
import { SpriteVisualConfig, DEFAULT_SPRITE_CONFIG, PRESET_CONFIGS } from './assets/SpriteVisuals';

export class AssetManager {
  private readonly ATLAS_COLS = 3;
  private readonly ATLAS_ROWS = 2;

  public terrainTiles: HTMLCanvasElement;
  public uiSprites: HTMLCanvasElement; 
  public externalAtlas: HTMLImageElement | null = null;
  public animalSpriteSheet: HTMLImageElement | null = null;
  public isAtlasLoaded: boolean = false;
  
  // Specific Sprites Storage
  private loadedSprites: Map<TerrainType, HTMLImageElement> = new Map();
  public baseSprites: Map<string, HTMLImageElement> = new Map();
  public forestSprites: HTMLImageElement[] = [];
  public resourceSprites: Map<ResourceType, HTMLImageElement> = new Map();
  public dunePattern: CanvasPattern | null = null;
  
  private unitSprites: Map<UnitType, HTMLImageElement> = new Map();
  private structureSprites: Map<string, HTMLImageElement> = new Map();

  // Visual Configuration Registry
  private spriteConfigs: Map<string, SpriteVisualConfig> = new Map();

  public spriteMap: Record<TerrainType, { col: number, row: number }> = {
      [TerrainType.WATER]:    { col: 0, row: 0 },
      [TerrainType.PLAINS]:   { col: 1, row: 0 },
      [TerrainType.FOREST]:   { col: 2, row: 0 },
      [TerrainType.HILLS]:    { col: 0, row: 1 },
      [TerrainType.MOUNTAIN]: { col: 1, row: 1 },
      [TerrainType.DESERT]:   { col: 2, row: 1 },
      [TerrainType.SWAMP]:    { col: 0, row: 0 }, 
      [TerrainType.TUNDRA]:   { col: 2, row: 1 }, 
  };

  public uiMap = {
      cursor: { x: 0, y: 0 },
      highlight: { x: 1, y: 0 },
      move: { x: 2, y: 0 },
      path: { x: 3, y: 0 }
  };
  
  public readonly uiBaseSize = 64;
  public readonly uiTileW: number;
  public readonly uiTileH: number;

  constructor() {
    this.terrainTiles = document.createElement('canvas');
    this.uiSprites = document.createElement('canvas');
    
    this.uiTileW = Math.ceil(Math.sqrt(3) * this.uiBaseSize); 
    this.uiTileH = Math.ceil((this.uiBaseSize * 2 * ISO_FACTOR) + 4); 

    // Use extracted generators
    generateFallbackAtlas(this.terrainTiles, this.ATLAS_COLS, this.ATLAS_ROWS);
    this.baseSprites = generateBaseFallback();
    this.forestSprites = generateForestFallback();
    this.dunePattern = generateDunePattern();
    generateInterfaceSprites(this.uiSprites, this.uiMap, this.uiTileW, this.uiTileH, this.uiBaseSize);
    
    this.loadAssets();
    this.loadConfigs();
  }

  private loadConfigs() {
      // 1. Load Presets
      Object.entries(PRESET_CONFIGS).forEach(([key, cfg]) => {
          // Cast cfg to any to avoid "Spread types may only be created from object types" error
          this.spriteConfigs.set(key, { ...DEFAULT_SPRITE_CONFIG, ...(cfg as any) });
      });

      // 2. Load Overrides from Storage
      try {
          const saved = localStorage.getItem('SPRITE_CONFIGS');
          if (saved) {
              const parsed = JSON.parse(saved);
              if (parsed && typeof parsed === 'object') {
                  Object.entries(parsed).forEach(([key, cfg]) => {
                      if (cfg && typeof cfg === 'object') {
                          this.spriteConfigs.set(key, { ...DEFAULT_SPRITE_CONFIG, ...(cfg as any) });
                      }
                  });
              }
          }
      } catch (e) {
          console.error("Failed to load sprite configs", e);
      }
  }

  public getConfig(key: string): SpriteVisualConfig {
      return this.spriteConfigs.get(key) || { ...DEFAULT_SPRITE_CONFIG };
  }

  public setConfig(key: string, config: SpriteVisualConfig) {
      this.spriteConfigs.set(key, config);
      this.saveConfigs();
  }

  private saveConfigs() {
      const obj: Record<string, SpriteVisualConfig> = {};
      this.spriteConfigs.forEach((v, k) => obj[k] = v);
      localStorage.setItem('SPRITE_CONFIGS', JSON.stringify(obj));
  }

  public getAllConfigs(): Map<string, SpriteVisualConfig> {
      return this.spriteConfigs;
  }

  // Helper to extract image source for UI preview
  public getSpriteImageSource(key: string): string | null {
      let img: HTMLImageElement | undefined;

      // Special handling for Animals (Sheet)
      // Check ID explicitly
      if (key.startsWith('RES_')) {
          const id = parseInt(key.replace('RES_', ''));
          
          if (id === ResourceType.MEAT || id === ResourceType.WOOL) {
              if (this.animalSpriteSheet) return this.animalSpriteSheet.src;
          }
          
          img = this.resourceSprites.get(id as ResourceType);
      } 
      else if (key.startsWith('UNIT_')) {
          const id = key.replace('UNIT_', '') as UnitType;
          img = this.unitSprites.get(id);
      } 
      else if (key.startsWith('STR_')) {
          const id = key.replace('STR_', '');
          img = this.structureSprites.get(id);
      }

      return img ? img.src : null;
  }

  // Method A: Auto-Loading Local Assets (Blobs)
  private async loadAssets() {
      // 0. Load Base Tiles
      const baseFiles = ['base_land', 'base_water', 'base_desert'];
      const basePromises = baseFiles.map(async (name) => {
          try {
              const response = await fetch(`/sprites/${name}.png`);
              if (!response.ok) return;
              const blob = await response.blob();
              const img = new Image();
              img.src = URL.createObjectURL(blob);
              await img.decode();
              this.baseSprites.set(name, img);
          } catch (e) {
              // Ignore
          }
      });

      // 0.5 Load Forest Sprites (forest_1 to forest_4)
      const forestPromises = [1, 2, 3, 4].map(async (idx) => {
          try {
              const response = await fetch(`/sprites/forest/forest_${idx}.png`);
              if (!response.ok) return;
              const blob = await response.blob();
              const img = new Image();
              img.src = URL.createObjectURL(blob);
              await img.decode();
              this.forestSprites[idx - 1] = img;
          } catch (e) {
              // Keep fallback
          }
      });

      // 1. Load Atlas
      try {
          const response = await fetch('/terrain_atlas.png');
          if (response.ok) {
              const blob = await response.blob();
              const img = new Image();
              img.src = URL.createObjectURL(blob);
              await img.decode();
              this.externalAtlas = img;
              this.isAtlasLoaded = true;
          }
      } catch (e) {
          this.isAtlasLoaded = false;
      }
      
      // 1.5 Load Animal Sheet
      try {
          const response = await fetch('/sprites/res/sprite_sh.png');
          if (response.ok) {
              const blob = await response.blob();
              const img = new Image();
              img.src = URL.createObjectURL(blob);
              await img.decode();
              this.animalSpriteSheet = img;
          }
      } catch (e) {
          // Ignore
      }

      // 2. Load Specific Sprites (Terrain)
      const terrainFiles: Record<number, string> = {
          [TerrainType.WATER]: 'water',
          [TerrainType.PLAINS]: 'plane',
          [TerrainType.FOREST]: 'forest',
          [TerrainType.HILLS]: 'hills',
          [TerrainType.MOUNTAIN]: 'rock',
          [TerrainType.DESERT]: 'sand',
      };

      const terrainPromises = Object.entries(terrainFiles).map(async ([typeVal, name]) => {
          const type = Number(typeVal) as TerrainType;
          try {
              const response = await fetch(`/sprites/${name}.png`);
              if (!response.ok) return; 
              
              const blob = await response.blob();
              const objectUrl = URL.createObjectURL(blob);
              
              const img = new Image();
              img.src = objectUrl;
              await img.decode(); 
              
              this.loadedSprites.set(type, img);
          } catch (e) {
              // Ignore missing sprites
          }
      });

      // 3. Load Unit Sprites
      const unitFiles: Record<string, string> = {
          [UnitType.ENGINEER]: 'engineer',
          [UnitType.FARMER]: 'farmer',
          [UnitType.MINER]: 'miner',
          [UnitType.PROSPECTOR]: 'prospector',
          [UnitType.RANCHER]: 'rancher',
          [UnitType.FORESTER]: 'forester'
      };

      const unitPromises = Object.entries(unitFiles).map(async ([typeVal, name]) => {
          const type = typeVal as UnitType;
          try {
              const response = await fetch(`/sprites/${name}.png`);
              if (!response.ok) return;
              
              const blob = await response.blob();
              const objectUrl = URL.createObjectURL(blob);
              
              const img = new Image();
              img.src = objectUrl;
              await img.decode();
              
              this.unitSprites.set(type, img);
          } catch (e) {
              // Ignore
          }
      });

      // 4. Load Structure Sprites
      const structureFiles: Record<string, string> = {
          'capital': 'capitol',
          'depot': 'depo',
          'plantation': 'orchard'
      };

      const structurePromises = Object.entries(structureFiles).map(async ([key, name]) => {
          try {
              const response = await fetch(`/sprites/${name}.png`);
              if (!response.ok) return;
              
              const blob = await response.blob();
              const objectUrl = URL.createObjectURL(blob);
              
              const img = new Image();
              img.src = objectUrl;
              await img.decode();
              
              this.structureSprites.set(key, img);
          } catch (e) {
              // Ignore
          }
      });
      
      // 5. Load Resource Sprites
      const resFiles: Record<string, string> = {
          [ResourceType.COAL]: 'coal',
          [ResourceType.GEMS]: 'gems',
          [ResourceType.GOLD]: 'gold',
          [ResourceType.IRON]: 'iron',
          [ResourceType.OIL]: 'oil',
          [ResourceType.WHEAT]: 'wheat',
          [ResourceType.MEAT]: 'meat',
          [ResourceType.FRUIT]: 'fruit',
          [ResourceType.COTTON]: 'cotton'
      };

      const resPromises = Object.entries(resFiles).map(async ([typeVal, name]) => {
          const type = Number(typeVal) as ResourceType;
          try {
              const response = await fetch(`/sprites/res/${name}.png`);
              if (!response.ok) return;
              
              const blob = await response.blob();
              const objectUrl = URL.createObjectURL(blob);
              
              const img = new Image();
              img.src = objectUrl;
              
              this.resourceSprites.set(type, img);
          } catch (e) {
              // Ignore
          }
      });
      
      await Promise.all([
          ...basePromises, ...forestPromises, ...terrainPromises, 
          ...unitPromises, ...structurePromises, ...resPromises
      ]);
  }

  // Method B: User Uploads
  public async uploadSprite(type: TerrainType, file: File): Promise<void> {
      return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = async (e) => {
              if (e.target?.result) {
                  const img = new Image();
                  img.src = e.target.result as string;
                  try {
                      await img.decode();
                      this.loadedSprites.set(type, img);
                      resolve();
                  } catch (err) {
                      reject(err);
                  }
              }
          };
          reader.readAsDataURL(file);
      });
  }

  public getSprite(type: TerrainType): HTMLImageElement | null {
      return this.loadedSprites.get(type) || null;
  }

  public getBaseSprite(type: 'land' | 'water' | 'desert'): HTMLImageElement | null {
      if (type === 'land') return this.baseSprites.get('base_land') || null;
      if (type === 'water') return this.baseSprites.get('base_water') || null;
      if (type === 'desert') return this.baseSprites.get('base_desert') || null;
      return null;
  }

  public getUnitSprite(type: UnitType): HTMLImageElement | null {
      return this.unitSprites.get(type) || null;
  }

  public getStructureSprite(name: string): HTMLImageElement | null {
      return this.structureSprites.get(name) || null;
  }
  
  public getResourceSprite(type: ResourceType): HTMLImageElement | null {
      return this.resourceSprites.get(type) || null;
  }

  public getForestSprite(variant: number): HTMLImageElement | null {
      const idx = Math.max(0, Math.min(3, variant - 1));
      return this.forestSprites[idx] || null;
  }

  public getDunePattern() {
      return this.dunePattern;
  }

  public getSource() {
      return this.isAtlasLoaded && this.externalAtlas ? this.externalAtlas : this.terrainTiles;
  }

  public getSourceDimensions() {
      if (this.isAtlasLoaded && this.externalAtlas) {
          return { w: this.externalAtlas.naturalWidth, h: this.externalAtlas.naturalHeight };
      }
      return { w: this.terrainTiles.width, h: this.terrainTiles.height };
  }

  public getSpriteCoords(type: TerrainType) {
      return this.spriteMap[type];
  }
}
