
import React, { useState, useEffect, useRef } from 'react';
import { Mountain, Waves, LandPlot, Palette, Undo, Download, RefreshCw, Wind } from 'lucide-react';
import { TerrainGenerator, DESERT_CONFIG, MOUNTAIN_CONFIG, HILLS_CONFIG, BiomeConfig } from '../../../Renderer/assets/TerrainGenerator';

const DEFAULT_DESERT: BiomeConfig = {
    type: 'DESERT',
    NOISE_TYPE: 'RIDGED',
    RESOLUTION: 1,
    HEIGHT: 43,
    SCALE: 4,
    SHARPNESS: 0.6,
    WARP_STRENGTH: 20,
    COL_TOP: [235, 215, 180],
    COL_MID: [195, 160, 110],
    COL_BOT: [149, 123, 101],
    COLOR_BIAS: 0.5,
    BASE_EROSION: 34,
    OCTAVES: 1,
    SNOW_LEVEL: 1.1
};

const DEFAULT_MOUNTAIN: BiomeConfig = {
    type: 'MOUNTAIN',
    NOISE_TYPE: 'RIDGED',
    RESOLUTION: 1,
    HEIGHT: 150,
    SCALE: 2,
    SHARPNESS: 0.6,
    WARP_STRENGTH: 5,
    COL_TOP: [250, 250, 255],
    COL_MID: [50, 49, 47],
    COL_BOT: [108, 92, 71],
    COLOR_BIAS: 0.6,
    BASE_EROSION: 60,
    OCTAVES: 4,
    SNOW_LEVEL: 0.85
};

const DEFAULT_HILLS: BiomeConfig = {
    type: 'HILLS',
    NOISE_TYPE: 'BILLOWY',
    RESOLUTION: 1,
    HEIGHT: 92,
    SCALE: 3,
    SHARPNESS: 0.1,
    WARP_STRENGTH: 10,
    COL_TOP: [83, 115, 63],
    COL_MID: [42, 67, 30],
    COL_BOT: [153, 129, 108],
    COLOR_BIAS: 0.1,
    BASE_EROSION: 29,
    OCTAVES: 2,
    SNOW_LEVEL: 1.1
};

interface BiomeTabProps {
    onRegenerate?: () => Promise<void>;
    onSetWindStrength?: (val: number) => void;
}

