
import React, { useState, useRef, useEffect } from 'react';
import GameContainer, { GameRef } from './components/GameContainer';
import { TransportModal } from './components/TransportModal';
import { UnitType } from './Entities/Unit';
import { City } from './Entities/City';
import { HoverInfo } from './core/Game';
import { ImprovementType, TerrainType } from './Grid/GameMap';
import Header from './components/UI/Header';
import UnitActionBar from './components/UI/UnitActionBar';
import UniversityModal from './components/UI/UniversityModal';
import AdvisorWidget from './components/UI/AdvisorWidget';
import IndustryModal from './components/UI/IndustryModal';
import AssetModal from './components/UI/AssetModal';
import { useAdvisor } from './hooks/useAdvisor'; 
import { DEFAULT_SPRITE_CONFIG } from './Renderer/assets/SpriteVisuals';
import { Activity, Layers, Database } from 'lucide-react';
import { QualityManager } from './core/quality/QualityManager';

const getLocalResName = (t: number) => {
    const map: Record<number, string> = {
        1:'Пшеница', 2:'Дерево', 3:'Уголь', 4:'Железо', 5:'Золото', 
        6:'Шерсть', 7:'Хлопок', 8:'Фрукты', 9:'Нефть', 10:'Пряности', 
        11:'Самоцветы', 12:'Мясо', 13:'Рыба'
    };
    return map[t] || 'Ресурс';
};

