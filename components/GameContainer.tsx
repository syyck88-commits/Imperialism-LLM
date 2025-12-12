
import React, { useEffect, useRef, useImperativeHandle, forwardRef, useState } from 'react';
import { Game, HoverInfo } from '../core/Game';
import { Unit, UnitType } from '../Entities/Unit';
import { City } from '../Entities/City';
import { ImprovementType, ResourceType, TerrainType } from '../Grid/GameMap';
import { Hex } from '../Grid/HexMath';
import { ProspectFilter } from '../Entities/CivilianUnit';
import { Engineer } from '../Entities/Civilian/Engineer';
import { Loader2 } from 'lucide-react';
import { SpriteVisualConfig, DEFAULT_SPRITE_CONFIG } from '../Renderer/assets/SpriteVisuals';

export interface GameRef {
  resolveTurn: (allocations: Map<ResourceType, number>) => void;
  getTransportOptions: () => Map<ResourceType, number>;
  getSavedTransportAllocations: () => Map<ResourceType, number>;
  getGameWarnings: () => string[];
  buildImprovement: (type: ImprovementType) => void;
  getPotentialYield: (hex: Hex, type: ImprovementType) => Map<ResourceType, number>;
  setPreviewHighlight: (hex: Hex | null) => void;
  getGameStateAnalysis: () => any;
  selectedUnitHex: Hex | null;
  recruitUnit: (type: UnitType) => string;
  disbandSelectedUnit: () => void;
  doUnitAction: (action: string) => string | undefined;
  setCityProduction: (resource: ResourceType, isActive: boolean) => void;
  checkActiveUnits: () => Unit | null;
  centerCameraOn: (unit: Unit) => void;
  selectUnit: (unit: Unit) => void;
  getRealCapital: () => City | null; 
  uploadSprite: (type: TerrainType, file: File) => Promise<void>;
  regenerateDeserts: () => Promise<void>;
  setWindStrength: (val: number) => void;
  // Sprite Configs
  getSpriteConfig: (key: string) => SpriteVisualConfig;
  setSpriteConfig: (key: string, config: SpriteVisualConfig) => void;
  getSpriteSource: (key: string) => string | null;
}

interface GameContainerProps {
  onTurnChange: (turn: number, year: number) => void;
  onSelectionChange: (unit: Unit | null) => void;
  onHoverChange: (info: HoverInfo | null) => void;
  onCapitalUpdate: (city: City) => void;
}

