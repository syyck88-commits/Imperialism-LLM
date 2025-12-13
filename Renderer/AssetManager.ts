
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
import { unzip } from 'fflate';

export class AssetManager {
  private readonly ATLAS_COLS = 3;
  private readonly ATLAS_ROWS = 2;

  public terrainTiles: HTMLCanvasElement;
  public uiSprites: HTMLCanvasElement; 
  public externalAtlas: HTMLImageElement | null = null;
  public animalSpriteSheet: HTMLImageElement | null = null;
  public isAtlasLoaded: boolean = false;
  
  // PAK File Storage
  private fileMap: Map<string, string> = new Map();

  // Static Cache to prevent re-downloading/unzipping on React re-renders
  private static globalFileMap: Map<string, string> = new Map();
  private static globalLoadPromise: Promise<void> | null = null;

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
      
      // Notify listeners (ChunkManager) that visual config changed
      window.dispatchEvent(new CustomEvent('SPRITE_CONFIG_CHANGED', { detail: { key } }));
  }

  private saveConfigs() {
      const obj: Record<string, SpriteVisualConfig> = {};
      this.spriteConfigs.forEach((v, k) => obj[k] = v);
      localStorage.setItem('SPRITE_CONFIGS', JSON.stringify(obj));
  }

  public getAllConfigs(): Map<string, SpriteVisualConfig> {
      return this.spriteConfigs;
  }

  public getSpriteImageSource(key: string): string | null {
      let img: HTMLImageElement | undefined;

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

  // --- PAK Loading Logic ---

  private async unpackSprites() {
      // 1. Check Static Cache first (Fastest)
      if (AssetManager.globalFileMap.size > 0) {
          console.log("Using cached sprites.pak data.");
          this.fileMap = new Map(AssetManager.globalFileMap);
          return;
      }

      // 2. Check if already loading (prevent parallel downloads)
      if (AssetManager.globalLoadPromise) {
          console.log("Waiting for sprites.pak download...");
          await AssetManager.globalLoadPromise;
          this.fileMap = new Map(AssetManager.globalFileMap);
          return;
      }

      // 3. Start Loading
      AssetManager.globalLoadPromise = (async () => {
          try {
              console.log("Downloading and unpacking sprites.pak...");
              const response = await fetch('/sprites.pak');
              if (!response.ok) {
                  // Silent fallback if missing
                  return;
              }
              
              const buffer = await response.arrayBuffer();
              const data = new Uint8Array(buffer);
              
              const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
                  unzip(data, (err, unzipped) => {
                      if (err) return reject(err);
                      resolve(unzipped);
                  });
              });
              
              let count = 0;
              for (const [filename, content] of Object.entries(files)) {
                  // Normalize path: strip 'sprites/' prefix if present
                  const cleanName = filename.replace(/^sprites\//, '');
                  
                  if (cleanName.endsWith('.png')) {
                      const blob = new Blob([content], { type: 'image/png' });
                      const url = URL.createObjectURL(blob);
                      AssetManager.globalFileMap.set(cleanName, url);
                      count++;
                  }
              }
              console.log(`Unpacked ${count} sprites from sprites.pak to Global Cache`);
          } catch (e) {
              console.warn("Failed to load/unpack sprites.pak, falling back to procedural/individual loading.", e);
          }
      })();

      await AssetManager.globalLoadPromise;
      this.fileMap = new Map(AssetManager.globalFileMap);
  }

  private async fetchImage(path: string): Promise<HTMLImageElement | null> {
      let url = this.fileMap.get(path);
      
      // Fallback for cases where zip might not be flat
      if (!url && !path.startsWith('sprites/')) {
           url = this.fileMap.get(`sprites/${path}`);
      }

      if (!url) {
          // If NOT found in PAK, try fetching normally (maybe it's external, like terrain_atlas)
          // But only if it looks like a relative root path
          if (path.startsWith('/')) {
              try {
                  const response = await fetch(path);
                  if (response.ok) {
                      const blob = await response.blob();
                      url = URL.createObjectURL(blob);
                  }
              } catch (e) { return null; }
          }
      }

      if (!url) return null;

      return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = url!;
      });
  }

  // Method A: Auto-Loading Assets (from PAK or Fetch)
  private async loadAssets() {
      await this.unpackSprites();

      // 0. Load Base Tiles
      const baseFiles = ['base_land', 'base_water', 'base_desert'];
      const basePromises = baseFiles.map(async (name) => {
          const img = await this.fetchImage(`${name}.png`);
          if (img) this.baseSprites.set(name, img);
      });

      // 0.5 Load Forest Sprites (forest_1 to forest_4)
      const forestPromises = [1, 2, 3, 4].map(async (idx) => {
          const img = await this.fetchImage(`forest/forest_${idx}.png`);
          if (img) this.forestSprites[idx - 1] = img;
      });

      // 1. Load Atlas (Root file, likely not in PAK or if yes, handled by fetchImage)
      // Note: fetchImage handles absolute paths via fetch fallback
      const atlasImg = await this.fetchImage('/terrain_atlas.png');
      if (atlasImg) {
          this.externalAtlas = atlasImg;
          this.isAtlasLoaded = true;
      }
      
      // 1.5 Load Animal Sheet (in sprites/res)
      const animalImg = await this.fetchImage('res/sprite_sh.png');
      if (animalImg) {
          this.animalSpriteSheet = animalImg;
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
          const img = await this.fetchImage(`${name}.png`);
          if (img) this.loadedSprites.set(type, img);
      });

      // 3. Load Unit Sprites
      const unitFiles: Record<string, string> = {
          [UnitType.ENGINEER]: 'units/engineer',
          [UnitType.FARMER]: 'units/farmer',
          [UnitType.MINER]: 'units/miner',
          [UnitType.PROSPECTOR]: 'units/prospector',
          [UnitType.RANCHER]: 'units/rancher',
          [UnitType.FORESTER]: 'units/forester',
          [UnitType.SOLDIER]: 'units/soldier',
          [UnitType.DRILLER]: 'units/oilman'
      };

      const unitPromises = Object.entries(unitFiles).map(async ([typeVal, name]) => {
          const type = typeVal as UnitType;
          const img = await this.fetchImage(`${name}.png`);
          if (img) this.unitSprites.set(type, img);
      });

      // 4. Load Structure Sprites
      const structureFiles: Record<string, string> = {
          'capital': 'capitol',
          'depot': 'depo',
          'plantation': 'orchard', // Generic fallback
          
          'farm': 'res_build/wheat',
          'mine': 'res_build/mine',
          'lumber_mill': 'res_build/forester_hatch',
          'oil_well': 'res_build/oil_drill',
          'port': 'res_build/port',
          'plantation_cotton': 'res_build/cotton',
          'plantation_fruit': 'res_build/fruit',
          
          'ranch_wool': 'res_build/wool',
          'ranch_livestock': 'res_build/live_stock'
      };

      const structurePromises = Object.entries(structureFiles).map(async ([key, name]) => {
          const img = await this.fetchImage(`${name}.png`);
          if (img) this.structureSprites.set(key, img);
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
          const img = await this.fetchImage(`res/${name}.png`);
          if (img) this.resourceSprites.set(type, img);
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