const App: React.FC = () => {
  // Initialize Quality Manager Singleton on App start
  QualityManager.getInstance();

  const gameRef = useRef<GameRef>(null);
  const [turn, setTurn] = useState(1);
  const [year, setYear] = useState(1815);
  const [selectedUnit, setSelectedUnit] = useState<any | null>(null);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const [capital, setCapital] = useState<City | null>(null);
  const [predictedYield, setPredictedYield] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [gameWarnings, setGameWarnings] = useState<string[]>([]);
  const [vramStats, setVramStats] = useState<string>('');

  // --- Initialize Advisor Hook ---
  const advisor = useAdvisor({ gameRef, year });

  // Transport State
  const [showTransport, setShowTransport] = useState(false);
  const [transportOptions, setTransportOptions] = useState<Map<any, number>>(new Map());
  const [savedAllocations, setSavedAllocations] = useState<Map<any, number>>(new Map());

  // Modal States
  const [showUniversity, setShowUniversity] = useState(false);
  const [showIndustry, setShowIndustry] = useState(false);
  const [showAssets, setShowAssets] = useState(false);
  
  // VRAM Stats polling
  useEffect(() => {
    const interval = setInterval(() => {
        if (gameRef.current) {
            const stats = gameRef.current.getVRAMStats();
            setVramStats(stats);
        }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Hotkeys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        // Only trigger end turn if not typing in an input (like advisor chat)
        if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
             return;
        }

        e.preventDefault(); 
        if (!showTransport && !showIndustry && !showUniversity && !showAssets) {
            triggerEndTurnSequence();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showTransport, showIndustry, showUniversity, showAssets]);

  const triggerEndTurnSequence = () => {
      if (!gameRef.current) return;
      
      // Check for unmoved active units
      const nextActive = gameRef.current.checkActiveUnits();
      if (nextActive) {
          gameRef.current.selectUnit(nextActive);
          gameRef.current.centerCameraOn(nextActive);
          setActionMessage("Есть юниты с доступными ходами!");
          setTimeout(() => setActionMessage(null), 2000);
          return;
      }
      
      const options = gameRef.current.getTransportOptions();
      if (options.size > 0) {
          setTransportOptions(options);
          // Fetch previous settings from City via GameRef
          const saved = gameRef.current.getSavedTransportAllocations();
          setSavedAllocations(saved);
          setShowTransport(true);
      } else {
          gameRef.current.resolveTurn(new Map());
      }
  };

  const handleTransportConfirm = (allocations: Map<any, number>) => {
      setShowTransport(false);
      gameRef.current?.resolveTurn(allocations);
  };

  const handleEndTurnClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerEndTurnSequence();
  };

  const handleRecruit = (type: UnitType) => {
      if (!gameRef.current) return;
      const msg = gameRef.current.recruitUnit(type);
      alert(msg); 
      // Force update UI
      if (gameRef.current.getRealCapital) {
          const real = gameRef.current.getRealCapital();
          if (real) updateCapitalState(real);
      }
  };
  
  const handleDisband = () => {
      if (confirm("Распустить юнита? (Вернет 1 Эксперта)")) {
          gameRef.current?.disbandSelectedUnit();
      }
  };

  const handleUnitAction = (action: string) => {
      const msg = gameRef.current?.doUnitAction(action);
      if (msg) {
          setActionMessage(msg);
          setTimeout(() => setActionMessage(null), 3000);
      }
      setPredictedYield(null);
      if (gameRef.current) gameRef.current.setPreviewHighlight(null);
  };

  const handleActionHover = (action: string | null) => {
      if (!gameRef.current || !selectedUnit) return;

      if (!action) {
          setPredictedYield(null);
          gameRef.current.setPreviewHighlight(null);
          return;
      }

      const hex = gameRef.current.selectedUnitHex;
      if (!hex) return;

      let impType = ImprovementType.NONE;
      if (action === 'depot') impType = ImprovementType.DEPOT;
      else if (action === 'port') impType = ImprovementType.PORT;
      else if (action === 'improve') {
          // Guess improvement based on unit type
           if (selectedUnit.type === UnitType.FARMER) impType = ImprovementType.FARM;
           if (selectedUnit.type === UnitType.MINER) impType = ImprovementType.MINE;
           if (selectedUnit.type === UnitType.FORESTER) impType = ImprovementType.LUMBER_MILL;
           if (selectedUnit.type === UnitType.RANCHER) impType = ImprovementType.RANCH;
           if (selectedUnit.type === UnitType.DRILLER) impType = ImprovementType.OIL_WELL;
      }

      if (impType !== ImprovementType.NONE) {
          // Set highlight radius if it's a station
          if (impType === ImprovementType.DEPOT || impType === ImprovementType.PORT) {
              gameRef.current.setPreviewHighlight(hex);
          } else {
              gameRef.current.setPreviewHighlight(null);
          }

          const yields = gameRef.current.getPotentialYield(hex, impType);
          if (yields.size > 0) {
              const parts: string[] = [];
              yields.forEach((amt, type) => parts.push(`${amt} ${getLocalResName(type)}`));
              setPredictedYield(`Ожидаемая добыча: ${parts.join(', ')}`);
          } else {
              setPredictedYield("Нет ресурсов для добычи");
          }
      }
  };

  const updateCapitalState = (c: City) => {
      const copy = Object.assign(Object.create(Object.getPrototypeOf(c)), c);
      setCapital(copy);
      updateWarnings();
  };

  // Safe wrapper for modify city state directly on the engine instance
  const runCityAction = (action: (city: City) => string | undefined) => {
      if (!gameRef.current) return;
      
      const realCity = gameRef.current.getRealCapital && gameRef.current.getRealCapital();
      if (!realCity) return;

      const result = action(realCity);
      
      // Sync UI
      updateCapitalState(realCity);
      
      return result;
  };

  // Upload handler
  const handleSpriteUpload = async (type: TerrainType, file: File) => {
      if (gameRef.current) {
          await gameRef.current.uploadSprite(type, file);
      }
  };
  
  const handleRegenerate = async () => {
      if (gameRef.current) {
          await gameRef.current.regenerateDeserts();
      }
  };

  // Helper for AssetModal & UniversityModal
  const getConfig = (key: string) => gameRef.current?.getSpriteConfig(key) || DEFAULT_SPRITE_CONFIG;
  const setConfig = (key: string, cfg: any) => gameRef.current?.setSpriteConfig(key, cfg);
  const getSpriteSource = (key: string) => gameRef.current?.getSpriteSource(key) || null;

  useEffect(() => {
    // If unit deselected, clear preview
    if (!selectedUnit) {
        setPredictedYield(null);
        if (gameRef.current) gameRef.current.setPreviewHighlight(null);
    }
  }, [selectedUnit]);
  
  // Refresh warnings on turn change or capital update
  const updateWarnings = () => {
      if (gameRef.current) {
          setGameWarnings(gameRef.current.getGameWarnings());
      }
  };

  useEffect(() => {
      updateWarnings();
  }, [turn, capital]);


  return (
    <div className="flex flex-col h-screen w-full bg-slate-900 text-slate-100">
      
      <Header 
        capital={capital}
        hoverInfo={hoverInfo}
        year={year}
        onUniversityClick={() => setShowUniversity(true)}
        onIndustryClick={() => setShowIndustry(true)}
        onEndTurnClick={handleEndTurnClick}
        onAssetsClick={() => setShowAssets(true)}
      />

      {/* Strategic Advisor Panel (Right Side - Static Warnings) */}
      {gameWarnings.length > 0 && (
        <div className="absolute top-24 right-4 w-72 flex flex-col gap-2 pointer-events-none z-40">
          {gameWarnings.map((msg, i) => {
            let bgClass = "bg-slate-800/95 border-slate-600";
            if (msg.includes("🔴")) bgClass = "bg-red-900/90 border-red-500 animate-pulse";
            else if (msg.includes("🟠")) bgClass = "bg-orange-800/90 border-orange-500";
            else if (msg.includes("🟡")) bgClass = "bg-yellow-800/90 border-yellow-500";
            else if (msg.includes("🟢")) bgClass = "bg-emerald-800/90 border-emerald-500";
            else if (msg.includes("⚠️")) bgClass = "bg-amber-800/90 border-amber-500";

            return (
              <div key={i} className={`p-3 rounded-lg shadow-xl border-l-4 text-xs font-medium text-white backdrop-blur-sm ${bgClass} transition-all duration-300 animate-in slide-in-from-right-10 fade-in`}>
                {msg}
              </div>
            );
          })}
        </div>
      )}

      {/* Debug / Performance Overlay (Bottom Right) */}
      <div className="fixed bottom-2 right-2 pointer-events-none z-50 flex flex-col items-end gap-1 opacity-60 hover:opacity-100 transition-opacity">
          <div className="bg-slate-900/90 flex items-center gap-2 px-2 py-1 rounded border border-slate-700 backdrop-blur-sm shadow-sm">
              <Activity size={12} className="text-emerald-500" />
              <div className="font-mono text-[10px] text-emerald-300 font-bold w-12 text-right">
                  FPS: <span id="debug-fps" className="text-white">--</span>
              </div>
          </div>
          <div className="bg-slate-900/90 flex items-center gap-2 px-2 py-1 rounded border border-slate-700 backdrop-blur-sm shadow-sm">
              <Layers size={12} className="text-blue-500" />
              <div className="font-mono text-[10px] text-blue-300 font-bold w-12 text-right">
                  OBJ: <span id="debug-entities" className="text-white">--</span>
              </div>
          </div>
          {vramStats && (
            <div title={vramStats} className="bg-slate-900/90 flex flex-col items-start gap-1 px-2 py-1 rounded border border-slate-700 backdrop-blur-sm shadow-sm max-w-xs">
                <div className="flex items-center gap-2">
                    <Database size={12} className="text-purple-400"/>
                    <div className="font-mono text-[10px] text-purple-300 font-bold text-left whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: vramStats.split('\n')[0] }} />
                </div>
            </div>
          )}
      </div>

      {/* Main Game Area */}
      <main className="flex-1 relative overflow-hidden flex items-center justify-center bg-black">
         <GameContainer 
            ref={gameRef} 
            onTurnChange={(t, y) => { setTurn(t); setYear(y); }}
            onSelectionChange={(u) => {
              setSelectedUnit(u ? Object.assign(Object.create(Object.getPrototypeOf(u)), u) : null);
            }}
            onHoverChange={(info) => {
                setHoverInfo(info);
            }}
            onCapitalUpdate={updateCapitalState}
         />
         
         {/* Advisor Widget (Bottom Left) - Using Hook State */}
         <AdvisorWidget 
            isOpen={advisor.isOpen}
            onOpen={advisor.open}
            onClose={advisor.close}
            chatHistory={advisor.chatHistories[advisor.advisorType]}
            isLoading={advisor.isLoading}
            currentAdvisor={advisor.advisorType}
            onSwitchAdvisor={advisor.setAdvisorType}
            onSendMessage={advisor.sendMessage}
            onClearChat={advisor.clearChat}
         />

         {/* Selection & Actions UI (Bottom Center) */}
         {selectedUnit && (
             <UnitActionBar 
                selectedUnit={selectedUnit}
                predictedYield={predictedYield}
                onAction={handleUnitAction}
                onDisband={handleDisband}
                onHoverAction={handleActionHover}
             />
         )}

         {/* Notifications / Toast Area can go here */}
         {actionMessage && (
             <div className="absolute top-1/4 left-1/2 transform -translate-x-1/2 bg-black/70 text-white px-6 py-3 rounded-full backdrop-blur-md border border-white/20 shadow-2xl animate-in fade-in zoom-in-95 pointer-events-none z-50">
                 {actionMessage}
             </div>
         )}
      </main>

      {/* Modals */}
      {showTransport && (
          <TransportModal 
              availableResources={transportOptions}
              previousAllocations={savedAllocations}
              capacity={capital?.transportCapacity || 20}
              onConfirm={handleTransportConfirm}
          />
      )}

      {showUniversity && (
          <UniversityModal 
              capital={capital}
              onClose={() => setShowUniversity(false)}
              onRecruit={(type) => handleRecruit(type)}
              getSpriteSource={getSpriteSource}
          />
      )}

      {showIndustry && (
          <IndustryModal
              capital={capital}
              onClose={() => setShowIndustry(false)}
              onAction={runCityAction}
          />
      )}
      
      {showAssets && (
          <AssetModal 
              onClose={() => setShowAssets(false)}
              onUpload={handleSpriteUpload}
              onRegenerate={handleRegenerate}
              getConfig={getConfig}
              setConfig={setConfig}
              getSpriteSource={getSpriteSource}
              onSetWindStrength={(val) => gameRef.current?.setWindStrength(val)}
          />
      )}

    </div>
  );
};

export default App;