export const BiomeTab: React.FC<BiomeTabProps> = ({ onRegenerate, onSetWindStrength }) => {
    const [biomeType, setBiomeType] = useState<'DESERT' | 'MOUNTAIN' | 'HILLS'>('DESERT');
    const [config, setBiomeConfig] = useState<BiomeConfig>({ ...DESERT_CONFIG });
    const previewCanvasRef = useRef<HTMLCanvasElement>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [windVal, setWindVal] = useState(0.5);

    // Load Config
    useEffect(() => {
        const load = (key: string, target: BiomeConfig) => {
            const saved = localStorage.getItem(key);
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    Object.assign(target, parsed);
                } catch (e) { console.error("Failed to load config", e); }
            }
        };

        load('TERRAIN_CONFIG_DESERT', DESERT_CONFIG);
        load('TERRAIN_CONFIG_MOUNTAIN', MOUNTAIN_CONFIG);
        load('TERRAIN_CONFIG_HILLS', HILLS_CONFIG);

        if (biomeType === 'DESERT') setBiomeConfig({ ...DESERT_CONFIG });
        else if (biomeType === 'MOUNTAIN') setBiomeConfig({ ...MOUNTAIN_CONFIG });
        else setBiomeConfig({ ...HILLS_CONFIG });
    }, [biomeType]);

    // Preview
    useEffect(() => {
        const timer = setTimeout(() => {
            if (previewCanvasRef.current) {
                TerrainGenerator.generatePreview(previewCanvasRef.current, config);
            }
        }, 50);
        return () => clearTimeout(timer);
    }, [config]);

    const applyBiomeToWorld = async () => {
        if (!onRegenerate) return;
        
        setIsGenerating(true);
        if (biomeType === 'DESERT') Object.assign(DESERT_CONFIG, config);
        else if (biomeType === 'MOUNTAIN') Object.assign(MOUNTAIN_CONFIG, config);
        else Object.assign(HILLS_CONFIG, config);
        
        localStorage.setItem(`TERRAIN_CONFIG_${biomeType}`, JSON.stringify(config));
        
        await onRegenerate();
        setIsGenerating(false);
    };

    const resetBiomeToDefaults = () => {
        let def: BiomeConfig;
        if (biomeType === 'DESERT') def = { ...DEFAULT_DESERT };
        else if (biomeType === 'MOUNTAIN') def = { ...DEFAULT_MOUNTAIN };
        else def = { ...DEFAULT_HILLS };
        setBiomeConfig(def);
    };

    const exportSettings = () => {
        const exportData = { biome: biomeType, config: config };
        const json = JSON.stringify(exportData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${biomeType.toLowerCase()}_config.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const updateBiomeCfg = (key: keyof BiomeConfig, val: any) => {
        setBiomeConfig(prev => ({ ...prev, [key]: val }));
    };

    const handleWindChange = (val: number) => {
        setWindVal(val);
        if (onSetWindStrength) onSetWindStrength(val);
    };

    const getBiomeLabel = () => {
        if (biomeType === 'DESERT') return 'Пустыня';
        if (biomeType === 'MOUNTAIN') return 'Горы';
        return 'Холмы';
    };

    return (
        <div className="space-y-4 text-sm text-slate-300">
             {/* BIOME SWITCHER */}
             <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 gap-1">
                <button 
                    onClick={() => setBiomeType('DESERT')}
                    className={`flex-1 py-2 rounded-md flex items-center justify-center gap-1 text-xs font-bold transition-all ${
                        biomeType === 'DESERT' ? 'bg-amber-600 text-white shadow' : 'text-slate-500 hover:text-slate-300'
                    }`}
                >
                    <Waves size={14} /> Пустыня
                </button>
                <button 
                    onClick={() => setBiomeType('HILLS')}
                    className={`flex-1 py-2 rounded-md flex items-center justify-center gap-1 text-xs font-bold transition-all ${
                        biomeType === 'HILLS' ? 'bg-emerald-600 text-white shadow' : 'text-slate-500 hover:text-slate-300'
                    }`}
                >
                    <LandPlot size={14} /> Холмы
                </button>
                <button 
                    onClick={() => setBiomeType('MOUNTAIN')}
                    className={`flex-1 py-2 rounded-md flex items-center justify-center gap-1 text-xs font-bold transition-all ${
                        biomeType === 'MOUNTAIN' ? 'bg-slate-600 text-white shadow' : 'text-slate-500 hover:text-slate-300'
                    }`}
                >
                    <Mountain size={14} /> Горы
                </button>
            </div>

            {/* Preview Canvas */}
            <div className="flex justify-center bg-slate-950 rounded-lg border border-slate-800 p-2 overflow-hidden relative">
                <canvas 
                    ref={previewCanvasRef} 
                    width={300} 
                    height={300} 
                    className="w-[300px] h-[300px] object-contain bg-[url('/grid_bg.png')] opacity-90"
                />
                <div className="absolute bottom-2 right-2 text-xs text-slate-500 bg-black/50 px-2 rounded">
                    {getBiomeLabel()}
                </div>
            </div>

            {/* Global Settings */}
            <div className="bg-slate-800 p-3 rounded space-y-2">
                 <div className="flex items-center gap-2 mb-2 text-slate-400 font-bold text-xs uppercase">
                     <Wind size={12} /> Глобальные Эффекты
                 </div>
                 <div className="pt-2 border-t border-slate-700 mt-2">
                    <div className="flex justify-between mb-1"><label>Сила ветра</label><span>{windVal.toFixed(1)}</span></div>
                    <input type="range" min="0" max="2.0" step="0.1" value={windVal} onChange={(e) => handleWindChange(+e.target.value)} className="w-full accent-blue-400" />
                 </div>
            </div>

            {/* Biome Configs */}
            <div className="bg-slate-800 p-3 rounded space-y-2">
                 <div className="flex items-center gap-2 mb-2 text-slate-400 font-bold text-xs uppercase">
                     <Palette size={12} /> Цветовая схема
                 </div>
                 <div className="pt-2 border-t border-slate-700 mt-2">
                    <div className="flex justify-between mb-1"><label>Смещение (Bias)</label><span>{config.COLOR_BIAS}</span></div>
                    <input type="range" min="0.1" max="0.9" step="0.05" value={config.COLOR_BIAS} onChange={(e) => updateBiomeCfg('COLOR_BIAS', +e.target.value)} className="w-full accent-amber-500" />
                 </div>
            </div>

            <div className="bg-slate-800 p-3 rounded">
                <div className="flex justify-between mb-1"><label>Edge Fade (Размытие краев)</label><span>{config.BASE_EROSION}%</span></div>
                <input type="range" min="0" max="60" step="1" value={config.BASE_EROSION} onChange={(e) => updateBiomeCfg('BASE_EROSION', +e.target.value)} className="w-full accent-amber-500" />
            </div>

            <div className="bg-slate-800 p-3 rounded">
                <div className="flex justify-between mb-1"><label>Sharpness (Форма)</label><span>{config.SHARPNESS}</span></div>
                <input type="range" min="0.1" max="6.0" step="0.1" value={config.SHARPNESS} onChange={(e) => updateBiomeCfg('SHARPNESS', +e.target.value)} className="w-full accent-amber-500" />
            </div>

            <div className="bg-slate-800 p-3 rounded">
                <div className="flex justify-between mb-1"><label>Noise Scale</label><span>{config.SCALE}</span></div>
                <input type="range" min="1" max="150" step="1" value={config.SCALE} onChange={(e) => updateBiomeCfg('SCALE', +e.target.value)} className="w-full accent-amber-500" />
            </div>

            <div className="bg-slate-800 p-3 rounded">
                <div className="flex justify-between mb-1"><label>Height</label><span>{config.HEIGHT}px</span></div>
                <input type="range" min="10" max="150" step="1" value={config.HEIGHT} onChange={(e) => updateBiomeCfg('HEIGHT', +e.target.value)} className="w-full accent-amber-500" />
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-700">
                 <button onClick={resetBiomeToDefaults} className="bg-red-900/50 hover:bg-red-900/80 border border-red-800 text-red-200 px-3 py-2 rounded font-bold transition-colors">
                    <Undo size={16} />
                </button>
                 <button onClick={exportSettings} className="bg-slate-700 hover:bg-slate-600 text-white px-4 rounded font-bold transition-colors">
                    <Download size={18} />
                </button>
                <button onClick={applyBiomeToWorld} disabled={isGenerating || !onRegenerate} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded font-bold transition-colors flex items-center justify-center gap-2">
                    <RefreshCw size={18} className={isGenerating ? "animate-spin" : ""} />
                    {isGenerating ? "Применение..." : `Применить (${getBiomeLabel()})`}
                </button>
            </div>
        </div>
    );
};
