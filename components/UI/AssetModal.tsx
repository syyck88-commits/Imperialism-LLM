
import React, { useState } from 'react';
import { X, Mountain, Image as ImageIcon, Settings } from 'lucide-react';
import { SpriteVisualConfig } from '../../Renderer/assets/SpriteVisuals';
import { BiomeTab } from './AssetModal/BiomeTab';
import { SpriteTab } from './AssetModal/SpriteTab';

interface AssetModalProps {
    onClose: () => void;
    onUpload?: any; 
    getConfig?: (key: string) => SpriteVisualConfig;
    setConfig?: (key: string, cfg: SpriteVisualConfig) => void;
    getSpriteSource?: (key: string) => string | null;
}

const AssetModal: React.FC<AssetModalProps> = ({ onClose, getConfig, setConfig, getSpriteSource }) => {
    const [activeTab, setActiveTab] = useState<'BIOME' | 'SPRITES'>('BIOME');

    return (
        <div className="fixed right-4 top-24 bottom-4 w-96 flex flex-col z-50 font-sans pointer-events-none">
            <div className="bg-slate-900/95 backdrop-blur border border-slate-700 rounded-xl shadow-2xl flex flex-col flex-1 pointer-events-auto overflow-hidden">
                
                <div className="flex justify-between items-center p-4 border-b border-slate-700 bg-slate-800 rounded-t-xl shrink-0">
                    <h2 className="text-amber-400 font-bold flex items-center gap-2">
                        <Settings size={20} /> Настройки
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">
                        <X size={24} />
                    </button>
                </div>

                {/* MAIN TABS */}
                <div className="flex border-b border-slate-700 shrink-0">
                    <button 
                        onClick={() => setActiveTab('BIOME')}
                        className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 ${activeTab === 'BIOME' ? 'text-white border-b-2 border-amber-500 bg-slate-800/50' : 'text-slate-500 hover:bg-slate-800'}`}
                    >
                        <Mountain size={16} /> Ландшафт
                    </button>
                    <button 
                        onClick={() => setActiveTab('SPRITES')}
                        className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 ${activeTab === 'SPRITES' ? 'text-white border-b-2 border-blue-500 bg-slate-800/50' : 'text-slate-500 hover:bg-slate-800'}`}
                    >
                        <ImageIcon size={16} /> Спрайты
                    </button>
                </div>

                <div className="p-4 overflow-y-auto custom-scrollbar flex-1">
                    {activeTab === 'BIOME' ? (
                        <BiomeTab />
                    ) : (
                        <SpriteTab 
                            getConfig={getConfig}
                            setConfig={setConfig}
                            getSpriteSource={getSpriteSource}
                        />
                    )}
                </div>
            </div>
            <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent; 
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(255,255,255,0.1); 
                    border-radius: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(255,255,255,0.2); 
                }
            `}</style>
        </div>
    );
};

export default AssetModal;