const GameContainer = forwardRef<GameRef, GameContainerProps>(({ onTurnChange, onSelectionChange, onHoverChange, onCapitalUpdate }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);

  // Loading State
  const [loading, setLoading] = useState<{active: boolean, progress: number, msg: string}>({
      active: true,
      progress: 0,
      msg: "Инициализация..."
  });

  useImperativeHandle(ref, () => ({
    resolveTurn: (allocations) => {
      gameRef.current?.resolveTurn(allocations);
    },
    getTransportOptions: () => {
        return gameRef.current?.getTransportOptions() || new Map();
    },
    getSavedTransportAllocations: () => {
        return gameRef.current?.getSavedTransportAllocations() || new Map();
    },
    getGameWarnings: () => {
        return gameRef.current?.getGameWarnings() || [];
    },
    buildImprovement: (type: ImprovementType) => {
      gameRef.current?.buildImprovement(type);
    },
    getPotentialYield: (hex: Hex, type: ImprovementType) => {
      return gameRef.current?.getPotentialYield(hex, type) || new Map();
    },
    setPreviewHighlight: (hex: Hex | null) => {
      gameRef.current?.setPreviewHighlight(hex);
    },
    getGameStateAnalysis: () => {
      return gameRef.current?.getGameStateAnalysis() || {};
    },
    selectedUnitHex: gameRef.current?.selectedUnit?.location || null,
    recruitUnit: (type: UnitType) => {
        return gameRef.current?.recruitUnit(type) || "Ошибка игры";
    },
    disbandSelectedUnit: () => {
        gameRef.current?.disbandSelectedUnit();
    },
    doUnitAction: (action: string) => {
        if (!gameRef.current) return;
        if (action === 'prospect') return gameRef.current.doProspect();
        if (action === 'road') return gameRef.current.doBuildRoad();
        if (action === 'depot') return gameRef.current.doBuildDepot();
        if (action === 'port') return gameRef.current.doBuildPort();
        if (action === 'improve') return gameRef.current.doImproveResource();
        if (action === 'buyland') return gameRef.current.doBuyLand();
        // New actions
        if (action === 'sleep') return gameRef.current.toggleSleep() as unknown as string;
        if (action === 'auto') return gameRef.current.toggleAuto() as unknown as string;
        
        // Filter Actions
        if (action.startsWith('set_filter_')) {
            const filter = action.replace('set_filter_', '') as ProspectFilter;
            gameRef.current.setProspectorFilter(filter);
            return;
        }

        if (action.startsWith('set_res_filter_')) {
            const val = action.replace('set_res_filter_', '');
            const filter = val === 'ALL' ? 'ALL' : parseInt(val) as ResourceType;
            gameRef.current.setImproverFilter(filter);
            return;
        }

        if (action.startsWith('set_eng_priority_')) {
            const val = action.replace('set_eng_priority_', '');
            gameRef.current.setEngineerPriority(val);
            return;
        }

        if (action.startsWith('set_eng_terrain_')) {
            const val = action.replace('set_eng_terrain_', '');
            gameRef.current.setEngineerTerrain(val);
            return;
        }

        if (action === 'toggle_advice') {
            const u = gameRef.current.selectedUnit;
            if (u && u.type === UnitType.ENGINEER) {
                (u as Engineer).toggleHeedAdvice();
                // Trigger React Update
                onSelectionChange(Object.assign(Object.create(Object.getPrototypeOf(u)), u));
            }
            return;
        }

        return undefined;
    },
    setCityProduction: (resource: ResourceType, isActive: boolean) => {
        gameRef.current?.setCityProduction(resource, isActive);
    },
    checkActiveUnits: () => {
        return gameRef.current?.checkActiveUnits() || null;
    },
    centerCameraOn: (unit: Unit) => {
        gameRef.current?.centerCameraOn(unit);
    },
    selectUnit: (unit: Unit) => {
        gameRef.current?.selectUnit(unit);
    },
    getRealCapital: () => {
        return gameRef.current?.cities[0] || null;
    },
    uploadSprite: async (type: TerrainType, file: File) => {
        if (gameRef.current) {
            await gameRef.current.mapRenderer.assets.uploadSprite(type, file);
        }
    },
    regenerateDeserts: async () => {
        if (gameRef.current) {
            await gameRef.current.regenerateDeserts();
        }
    },
    setWindStrength: (val: number) => {
        if (gameRef.current) {
            gameRef.current.setWindStrength(val);
        }
    },
    getSpriteConfig: (key: string) => {
        if (gameRef.current) return gameRef.current.mapRenderer.assets.getConfig(key);
        return DEFAULT_SPRITE_CONFIG;
    },
    setSpriteConfig: (key: string, config: SpriteVisualConfig) => {
        if (gameRef.current) gameRef.current.mapRenderer.assets.setConfig(key, config);
    },
    getSpriteSource: (key: string) => {
        if (gameRef.current) return gameRef.current.mapRenderer.assets.getSpriteImageSource(key);
        return null;
    }
  }));

  // Initialize Game on Mount
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    // Set initial size
    canvasRef.current.width = containerRef.current.clientWidth;
    canvasRef.current.height = containerRef.current.clientHeight;

    // Instantiate the Game Engine
    const game = new Game(canvasRef.current, {
      onTurnChange: (t, y) => onTurnChange(t, y),
      onSelectionChange: (u) => onSelectionChange(u),
      onHoverChange: (info) => onHoverChange(info),
      onCapitalUpdate: (c) => onCapitalUpdate(c),
      onLoading: (progress, msg) => {
          setLoading({
              active: progress < 100,
              progress,
              msg
          });
      }
    });
    
    gameRef.current = game;
    // Note: game.start() is now called internally by game.init() after loading is complete

    // Handle Window Resize
    const handleResize = () => {
      if (containerRef.current && canvasRef.current && gameRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        canvasRef.current.width = clientWidth;
        canvasRef.current.height = clientHeight;
        gameRef.current.resize(clientWidth, clientHeight);
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      game.destroy();
      gameRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={containerRef} className="w-full h-full relative bg-slate-900 overflow-hidden select-none">
      <canvas
        ref={canvasRef}
        className="block outline-none cursor-crosshair"
        onContextMenu={(e) => e.preventDefault()}
        tabIndex={0}
      />
      
      {/* Loading Overlay */}
      {loading.active && (
          <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-[#0f172a] text-amber-100 animate-in fade-in duration-500">
              <div className="mb-8 text-4xl font-bold tracking-[0.2em] text-amber-500 drop-shadow-[0_0_10px_rgba(245,158,11,0.5)]">
                  ИМПЕРИАЛИЗМ
              </div>
              
              <div className="w-80 h-3 bg-slate-800 rounded-full overflow-hidden border border-slate-700 shadow-inner">
                  <div 
                      className="h-full bg-amber-600 transition-all duration-300 ease-out shadow-[0_0_10px_rgba(245,158,11,0.3)]"
                      style={{ width: `${loading.progress}%` }}
                  />
              </div>
              
              <div className="mt-4 text-sm text-slate-400 font-mono flex items-center gap-3">
                  {loading.progress < 100 && <Loader2 className="animate-spin text-amber-500" size={16} />}
                  <span>{loading.msg}</span>
                  <span className="text-slate-600">|</span>
                  <span className="text-amber-200">{Math.floor(loading.progress)}%</span>
              </div>
          </div>
      )}

      {/* Overlay UI Layer (Only visible when loaded) */}
      {!loading.active && (
        <div className="absolute top-4 right-4 pointer-events-none animate-in fade-in duration-1000">
            <div className="bg-black/50 p-2 rounded text-xs text-white backdrop-blur-sm border border-white/10">
            <p>WASD - Камера</p>
            <p>ЛКМ - Выбор</p>
            <p>ПКМ - Действие</p>
            <p>Колесо - Зум</p>
            <p>Пробел - Завершить ход</p>
            </div>
        </div>
      )}
    </div>
  );
});

export default GameContainer;
