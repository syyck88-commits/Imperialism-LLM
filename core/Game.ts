


import { GameLoop } from './GameLoop';
import { World } from './ECS';
import { GameMap, ImprovementType, TerrainType, TileData, ResourceType } from '../Grid/GameMap';
import { MapRenderer } from '../Renderer/MapRenderer';
import { CameraInput } from '../Input/CameraInput';
import { Hex, getHexNeighbors, areHexesEqual, hexToString } from '../Grid/HexMath';
import { TransportNetwork } from '../Logistics/TransportNetwork';
import { City } from '../Entities/City';
import { Unit, UnitType } from '../Entities/Unit';
import { Pathfinder } from '../Grid/Pathfinding';
import { analyzeGameState, getStrategicAdvice } from './AIAnalysis';
import { ISO_FACTOR } from '../Renderer/RenderUtils';

import { CityManager } from './managers/CityManager';
import { UnitManager } from './managers/UnitManager';
import { HoverInfo, GameStateCallback } from './Types';
export { HoverInfo, GameStateCallback };

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private loop: GameLoop;
  public world: World; 
  
  public map: GameMap;
  public mapRenderer: MapRenderer;
  public transportNetwork: TransportNetwork;
  public input: CameraInput;
  public pathfinder: Pathfinder;
  
  public cityManager: CityManager;
  public unitManager: UnitManager;

  public technologies: Set<string> = new Set(['Basic Tools']);

  public turn: number = 1;
  public year: number = 1815;
  
  public previewHighlightHex: Hex | null = null;
  public isExternalPreviewActive: boolean = false;

  // Animation State
  public windStrength: number = 0.5;
  public time: number = 0;
  
  // Debug / FPS Stats
  private fpsTimeAccumulator: number = 0;
  private frameCount: number = 0;
  
  public camera = {
    x: 0, 
    y: 0,
    width: 800,
    height: 600,
    zoom: 1.0 
  };

  public hoveredHex: Hex | null = null;
  private lastHoveredHex: Hex | null = null;
  
  private stateCallback?: GameStateCallback;

  // Loading State
  private loadingCallback?: (pct: number, msg: string) => void;
  public isReady: boolean = false;

  constructor(canvas: HTMLCanvasElement, callback?: GameStateCallback) {
    this.canvas = canvas;
    this.stateCallback = callback;
    this.loadingCallback = callback?.onLoading;

    const context = canvas.getContext('2d');
    if (!context) throw new Error("Could not get 2D context");
    this.ctx = context;

    this.camera.width = canvas.width;
    this.camera.height = canvas.height;

    this.world = new World();
    this.map = new GameMap(100, 100);
    this.transportNetwork = new TransportNetwork(this.map); 
    // Set hexSize to match 128px width: width = size * sqrt(3) => size = 128 / sqrt(3)
    this.mapRenderer = new MapRenderer(this.map, 128 / Math.sqrt(3));
    this.pathfinder = new Pathfinder(this.map);
    
    this.cityManager = new CityManager(this.map, this.transportNetwork);
    this.unitManager = new UnitManager(this.map, this.pathfinder);

    this.input = new CameraInput(this, this.canvas);
    this.loop = new GameLoop(this.update.bind(this), this.render.bind(this));

    this.init();
  }

  private async init() {
    this.reportLoading(0, "Анализ карты...");
    
    this.transportNetwork.findAndSetCapital();
    this.spawnInitialEntities();

    // Async initialization of renderer (heavy erosion calc)
    await this.mapRenderer.initializeTerrain(this.reportLoading.bind(this));

    let targetX = 0;
    let targetY = 0;

    if (this.cityManager.cities.length > 0) {
        const c = this.cityManager.cities[0];
        const point = this.getHexPixelPos(c.location);
        targetX = point.x;
        targetY = point.y;
    } else {
        const centerQ = Math.floor(this.map.width / 2);
        const centerR = Math.floor(this.map.height / 2);
        const q = centerQ - (centerR - (centerR & 1)) / 2;
        const point = this.getHexPixelPos({q, r: centerR});
        targetX = point.x;
        targetY = point.y;
    }

    this.camera.x = targetX - (this.camera.width / 2);
    this.camera.y = targetY - (this.camera.height / 2);
    
    this.reportLoading(100, "Готово!");
    this.isReady = true;
    this.triggerCapitalUpdate();
    
    // Auto-start loop when ready
    this.start();
  }

  private reportLoading(pct: number, msg: string) {
      if (this.loadingCallback) {
          this.loadingCallback(pct, msg);
      }
  }

  public async regenerateDeserts() {
      this.isReady = false;
      this.reportLoading(0, "Перестройка ландшафта...");
      await this.mapRenderer.regenerateTerrain(this.reportLoading.bind(this));
      this.isReady = true;
      this.reportLoading(100, "Готово!");
  }

  public resize(width: number, height: number) {
    this.camera.width = width;
    this.camera.height = height;
  }

  private getHexPixelPos(hex: Hex): {x: number, y: number} {
     const hexSize = this.mapRenderer.hexSize;
     const x = hexSize * Math.sqrt(3) * (hex.q + hex.r/2);
     // Apply Isometric factor here as well
     const y = (hexSize * 1.5 * hex.r) * ISO_FACTOR;
     return {x, y};
  }

  private spawnInitialEntities() {
      let capitalHex: Hex | null = null;

      for(let r=0; r<this.map.height; r++) {
          for(let c=0; c<this.map.width; c++) {
             const q = c - (r - (r&1)) / 2;
             const tile = this.map.getTile(q, r);
             if (tile?.improvement === ImprovementType.CITY) {
                 capitalHex = { q, r };
                 break;
             }
          }
          if (capitalHex) break;
      }

      if (capitalHex) {
          this.cityManager.spawnCapital(capitalHex);
          this.unitManager.spawnInitialUnits(capitalHex);
      }
  }

  public get cities(): City[] { return this.cityManager.cities; }
  public get units(): Unit[] { return this.unitManager.units; }
  public get selectedUnit(): Unit | null { return this.unitManager.selectedUnit; }
  public get selectedHex(): Hex | null { return this.unitManager.selectedHex; }

  public recruitUnit(type: UnitType): string {
      if (this.cityManager.cities.length === 0) return "Нет столицы.";
      const msg = this.unitManager.recruitUnit(type, this.cityManager.cities[0], this.turn, this.technologies);
      this.triggerCapitalUpdate();
      return msg;
  }

  public disbandSelectedUnit() {
      this.unitManager.disbandSelectedUnit(this.cityManager.capital);
      if (this.stateCallback) {
          this.stateCallback.onSelectionChange(null);
          this.triggerCapitalUpdate();
      }
  }

  public setCityProduction(resource: ResourceType, isActive: boolean) {
      this.cityManager.setProduction(resource, isActive);
      this.triggerCapitalUpdate();
  }

  public getTransportOptions(): Map<ResourceType, number> {
      return this.cityManager.getTransportOptions();
  }

  public getSavedTransportAllocations(): Map<ResourceType, number> {
      return this.cityManager.getCapitalTransportSettings();
  }

  public toggleSleep() {
      this.unitManager.toggleSleep();
      if (this.stateCallback) this.stateCallback.onSelectionChange(this.selectedUnit);
  }

  public toggleAuto() {
      this.unitManager.toggleAuto(this.cityManager.capital, this.technologies);
      if (this.stateCallback) this.stateCallback.onSelectionChange(this.selectedUnit);
  }

  public setProspectorFilter(filter: any) {
      this.unitManager.setProspectorFilter(filter);
      if (this.stateCallback) this.stateCallback.onSelectionChange(this.selectedUnit);
  }

  public setImproverFilter(filter: ResourceType | 'ALL') {
      this.unitManager.setImproverFilter(filter);
      if (this.stateCallback) this.stateCallback.onSelectionChange(this.selectedUnit);
  }

  public setEngineerPriority(priorityVal: string) {
      this.unitManager.setEngineerPriority(priorityVal);
      if (this.stateCallback) this.stateCallback.onSelectionChange(this.selectedUnit);
  }

  public setEngineerTerrain(terrainVal: string) {
      this.unitManager.setEngineerTerrain(terrainVal);
      if (this.stateCallback) this.stateCallback.onSelectionChange(this.selectedUnit);
  }

  public setWindStrength(val: number) {
      this.windStrength = Math.max(0, Math.min(2.0, val));
  }

  public findNextActiveUnit(): Unit | null {
      return this.unitManager.findNextActiveUnit();
  }

  public checkActiveUnits(): Unit | null {
      return this.findNextActiveUnit();
  }

  public centerCameraOn(unit: Unit) {
      const pos = this.getHexPixelPos(unit.location);
      this.camera.x = pos.x - (this.camera.width / (2 * this.camera.zoom));
      this.camera.y = pos.y - (this.camera.height / (2 * this.camera.zoom));
  }

  public resolveTurn(shippedGoods: Map<ResourceType, number>) {
    this.turn++;
    this.year += 1;
    
    this.transportNetwork.update();
    this.cityManager.processTurn(shippedGoods);

    this.unitManager.processTurn(this.cityManager.capital, this.technologies, this.transportNetwork);

    if (this.stateCallback) {
      this.stateCallback.onTurnChange(this.turn, this.year);
      this.stateCallback.onSelectionChange(this.selectedUnit); 
      this.triggerCapitalUpdate();
    }
  }

  public getGatheredResources(hex: Hex, type: ImprovementType): Map<ResourceType, number> {
      return this.cityManager.getGatheredResources(hex, type);
  }

  public getPotentialYield(hex: Hex, type: ImprovementType): Map<ResourceType, number> {
      return this.getGatheredResources(hex, type);
  }

  public selectUnitAt(hex: Hex) {
    this.unitManager.selectUnitAt(hex);
    if (this.stateCallback) this.stateCallback.onSelectionChange(this.selectedUnit);
  }
  
  public selectUnit(unit: Unit) {
      this.unitManager.selectUnit(unit);
      if (this.stateCallback) this.stateCallback.onSelectionChange(this.selectedUnit);
  }

  public setPreviewHighlight(hex: Hex | null) {
      this.previewHighlightHex = hex;
      this.isExternalPreviewActive = !!hex; 
  }

  public moveSelectedUnit(targetHex: Hex) {
    this.unitManager.moveSelectedUnit(targetHex);
    if (this.stateCallback) this.stateCallback.onSelectionChange(this.selectedUnit);
  }

  public doProspect() {
      const msg = this.unitManager.doProspect();
      this.triggerSelectionUpdate();
      return msg;
  }

  public doBuildRoad() {
      if (this.cities.length === 0) return;
      const msg = this.unitManager.doBuildRoad(this.cities[0]);
      this.transportNetwork.markDirty();
      this.triggerSelectionUpdate();
      this.triggerCapitalUpdate(); 
      return msg;
  }

  public doBuildDepot() {
      if (this.cities.length === 0) return;
      const msg = this.unitManager.doBuildDepot(this.cities[0]);
      this.transportNetwork.markDirty();
      this.triggerSelectionUpdate();
      this.triggerCapitalUpdate();
      return msg;
  }

  public doBuildPort() {
      if (this.cities.length === 0) return;
      const msg = this.unitManager.doBuildPort(this.cities[0]);
      this.transportNetwork.markDirty();
      this.triggerSelectionUpdate();
      this.triggerCapitalUpdate();
      return msg;
  }

  public doImproveResource() {
      const msg = this.unitManager.doImproveResource(this.technologies);
      this.triggerSelectionUpdate();
      return msg;
  }
  
  public doBuyLand() {
      if (this.cities.length === 0) return;
      const msg = this.unitManager.doBuyLand(this.cities[0]);
      this.triggerSelectionUpdate();
      this.triggerCapitalUpdate();
      return msg;
  }
  
  public buildImprovement(type: ImprovementType) {
      if (this.cities.length > 0) {
          this.unitManager.buildImprovement(type, this.cities[0]);
          this.transportNetwork.markDirty();
          this.triggerSelectionUpdate();
      }
  }

  public getGameStateAnalysis(): any {
      return analyzeGameState(this.map, this.cities, this.units, this.year);
  }

  public getGameWarnings(): string[] {
      this.transportNetwork.update();
      return getStrategicAdvice(this.map, this.cities, this.transportNetwork);
  }

  private triggerCapitalUpdate() {
      if (this.stateCallback && this.cities.length > 0) {
          this.stateCallback.onCapitalUpdate(this.cities[0]);
      }
  }
  
  private triggerSelectionUpdate() {
      if (this.stateCallback) this.stateCallback.onSelectionChange(this.selectedUnit);
  }

  public start() {
    this.loop.start();
  }

  public stop() {
    this.loop.stop();
  }

  public destroy() {
      this.stop();
      this.input.dispose();
  }

  private update(deltaTime: number) {
    if (!this.isReady) return;

    // Accumulate time for animation
    this.time += deltaTime / 1000;

    this.input.update(deltaTime);
    this.unitManager.update(deltaTime);
    this.mapRenderer.update(deltaTime);

    if (this.hoveredHex !== this.lastHoveredHex) {
        this.lastHoveredHex = this.hoveredHex;
        
        this.unitManager.updatePathPreview(this.hoveredHex);

        if (this.stateCallback) {
            if (this.hoveredHex) {
                const tile = this.map.getTile(this.hoveredHex.q, this.hoveredHex.r);
                
                let yields: Map<ResourceType, number> | null = null;
                if (tile) {
                    if (tile.improvement === ImprovementType.CITY || 
                        tile.improvement === ImprovementType.DEPOT || 
                        tile.improvement === ImprovementType.PORT) {
                        yields = this.cityManager.getGatheredResources(this.hoveredHex, tile.improvement);
                    } else if (tile.improvement !== ImprovementType.NONE || (tile.resource !== ResourceType.NONE && !tile.isHidden)) {
                        yields = this.cityManager.getTileYield(this.hoveredHex);
                    }
                }

                const isConnected = this.transportNetwork.isConnectedToCapital(this.hoveredHex);

                this.stateCallback.onHoverChange({ 
                    hex: this.hoveredHex, 
                    tileData: tile,
                    yields,
                    isConnected
                });

                if (!this.isExternalPreviewActive) {
                    if (tile && (tile.improvement === ImprovementType.CITY || 
                                 tile.improvement === ImprovementType.DEPOT || 
                                 tile.improvement === ImprovementType.PORT)) {
                        this.previewHighlightHex = this.hoveredHex;
                    } else {
                        this.previewHighlightHex = null;
                    }
                }

            } else {
                this.stateCallback.onHoverChange(null);
                if (!this.isExternalPreviewActive) {
                    this.previewHighlightHex = null;
                }
            }
        }
    }

    // --- FPS Counter Logic ---
    this.frameCount++;
    this.fpsTimeAccumulator += deltaTime;
    
    // Update display every 500ms
    if (this.fpsTimeAccumulator >= 500) {
        const fps = Math.round((this.frameCount * 1000) / this.fpsTimeAccumulator);
        const fpsEl = document.getElementById('debug-fps');
        if (fpsEl) fpsEl.innerText = fps.toString();
        
        const entEl = document.getElementById('debug-entities');
        if (entEl) entEl.innerText = (this.cities.length + this.units.length).toString();

        this.frameCount = 0;
        this.fpsTimeAccumulator = 0;
    }
  }

  private render() {
    this.ctx.fillStyle = '#0f172a';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (!this.isReady) return;

    this.mapRenderer.render(
        this.ctx, 
        this.camera, 
        this.cities, 
        this.units, 
        this.selectedUnit,
        this.unitManager.validMovesCache,
        this.unitManager.currentPathCache,
        this.previewHighlightHex,
        this.selectedHex,
        this.time,
        this.windStrength
    );

    if (this.hoveredHex) {
        this.mapRenderer.drawHighlight(this.ctx, this.camera, this.hoveredHex);
    }
  }
}
