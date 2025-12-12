
import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, X, Send, Trash2, Zap, Scroll } from 'lucide-react';

export type AdvisorType = 'flash' | 'pro';

export interface ChatMessage {
    sender: 'user' | 'advisor';
    text: string;
}

interface AdvisorWidgetProps {
    isOpen: boolean;
    onOpen: () => void;
    onClose: () => void;
    chatHistory: ChatMessage[];
    isLoading: boolean;
    currentAdvisor: AdvisorType;
    onSwitchAdvisor: (type: AdvisorType) => void;
    onSendMessage: (text: string) => void;
    onClearChat: () => void;
}

const AdvisorWidget: React.FC<AdvisorWidgetProps> = ({ 
    isOpen, 
    onOpen, 
    onClose, 
    chatHistory, 
    isLoading,
    currentAdvisor,
    onSwitchAdvisor,
    onSendMessage,
    onClearChat
}) => {
    const [inputText, setInputText] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [chatHistory, isOpen, isLoading]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (inputText.trim()) {
            onSendMessage(inputText);
            setInputText("");
        }
    };

    // Styling configuration based on persona
    const theme = currentAdvisor === 'flash' ? {
        border: 'border-indigo-400',
        bg: 'bg-indigo-50',
        headerBg: 'bg-indigo-600',
        headerText: 'text-white',
        advisorBubble: 'bg-indigo-100 text-indigo-900 border-indigo-200',
        userBubble: 'bg-indigo-600 text-white',
        icon: <Zap size={20} className="text-yellow-300" />,
        title: "Флашус Скорострел",
        desc: "Гусарский адъютант (1815 г.)",
        btn: 'bg-indigo-600 hover:bg-indigo-500'
    } : {
        border: 'border-[#8b5a2b]',
        bg: 'bg-[#f0e6d2]',
        headerBg: 'bg-[#5c3a1e]',
        headerText: 'text-[#f0e6d2]',
        advisorBubble: 'bg-[#e6d8b8] text-[#5c3a1e] border-[#cbbca0]',
        userBubble: 'bg-[#8b5a2b] text-white',
        icon: <Scroll size={20} className="text-[#f0e6d2]" />,
        title: "Гумозникус III",
        desc: "Древний бюрократ (Gemini 3.0)",
        btn: 'bg-[#8b5a2b] hover:bg-[#6b4521]'
    };

    return (
        <div className="fixed bottom-6 left-6 z-[100] flex flex-col-reverse items-start gap-2 pointer-events-none">
            {/* Main Toggle Button */}
            <div className="pointer-events-auto pl-2">
                <button 
                    onClick={onOpen}
                    className={`group flex items-center justify-center w-14 h-14 rounded-full shadow-[0_0_15px_rgba(0,0,0,0.3)] border-2 hover:scale-110 transition-all duration-300 ${currentAdvisor === 'flash' ? 'bg-indigo-600 border-indigo-400' : 'bg-[#8b5a2b] border-[#d4c4a8]'}`}
                    title="Спросить советника"
                >
                    <Sparkles size={24} className="text-white group-hover:rotate-12 transition-transform" />
                </button>
            </div>

            {/* Chat Window */}
            {isOpen && (
                <div className={`pointer-events-auto mb-2 w-96 ${theme.bg} rounded-lg shadow-2xl border-4 ${theme.border} flex flex-col overflow-hidden animate-in slide-in-from-left-5 fade-in duration-300 font-sans h-[500px]`}>
                    
                    {/* Header with Advisor Switcher */}
                    <div className={`${theme.headerBg} p-3 shrink-0 flex flex-col gap-3 transition-colors duration-300`}>
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white/10 rounded-full border border-white/20">
                                    {theme.icon}
                                </div>
                                <div>
                                    <h3 className={`font-bold text-sm uppercase tracking-wider ${theme.headerText}`}>{theme.title}</h3>
                                    <p className="text-[10px] opacity-70 text-white">{theme.desc}</p>
                                </div>
                            </div>
                            <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
                                <X size={16} />
                            </button>
                        </div>

                        {/* Tabs */}
                        <div className="flex bg-black/20 p-1 rounded-lg">
                            <button 
                                onClick={() => onSwitchAdvisor('flash')}
                                className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-xs font-bold transition-all ${currentAdvisor === 'flash' ? 'bg-indigo-500 text-white shadow' : 'text-white/50 hover:bg-white/10'}`}
                            >
                                <Zap size={12} />
                                Флашус
                            </button>
                            <button 
                                onClick={() => onSwitchAdvisor('pro')}
                                className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-xs font-bold transition-all ${currentAdvisor === 'pro' ? 'bg-[#8b5a2b] text-white shadow' : 'text-white/50 hover:bg-white/10'}`}
                            >
                                <Scroll size={12} />
                                Гумозникус
                            </button>
                        </div>
                    </div>

                    {/* Chat History */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-white/50 relative">
                        {chatHistory.length === 0 && !isLoading && (
                            <div className="text-center text-slate-400 text-xs italic mt-10">
                                История переписки пуста.<br/>Задайте вопрос о вашем королевстве!
                            </div>
                        )}

                        {chatHistory.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm whitespace-pre-wrap ${msg.sender === 'user' ? theme.userBubble : theme.advisorBubble}`}>
                                    {msg.text}
                                </div>
                            </div>
                        ))}

                        {isLoading && (
                            <div className="flex justify-start">
                                <div className={`${theme.advisorBubble} rounded-lg px-4 py-3 shadow-sm flex items-center gap-2`}>
                                    <div className={`w-2 h-2 rounded-full animate-bounce ${currentAdvisor === 'flash' ? 'bg-indigo-500' : 'bg-[#5c3a1e]'}`} style={{ animationDelay: '0ms' }}></div>
                                    <div className={`w-2 h-2 rounded-full animate-bounce ${currentAdvisor === 'flash' ? 'bg-indigo-500' : 'bg-[#5c3a1e]'}`} style={{ animationDelay: '150ms' }}></div>
                                    <div className={`w-2 h-2 rounded-full animate-bounce ${currentAdvisor === 'flash' ? 'bg-indigo-500' : 'bg-[#5c3a1e]'}`} style={{ animationDelay: '300ms' }}></div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Area */}
                    <form onSubmit={handleSubmit} className="p-3 bg-white border-t border-slate-200 flex gap-2 items-center">
                        <button 
                            type="button" 
                            onClick={onClearChat}
                            className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                            title="Очистить чат"
                        >
                            <Trash2 size={16} />
                        </button>
                        <input 
                            type="text" 
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            // IMPORTANT: Prevent key presses from bubbling to game controls (WASD)
                            onKeyDown={(e) => e.stopPropagation()}
                            placeholder="Ваш вопрос..."
                            className="flex-1 bg-slate-100 border border-slate-300 rounded-full px-4 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                        />
                        <button 
                            type="submit"
                            disabled={!inputText.trim() || isLoading}
                            className={`p-2 rounded-full text-white shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all ${theme.btn}`}
                        >
                            <Send size={18} />
                        </button>
                    </form>

                    {/* Visual Pointer */}
                    <div className={`absolute -bottom-2 left-7 w-4 h-4 ${theme.bg} border-b-4 border-r-4 ${theme.border} transform rotate-45`}></div>
                </div>
            )}

            <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent; 
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(0,0,0,0.2); 
                    border-radius: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(0,0,0,0.3); 
                }
            `}</style>
        </div>
    );
};

export default AdvisorWidget;
