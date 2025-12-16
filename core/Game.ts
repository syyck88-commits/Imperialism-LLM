
import { GameLoop } from './GameLoop';
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
import { ActionSystem } from './systems/ActionSystem';
import { SimulationSystem } from './systems/SimulationSystem';

import { WebGLContext, GPUResourceRegistry } from '../Renderer/core/Core';
// Fix: Import `ChunkLayer` to resolve 'Cannot find name' error.
import { ChunkLayer } from '../Renderer/chunks/Chunks';

import { QualityManager } from './quality/QualityManager';

export interface HoverInfo {
  hex: Hex;
  tileData: TileData | null;
  yields: Map<ResourceType, number> | null;
  isConnected: boolean;
}

export class Game {
  private canvas: HTMLCanvasElement;
  private overlayCanvas: HTMLCanvasElement | null;
  private overlayCtx: CanvasRenderingContext2D | null = null;
  
  private drawingContext: WebGLContext;
  private loop: GameLoop;
  
  public map: GameMap;
  public mapRenderer: MapRenderer;
  public transportNetwork: TransportNetwork;
  public input: CameraInput;
  public pathfinder: Pathfinder;
  
  public cityManager: CityManager;
  public unitManager: UnitManager;
  public actions: ActionSystem;

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
  
  private stateCallback?: any;

  // Loading State
  private loadingCallback?: (pct: number, msg: string) => void;
  public isReady: boolean = false;
  
  // Context Management
  private isContextLost: boolean = false;

  // Quality Manager
  private qualityManager: QualityManager;

  constructor(canvas: HTMLCanvasElement, overlayCanvas: HTMLCanvasElement | null, callback?: any) {
    this.canvas = canvas;
    this.overlayCanvas = overlayCanvas;
    
    if (this.overlayCanvas) {
        this.overlayCtx = this.overlayCanvas.getContext('2d');
    }

    this.qualityManager = QualityManager.getInstance();
    this.windStrength = this.qualityManager.getSettings().enableWindAnimation ? 0.5 : 0;
    this.qualityManager.addListener(settings => {
        this.windStrength = settings.enableWindAnimation ? 0.5 : 0;
    });

    this.stateCallback = callback;
    this.loadingCallback = callback?.onLoading;

    // Initialize Abstraction Layer for Rendering - WebGL Only
    try {
        this.drawingContext = new WebGLContext(canvas);
        console.log("Game running in WebGL mode");
    } catch (e) {
        console.error("WebGL Initialization failed. This application requires WebGL.", e);
        // In a real app, you'd show a user-friendly error message here.
        alert("Ошибка: WebGL не поддерживается или отключен. Игра не может быть запущена.");
        throw new Error("WebGL context creation failed.");
    }

    // Attach Context Events
    this.canvas.addEventListener('webglcontextlost', this.handleContextLost.bind(this), false);
    this.canvas.addEventListener('webglcontextrestored', this.handleContextRestored.bind(this), false);

    this.camera.width = canvas.width;
    this.camera.height = canvas.height;

    this.map = new GameMap(100, 100);
    this.transportNetwork = new TransportNetwork(this.map); 
    
    // Set hexSize to match 128px width: width = size * sqrt(3) => size = 128 / sqrt(3)
    this.mapRenderer = new MapRenderer(this.map, 128 / Math.sqrt(3));
    if (this.overlayCtx) {
        this.mapRenderer.setOverlayContext(this.overlayCtx);
    }

    this.pathfinder = new Pathfinder(this.map);
    
    this.cityManager = new CityManager(this.map, this.transportNetwork);
    this.unitManager = new UnitManager(this.map, this.pathfinder);
    
    // Initialize Systems
    this.actions = new ActionSystem(this);

    // Input listeners
    this.input = new CameraInput(this, this.canvas);
    this.loop = new GameLoop(this.update.bind(this), this.render.bind(this));

    this.init();
  }

  // --- Context Handling ---

  private handleContextLost(e: Event) {
      e.preventDefault(); // Required to allow restoration
      console.warn("Game: WebGL Context Lost!");
      this.isContextLost = true;
      this.mapRenderer.onContextLost();
  }

  private handleContextRestored(e: Event) {
      console.log("Game: WebGL Context Restored!");
      this.isContextLost = false;
      
      const newCtx = this.canvas.getContext('webgl2') || this.canvas.getContext('webgl');
      if (newCtx) {
          // Re-initialize systems with new context
          this.mapRenderer.setContext(newCtx as WebGLRenderingContext | WebGL2RenderingContext);
          this.mapRenderer.chunkManager.invalidateAll(ChunkLayer.BASE);
          this.mapRenderer.chunkManager.invalidateAll(ChunkLayer.INFRA);
      }
  }

  // --- Clone and Simulation Logic ---

  /**
   * Creates a deep clone of the game via the Simulation System.
   * Useful for AI planning or "What If" scenarios.
   */
  public cloneDeep(): Game {
      return SimulationSystem.createDeepClone(this);
  }

