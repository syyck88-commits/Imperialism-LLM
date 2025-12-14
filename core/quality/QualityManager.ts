
import { GraphicsQualityLevel, GraphicsQualitySettings, QUALITY_PRESETS } from "./types";

type QualityUpdateCallback = (settings: GraphicsQualitySettings) => void;

export class QualityManager {
    private static instance: QualityManager;

    private level: GraphicsQualityLevel;
    private settings: GraphicsQualitySettings;
    private listeners: QualityUpdateCallback[] = [];

    // For Auto mode
    private smoothedFps: number = 60;
    private lastAdaptationTime: number = 0;
    private readonly adaptationCooldown: number = 5000; // 5 seconds
    private readonly fpsHistory: number[] = [];
    private readonly fpsHistorySize: number = 120; // ~2 seconds at 60fps

    private constructor() {
        const savedLevel = localStorage.getItem('graphicsQualityLevel') as GraphicsQualityLevel | null;
        
        if (savedLevel && savedLevel !== 'auto') {
            this.level = savedLevel;
            this.settings = { ...QUALITY_PRESETS[savedLevel] };
        } else {
            this.level = 'auto';
            const detectedLevel = this.detectInitialQuality();
            this.settings = { ...QUALITY_PRESETS[detectedLevel] };
        }
        console.log(`[QualityManager] Initial level: ${this.level}, settings from preset: ${this.level === 'auto' ? this.detectInitialQuality() : this.level}`);
    }

    public static getInstance(): QualityManager {
        if (!QualityManager.instance) {
            QualityManager.instance = new QualityManager();
        }
        return QualityManager.instance;
    }

    public getLevel(): GraphicsQualityLevel {
        return this.level;
    }

    public setLevel(level: GraphicsQualityLevel): void {
        console.log(`[QualityManager] Setting level to: ${level}`);
        this.level = level;
        this.fpsHistory.length = 0; // Reset FPS history on manual change

        if (level === 'auto') {
            // When switching to auto, start from a sensible baseline
            const detectedLevel = this.detectInitialQuality();
            this.settings = { ...QUALITY_PRESETS[detectedLevel] };
        } else {
            this.settings = { ...QUALITY_PRESETS[level] };
        }

        localStorage.setItem('graphicsQualityLevel', level);
        this.notifyListeners();
    }

    public getSettings(): GraphicsQualitySettings {
        return this.settings;
    }
    
    public addListener(callback: QualityUpdateCallback): void {
        this.listeners.push(callback);
    }
    
    public removeListener(callback: QualityUpdateCallback): void {
        this.listeners = this.listeners.filter(l => l !== callback);
    }
    
    private notifyListeners(): void {
        for (const listener of this.listeners) {
            listener(this.settings);
        }
    }

    private detectInitialQuality(): Exclude<GraphicsQualityLevel, "auto"> {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            
            // Fix: Type guard to ensure gl is a WebGL context before using WebGL-specific methods.
            // The error suggests TypeScript considers `gl` could be a different rendering context (like Canvas2D),
            // which lacks the required properties. This also handles the case where `gl` is null.
            if (!(gl instanceof WebGLRenderingContext)) {
                return 'low';
            }

            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : '';
            const maxTexSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);

            if (renderer.match(/intel|integrated|apple/i)) {
                return maxTexSize >= 8192 ? 'medium' : 'low';
            }
            if (maxTexSize < 8192) {
                return 'medium';
            }

            return 'high';
        } catch (e) {
            return 'low';
        }
    }

    public onFrame(deltaTime: number, fps: number): void {
        if (this.level !== 'auto' || !isFinite(fps) || fps < 1) return;

        // Update smoothed FPS using a moving average
        this.fpsHistory.push(fps);
        if (this.fpsHistory.length > this.fpsHistorySize) {
            this.fpsHistory.shift();
        }
        
        // Don't adapt until we have enough data
        if (this.fpsHistory.length < this.fpsHistorySize / 2) return;

        this.smoothedFps = this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;
        
        const now = performance.now();
        if (now - this.lastAdaptationTime < this.adaptationCooldown) return;

        // Step down
        if (this.smoothedFps < 55) {
            if (this.settings.renderScale > 0.8) {
                this.settings.renderScale = Math.max(0.75, this.settings.renderScale - 0.1);
                console.log('[QualityManager.Auto] Low FPS, reducing renderScale to', this.settings.renderScale.toFixed(2));
                this.lastAdaptationTime = now;
                this.notifyListeners();
            } else if (this.settings.visibleChunkPadding > 1) {
                this.settings.visibleChunkPadding--;
                console.log('[QualityManager.Auto] Low FPS, reducing chunk padding to', this.settings.visibleChunkPadding);
                this.lastAdaptationTime = now;
                this.notifyListeners();
            }
        }
        // Step up (only if stable)
        else if (this.smoothedFps > 59 && this.fpsHistory.every(f => f > 58)) {
            if (this.settings.renderScale < 1.0) {
                this.settings.renderScale = Math.min(1.0, this.settings.renderScale + 0.1);
                console.log('[QualityManager.Auto] High FPS, increasing renderScale to', this.settings.renderScale.toFixed(2));
                this.lastAdaptationTime = now;
                this.notifyListeners();
            } else if (this.settings.visibleChunkPadding < QUALITY_PRESETS.high.visibleChunkPadding) {
                this.settings.visibleChunkPadding++;
                console.log('[QualityManager.Auto] High FPS, increasing chunk padding to', this.settings.visibleChunkPadding);
                this.lastAdaptationTime = now;
                this.notifyListeners();
            }
        }
    }
}
