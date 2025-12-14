
import React from 'react';
import { SkipForward, Wheat, Pickaxe, Axe, Box, Scroll, Coins, UserCheck, School, Anvil, Armchair, MapPin, Factory, Fish, Beef, Archive, Link2, Link2Off, TrendingUp, Image as ImageIcon, Monitor } from 'lucide-react';
import { City } from '../../Entities/City';
import { HoverInfo } from '../../core/Game';
import { ResourceType, ImprovementType } from '../../Grid/GameMap';
import { getResourceName, getTerrainName, getImprovementName } from '../../utils/Localization';

interface HeaderProps {
    capital: City | null;
    hoverInfo: HoverInfo | null;
    year: number;
    onUniversityClick: () => void;
    onIndustryClick: () => void;
    onEndTurnClick: (e: React.MouseEvent) => void;
    onAssetsClick: () => void;
}

const Header: React.FC<HeaderProps> = ({ capital, hoverInfo, year, onUniversityClick, onIndustryClick, onEndTurnClick, onAssetsClick }) => {
    
    const ResourceItem = ({ type, icon: Icon, color }: { type: ResourceType, icon: any, color: string }) => {
        const count = capital?.inventory.get(type) || 0;
        return (
            <div className="flex items-center gap-1 text-sm font-mono" title={getResourceName(type)}>
                <Icon size={16} className={color} />
                <span className="text-slate-200">{count}</span>
            </div>
        );
    };

    const renderYields = (yields: Map<ResourceType, number>) => {
        const items: React.ReactElement[] = [];
        yields.forEach((amount, type) => {
            items.push(
                <span key={type} className="text-xs font-mono text-emerald-300 ml-1">
                    +{amount} {getResourceName(type)}
                </span>
            );
        });
        if (items.length === 0) return <span className="text-xs text-slate-500 ml-1">Нет добычи</span>;
        return <div className="flex flex-wrap">{items}</div>;
    };

    return (
        <header className="flex items-center justify-between px-6 h-20 bg-slate-800 border-b border-slate-700 shadow-lg z-10 shrink-0 gap-4">
            {/* Left: Title & Resources */}
            <div className="flex flex-col justify-center gap-1 min-w-[220px]">
              <h1 className="text-lg font-bold tracking-wider text-amber-400 leading-none">ИМПЕРИАЛИЗМ</h1>
              <div className="flex gap-4 items-center">
                 {capital ? (
                     <>
                        <div className="flex items-center gap-1 text-emerald-400 font-mono text-sm border-r border-slate-600 pr-3">
                            <Coins size={14} />
                            ${capital.cash}
                        </div>
                        <div className="flex items-center gap-1 text-blue-300 font-mono text-sm border-r border-slate-600 pr-3" title="Эксперты">
                            <UserCheck size={14} />
                            {capital.expertLabor}
                        </div>

                        <ResourceItem type={ResourceType.PAPER} icon={Scroll} color="text-slate-200" />
                        
                        <div className="w-px h-4 bg-slate-600 mx-1"></div>

                        <ResourceItem type={ResourceType.WHEAT} icon={Wheat} color="text-yellow-400" />
                        <ResourceItem type={ResourceType.FRUIT} icon={Wheat} color="text-orange-400" />
                        <ResourceItem type={ResourceType.MEAT} icon={Beef} color="text-red-400" />
                        <ResourceItem type={ResourceType.FISH} icon={Fish} color="text-blue-400" />
                        <ResourceItem type={ResourceType.CANNED_FOOD} icon={Archive} color="text-slate-400" />

                        <div className="w-px h-4 bg-slate-600 mx-1"></div>
                        
                        <ResourceItem type={ResourceType.WOOD} icon={Axe} color="text-green-600" />
                        <ResourceItem type={ResourceType.COAL} icon={Box} color="text-gray-400" />
                        <ResourceItem type={ResourceType.IRON} icon={Pickaxe} color="text-slate-300" />
                     </>
                 ) : (
                    <span className="text-xs text-slate-500">Столица не основана</span>
                 )}
              </div>
            </div>

            {/* Center: Tile Inspection */}
            <div className="flex-1 flex justify-center items-center">
               {hoverInfo && hoverInfo.tileData ? (
                 <div className="flex items-center gap-6 px-6 py-2 bg-slate-900/60 rounded-xl border border-slate-700/50 backdrop-blur-sm shadow-inner transition-all">
                    
                    {/* Coords */}
                    <div className="flex items-center gap-2">
                       <MapPin size={16} className="text-slate-500"/>
                       <span className="text-xs font-mono text-slate-400">
                         {hoverInfo.hex.q}, {hoverInfo.hex.r}
                       </span>
                    </div>
                    
                    <div className="w-px h-6 bg-slate-700"></div>

                    {/* Terrain & Resource */}
                    <div className="flex flex-col items-start min-w-[60px]">
                      <span className="text-[10px] text-slate-500 uppercase leading-none mb-1">
                          {getTerrainName(hoverInfo.tileData.terrain)}
                      </span>
                      <span className="text-sm font-bold text-amber-200 leading-none">
                          {hoverInfo.tileData.isHidden ? '???' : getResourceName(hoverInfo.tileData.resource)}
                      </span>
                    </div>

                    <div className="w-px h-6 bg-slate-700"></div>

                    {/* Improvement / Yield / Connectivity */}
                    {hoverInfo.tileData.improvement !== ImprovementType.NONE ? (
                        <div className="flex items-center gap-4">
                            <div className="flex flex-col items-start">
                                <span className="text-[10px] text-blue-300 uppercase leading-none mb-1 flex items-center gap-1">
                                    {getImprovementName(hoverInfo.tileData.improvement)}
                                    <span className="text-slate-500 font-mono">
                                        (Ур. {hoverInfo.tileData.improvementLevel || 1})
                                    </span>
                                </span>
                                {hoverInfo.yields && renderYields(hoverInfo.yields)}
                            </div>
                            
                            {/* Connectivity Status */}
                            {hoverInfo.tileData.improvement !== ImprovementType.ROAD && 
                             hoverInfo.tileData.improvement !== ImprovementType.RAILROAD && (
                                <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-bold border ${hoverInfo.isConnected ? 'bg-emerald-900/30 border-emerald-500/30 text-emerald-400' : 'bg-red-900/30 border-red-500/30 text-red-400'}`}>
                                    {hoverInfo.isConnected ? <Link2 size={14} /> : <Link2Off size={14} />}
                                    {hoverInfo.isConnected ? 'Связь' : 'Нет связи'}
                                </div>
                            )}
                        </div>
                    ) : (
                         <div className="flex flex-col items-start min-w-[60px]">
                            <span className="text-[10px] text-slate-500 uppercase leading-none mb-1">Постройка</span>
                            <span className="text-sm text-slate-600 leading-none">Нет</span>
                         </div>
                    )}
                 </div>
               ) : (
                 <div className="text-xs text-slate-600 font-mono tracking-widest opacity-40 flex items-center gap-2">
                    <MapPin size={12} />
                    ОБЗОР ТЕРРИТОРИИ
                 </div>
               )}
            </div>

            {/* Right: Game State Controls */}
            <div className="flex items-center gap-4 min-w-[220px] justify-end">
               <button 
                 onClick={onAssetsClick}
                 className="flex flex-col items-center justify-center w-10 h-10 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-400 hover:text-white transition-all"
                 title="Настройка ассетов и графики"
               >
                  <Monitor size={18} />
               </button>

               <div className="w-px h-8 bg-slate-700 mx-2"></div>

               <button 
                 onClick={onIndustryClick}
                 className="flex flex-col items-center justify-center w-12 h-12 rounded bg-slate-700 hover:bg-slate-600 border border-slate-500/30 text-amber-200 transition-all"
                 title="Промышленность"
               >
                  <Factory size={20} />
                  <span className="text-[9px] font-bold">ИНД</span>
               </button>

               <button 
                 onClick={onUniversityClick}
                 className="flex flex-col items-center justify-center w-12 h-12 rounded bg-indigo-900/50 hover:bg-indigo-800 border border-indigo-500/30 text-indigo-200 transition-all"
                 title="Университет (Найм)"
               >
                  <School size={20} />
                  <span className="text-[9px] font-bold">ВУЗ</span>
               </button>
               
               <div className="w-px h-8 bg-slate-700 mx-2"></div>

               <div className="flex flex-col items-center px-2">
                 <span className="text-[10px] text-slate-400 uppercase tracking-wide leading-none mb-1">Год</span>
                 <span className="text-base font-mono font-bold text-white leading-none">{year} г.</span>
               </div>

              <button 
                onClick={onEndTurnClick}
                title="Завершить ход (Пробел)"
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 active:bg-amber-700 rounded-lg font-bold transition-all text-white shadow-md text-sm border border-amber-500/50"
              >
                <SkipForward size={16} fill="currentColor" />
                ДАЛЕЕ
              </button>
            </div>
        </header>
    );
}

export default Header;