  public simulateTurn(unitActions: {unitId: string, action: string}[]): any {
      return SimulationSystem.simulateTurn(this, unitActions);
  }

  // --- Initialization ---

  private async init() {
    this.reportLoading(0, "Анализ карты...");
    
    // Ensure WebGL context is passed to MapRenderer/AssetManager before heavy loading starts.
    // This fixes the race condition where assets load and try to create atlas before context is ready.
    const nativeCtx = this.drawingContext.getNativeContext();
    if (nativeCtx instanceof WebGLRenderingContext || nativeCtx instanceof WebGL2RenderingContext) {
        this.mapRenderer.setContext(nativeCtx);
    }

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
    this.drawingContext.resize(width, height);
    if (this.overlayCanvas) {
        this.overlayCanvas.width = width;
        this.overlayCanvas.height = height;
    }
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

  // --- Getters & Proxies ---

  public get cities(): City[] { return this.cityManager.cities; }
  public get units(): Unit[] { return this.unitManager.units; }
  public get selectedUnit(): Unit | null { return this.unitManager.selectedUnit; }
  public get selectedHex(): Hex | null { return this.unitManager.selectedHex; }

  public getVRAMStats(): string {
      return GPUResourceRegistry.getInstance().toDebugString();
  }

  // Action Proxies (Delegated to ActionSystem)
  public recruitUnit(type: UnitType): string {
      return this.actions.recruitUnit(type);
  }

  public disbandSelectedUnit() {
      this.actions.disbandSelectedUnit();
  }

  public setCityProduction(resource: ResourceType, isActive: boolean) {
      this.actions.setCityProduction(resource, isActive);
  }

  public doUnitAction(action: string) {
      return this.actions.doUnitAction(action);
  }

  public doProspect() { return this.actions.doProspect(); }
  public doBuildRoad() { return this.actions.doBuildRoad(); }
  public doBuildDepot() { return this.actions.doBuildDepot(); }
  public doBuildPort() { return this.actions.doBuildPort(); }
  public doImproveResource() { return this.actions.doImproveResource(); }
  public doBuyLand() { return this.actions.doBuyLand(); }
  
  public buildImprovement(type: ImprovementType) {
      this.actions.buildImprovement(type);
  }

  // --- State & UI Interaction ---

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

  public getGameStateAnalysis(): any {
      return analyzeGameState(this.map, this.cities, this.units, this.year);
  }

  public getGameWarnings(): string[] {
      this.transportNetwork.update();
      return getStrategicAdvice(this.map, this.cities, this.transportNetwork);
  }

  // --- Exposed Callbacks for Sub-Systems ---

  public triggerCapitalUpdate() {
      if (this.stateCallback && this.cities.length > 0) {
          this.stateCallback.onCapitalUpdate(this.cities[0]);
      }
  }
  
  public triggerSelectionUpdate() {
      if (this.stateCallback) this.stateCallback.onSelectionChange(this.selectedUnit);
  }

  // --- Main Loop ---

  public start() {
    this.loop.start();
  }

  public stop() {
    this.loop.stop();
  }

  public destroy() {
      this.stop();
      this.input.dispose();
      this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
      this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
  }

  private update(deltaTime: number) {
    if (this.isContextLost) return;
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
        const fps = (this.frameCount * 1000) / this.fpsTimeAccumulator;
        
        // Feed to QualityManager for auto-adaptation
        this.qualityManager.onFrame(deltaTime, fps);

        const fpsEl = document.getElementById('debug-fps');
        if (fpsEl) fpsEl.innerText = Math.round(fps).toString();
        
        const entEl = document.getElementById('debug-entities');
        if (entEl) entEl.innerText = (this.cities.length + this.units.length).toString();

        this.frameCount = 0;
        this.fpsTimeAccumulator = 0;
    }
  }

  private render() {
    // Handle Context Lost State
    if (this.isContextLost) {
        if (this.overlayCtx && this.overlayCanvas) {
            this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
            this.overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            this.overlayCtx.fillRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
            this.overlayCtx.font = '24px sans-serif';
            this.overlayCtx.fillStyle = 'white';
            this.overlayCtx.textAlign = 'center';
            this.overlayCtx.fillText("GPU context lost, restoring...", this.overlayCanvas.width/2, this.overlayCanvas.height/2);
        }
        return;
    }

    // Clear screen using abstraction layer
    this.drawingContext.clear('#0f172a');
    
    // Clear overlay if exists
    if (this.overlayCtx && this.overlayCanvas) {
        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    }

    if (!this.isReady) return;

    // Pass the raw context (Canvas2D or WebGL) to the map renderer
    this.mapRenderer.render(
        this.drawingContext.getNativeContext(), 
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
        // Pass context here too if MapRenderer exposes drawHighlight separately
        // The OverlayDrawer inside will handle choosing correct context
        this.mapRenderer.drawHighlight(this.drawingContext.getNativeContext(), this.camera, this.hoveredHex);
    }
  }
}
