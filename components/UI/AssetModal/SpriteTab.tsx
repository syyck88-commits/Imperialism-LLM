
import React, { useState, useEffect, useRef } from 'react';
import { Settings, Ghost, Grid, Download } from 'lucide-react';
import { SpriteVisualConfig, DEFAULT_SPRITE_CONFIG } from '../../../Renderer/assets/SpriteVisuals';
import { ResourceType } from '../../../Grid/GameMap';
import { UnitType } from '../../../Entities/Unit';

interface SpriteTabProps {
    getConfig?: (key: string) => SpriteVisualConfig;
    setConfig?: (key: string, cfg: SpriteVisualConfig) => void;
    getSpriteSource?: (key: string) => string | null;
}

const spriteCategories = {
    RESOURCE: [
        { key: `RES_${ResourceType.COAL}`, label: 'Уголь' },
        { key: `RES_${ResourceType.IRON}`, label: 'Железо' },
        { key: `RES_${ResourceType.GOLD}`, label: 'Золото' },
        { key: `RES_${ResourceType.GEMS}`, label: 'Самоцветы' },
        { key: `RES_${ResourceType.OIL}`, label: 'Нефть' },
        { key: `RES_${ResourceType.WHEAT}`, label: 'Пшеница' },
        { key: `RES_${ResourceType.COTTON}`, label: 'Хлопок' },
        { key: `RES_${ResourceType.MEAT}`, label: 'Скот (Коровы)' },
        { key: `RES_${ResourceType.WOOL}`, label: 'Овцы' },
        { key: `RES_${ResourceType.FRUIT}`, label: 'Фрукты' },
    ],
    UNIT: [
        { key: `UNIT_${UnitType.ENGINEER}`, label: 'Инженер' },
        { key: `UNIT_${UnitType.SOLDIER}`, label: 'Солдат' },
        { key: `UNIT_${UnitType.MINER}`, label: 'Шахтер' },
        { key: `UNIT_${UnitType.FARMER}`, label: 'Фермер' },
        { key: `UNIT_${UnitType.PROSPECTOR}`, label: 'Геолог' },
        { key: `UNIT_${UnitType.RANCHER}`, label: 'Пастух' },
        { key: `UNIT_${UnitType.FORESTER}`, label: 'Лесник' },
        { key: `UNIT_${UnitType.DRILLER}`, label: 'Буровик' },
    ],
    STRUCT: [
        { key: 'STR_capital', label: 'Столица' },
        { key: 'STR_depot', label: 'Депо' },
        { key: 'STR_port', label: 'Порт' },
        { key: 'STR_mine', label: 'Шахта' },
        { key: 'STR_farm', label: 'Ферма' },
        { key: 'STR_lumber_mill', label: 'Лесопилка' },
        { key: 'STR_oil_well', label: 'Нефтяная вышка' },
        { key: 'STR_plantation', label: 'Плантация (Общ.)' },
        { key: 'STR_plantation_cotton', label: 'Плантация (Хлопок)' },
        { key: 'STR_plantation_fruit', label: 'Плантация (Фрукты)' },
    ]
};

const getResID = (key: string): number | null => {
    if (!key.startsWith('RES_')) return null;
    return parseInt(key.replace('RES_', ''));
};

export const SpriteTab: React.FC<SpriteTabProps> = ({ getConfig, setConfig, getSpriteSource }) => {
    const [selectedCategory, setSelectedCategory] = useState<'RESOURCE' | 'UNIT' | 'STRUCT'>('RESOURCE');
    const [selectedSpriteKey, setSelectedSpriteKey] = useState<string>('');
    const [spriteConfig, setSpriteConfigState] = useState<SpriteVisualConfig>(DEFAULT_SPRITE_CONFIG);
    const spritePreviewRef = useRef<HTMLCanvasElement>(null);

    // Load Sprite Config when selection changes
    useEffect(() => {
        if (selectedSpriteKey && getConfig) {
            const cfg = getConfig(selectedSpriteKey);
            setSpriteConfigState({ ...cfg });
        }
    }, [selectedSpriteKey, getConfig]);

    // Apply Sprite Config live
    useEffect(() => {
        if (selectedSpriteKey && setConfig) {
            setConfig(selectedSpriteKey, spriteConfig);
        }
    }, [spriteConfig, selectedSpriteKey, setConfig]);

    // Render Preview
    useEffect(() => {
        if (selectedSpriteKey && getSpriteSource && spritePreviewRef.current) {
            const src = getSpriteSource(selectedSpriteKey);
            const canvas = spritePreviewRef.current;
            const ctx = canvas.getContext('2d');
            if (ctx && src) {
                const img = new Image();
                img.src = src;
                img.onload = () => {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    
                    const resID = getResID(selectedSpriteKey);
                    const isSheet = resID === ResourceType.MEAT || resID === ResourceType.WOOL;
                    
                    let sW = img.width;
                    let sH = img.height;
                    let sx = 0;
                    let sy = 0;

                    if (isSheet) {
                        const cols = 3;
                        const rows = 3;
                        const frameW = img.width / cols;
                        const frameH = img.height / rows;
                        
                        sW = frameW;
                        sH = frameH;
                        
                        if (resID === ResourceType.WOOL) sx = 0; 
                        else sx = frameW; 
                        sy = 0;
                    }

                    const centerX = canvas.width / 2;
                    const centerY = canvas.height / 2;
                    
                    const baseScale = Math.min(1.0, (canvas.height * 0.6) / sH);
                    const visualScale = baseScale * spriteConfig.scale;
                    
                    const dW = sW * visualScale;
                    const dH = sH * visualScale;
                    
                    const dx = centerX - dW/2 + spriteConfig.shiftX;
                    const dy = centerY - dH/2 + spriteConfig.shiftY;

                    ctx.imageSmoothingEnabled = false;
                    
                    if ((spriteConfig.drawShadow ?? true) && spriteConfig.shadowScale > 0) {
                        ctx.save();
                        ctx.beginPath();
                        const shX = dx + dW/2 + (spriteConfig.shadowX || 0);
                        const shY = dy + dH + (spriteConfig.shadowY || 0);
                        ctx.ellipse(shX, shY, dW * 0.3 * spriteConfig.shadowScale, dH * 0.1 * spriteConfig.shadowScale, 0, 0, Math.PI * 2);
                        ctx.fillStyle = `rgba(0, 0, 0, ${spriteConfig.shadowOpacity ?? 0.3})`;
                        ctx.fill();
                        ctx.restore();
                    }

                    ctx.drawImage(img, sx, sy, sW, sH, dx, dy, dW, dH);
                };
            } else if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#334155';
                ctx.font = '10px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('Нет изображения', canvas.width/2, canvas.height/2);
            }
        }
    }, [selectedSpriteKey, getSpriteSource, spriteConfig]);

    const exportAllSprites = () => {
        const configs = localStorage.getItem('SPRITE_CONFIGS');
        const json = configs || "{}";
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `sprites_full_config.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const resID = getResID(selectedSpriteKey);
    const isClumpable = resID !== null && (
        resID === ResourceType.WHEAT || 
        resID === ResourceType.FRUIT || 
        resID === ResourceType.MEAT || 
        resID === ResourceType.WOOL ||
        resID === ResourceType.COTTON
    );

    return (
        <div className="space-y-4 text-sm text-slate-300">
            {/* Category Selector */}
            <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 gap-1 flex-wrap">
                <button onClick={() => setSelectedCategory('RESOURCE')} className={`flex-1 py-2 px-1 rounded text-[10px] font-bold ${selectedCategory === 'RESOURCE' ? 'bg-blue-600 text-white' : 'text-slate-500'}`}>Ресурсы</button>
                <button onClick={() => setSelectedCategory('UNIT')} className={`flex-1 py-2 px-1 rounded text-[10px] font-bold ${selectedCategory === 'UNIT' ? 'bg-amber-600 text-white' : 'text-slate-500'}`}>Юниты</button>
                <button onClick={() => setSelectedCategory('STRUCT')} className={`flex-1 py-2 px-1 rounded text-[10px] font-bold ${selectedCategory === 'STRUCT' ? 'bg-purple-600 text-white' : 'text-slate-500'}`}>Здания</button>
            </div>

            {/* List */}
            <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto bg-slate-950/50 p-2 rounded border border-slate-800">
                {spriteCategories[selectedCategory].map(item => (
                    <button
                        key={item.key}
                        onClick={() => setSelectedSpriteKey(item.key)}
                        className={`text-left px-3 py-2 rounded text-xs border ${selectedSpriteKey === item.key ? 'bg-slate-700 border-slate-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'}`}
                    >
                        {item.label}
                    </button>
                ))}
            </div>

            {selectedSpriteKey ? (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                    
                    {/* Preview Box */}
                    <div className="flex justify-center bg-[url('/grid_bg.png')] rounded-lg border border-slate-700 p-4 min-h-[128px] items-center relative overflow-hidden bg-cover">
                        <div className="text-xs text-slate-500 absolute top-2 left-2 bg-black/50 px-1 rounded">Предпросмотр</div>
                        <canvas ref={spritePreviewRef} width={200} height={150} className="w-[200px] h-[150px] object-contain" />
                    </div>

                    <div className="bg-slate-800 p-4 rounded space-y-4 border border-slate-700">
                         <h3 className="text-xs font-bold text-slate-400 uppercase border-b border-slate-700 pb-2 mb-2 flex items-center gap-2">
                             <Settings size={14}/> Основные
                         </h3>
                         
                         <div className="grid grid-cols-2 gap-4">
                             <div>
                                 <div className="flex justify-between mb-1 text-xs font-bold"><label>Scale</label><span>{spriteConfig.scale.toFixed(2)}x</span></div>
                                 <input type="range" min="0.1" max="3.0" step="0.05" value={spriteConfig.scale} onChange={(e) => setSpriteConfigState(p => ({...p, scale: parseFloat(e.target.value)}))} className="w-full accent-blue-500" />
                             </div>
                             <div></div>
                             <div>
                                 <div className="flex justify-between mb-1 text-xs font-bold"><label>Shift X</label><span>{spriteConfig.shiftX}px</span></div>
                                 <input type="range" min="-250" max="250" step="1" value={spriteConfig.shiftX} onChange={(e) => setSpriteConfigState(p => ({...p, shiftX: parseInt(e.target.value)}))} className="w-full accent-blue-500" />
                             </div>
                             <div>
                                 <div className="flex justify-between mb-1 text-xs font-bold"><label>Shift Y</label><span>{spriteConfig.shiftY}px</span></div>
                                 <input type="range" min="-250" max="250" step="1" value={spriteConfig.shiftY} onChange={(e) => setSpriteConfigState(p => ({...p, shiftY: parseInt(e.target.value)}))} className="w-full accent-blue-500" />
                             </div>
                         </div>
                    </div>

                    <div className="bg-slate-800 p-4 rounded space-y-4 border border-slate-700">
                         <h3 className="text-xs font-bold text-slate-400 uppercase border-b border-slate-700 pb-2 mb-2 flex items-center gap-2">
                             <Ghost size={14}/> Тень (Shadow)
                         </h3>
                         
                         <div className="flex items-center gap-2 mb-2">
                            <input 
                                type="checkbox" 
                                id="drawShadow"
                                checked={spriteConfig.drawShadow ?? true} 
                                onChange={(e) => setSpriteConfigState(p => ({...p, drawShadow: e.target.checked}))}
                                className="rounded bg-slate-700 border-slate-600 accent-amber-500"
                            />
                            <label htmlFor="drawShadow" className="text-xs font-bold cursor-pointer select-none">Отрисовывать тень</label>
                         </div>

                         <div className="grid grid-cols-2 gap-4">
                             <div>
                                 <div className="flex justify-between mb-1 text-xs font-bold"><label>Size</label><span>{spriteConfig.shadowScale.toFixed(2)}x</span></div>
                                 <input type="range" min="0" max="2.0" step="0.1" value={spriteConfig.shadowScale} onChange={(e) => setSpriteConfigState(p => ({...p, shadowScale: parseFloat(e.target.value)}))} className="w-full accent-slate-500" />
                             </div>
                             <div>
                                 <div className="flex justify-between mb-1 text-xs font-bold"><label>Opacity</label><span>{spriteConfig.shadowOpacity?.toFixed(2) ?? 0.3}</span></div>
                                 <input type="range" min="0" max="1.0" step="0.05" value={spriteConfig.shadowOpacity ?? 0.3} onChange={(e) => setSpriteConfigState(p => ({...p, shadowOpacity: parseFloat(e.target.value)}))} className="w-full accent-slate-500" />
                             </div>
                             <div>
                                 <div className="flex justify-between mb-1 text-xs font-bold"><label>Offset X</label><span>{spriteConfig.shadowX ?? 0}px</span></div>
                                 <input type="range" min="-100" max="100" step="1" value={spriteConfig.shadowX ?? 0} onChange={(e) => setSpriteConfigState(p => ({...p, shadowX: parseInt(e.target.value)}))} className="w-full accent-slate-500" />
                             </div>
                             <div>
                                 <div className="flex justify-between mb-1 text-xs font-bold"><label>Offset Y</label><span>{spriteConfig.shadowY ?? 0}px</span></div>
                                 <input type="range" min="-100" max="100" step="1" value={spriteConfig.shadowY ?? 0} onChange={(e) => setSpriteConfigState(p => ({...p, shadowY: parseInt(e.target.value)}))} className="w-full accent-slate-500" />
                             </div>
                         </div>
                    </div>

                    {isClumpable && (
                        <div className="bg-slate-800 p-4 rounded space-y-4 border border-slate-700">
                            <h3 className="text-xs font-bold text-slate-400 uppercase border-b border-slate-700 pb-2 mb-2 flex items-center gap-2">
                                <Grid size={14}/> Группа (Clump)
                            </h3>
                            <div className="text-[10px] text-slate-500 mb-2">
                                Настройка количества объектов и радиуса.
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <div className="flex justify-between mb-1 text-xs font-bold"><label>Min</label><span>{spriteConfig.clumpMin ?? 0}</span></div>
                                    <input type="range" min="0" max="15" step="1" value={spriteConfig.clumpMin ?? 0} onChange={(e) => setSpriteConfigState(p => ({...p, clumpMin: parseInt(e.target.value)}))} className="w-full accent-emerald-500" />
                                </div>
                                <div>
                                    <div className="flex justify-between mb-1 text-xs font-bold"><label>Max</label><span>{spriteConfig.clumpMax ?? 0}</span></div>
                                    <input type="range" min="0" max="20" step="1" value={spriteConfig.clumpMax ?? 0} onChange={(e) => setSpriteConfigState(p => ({...p, clumpMax: parseInt(e.target.value)}))} className="w-full accent-emerald-500" />
                                </div>
                                <div>
                                    <div className="flex justify-between mb-1 text-xs font-bold"><label>Spread</label><span>{spriteConfig.clumpSpread?.toFixed(2) ?? 1.0}x</span></div>
                                    <input type="range" min="0.1" max="2.0" step="0.1" value={spriteConfig.clumpSpread ?? 1.0} onChange={(e) => setSpriteConfigState(p => ({...p, clumpSpread: parseFloat(e.target.value)}))} className="w-full accent-emerald-500" />
                                </div>
                            </div>
                        </div>
                    )}
                    
                    <div className="flex gap-2">
                        <button 
                            onClick={exportAllSprites}
                            className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded font-bold text-xs flex items-center justify-center gap-2 border border-slate-500"
                        >
                            <Download size={14} /> Скачать все настройки (JSON)
                        </button>
                    </div>
                </div>
            ) : (
                <div className="text-center text-slate-500 py-8 italic">Выберите спрайт для настройки</div>
            )}
        </div>
    );
};
