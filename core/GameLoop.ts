export type UpdateCallback = (deltaTime: number) => void;
export type RenderCallback = () => void;

/**
 * GameLoop
 * Handles the high-precision timing loop using requestAnimationFrame.
 * Decouples logic updates from rendering where possible, though
 * for this simple browser implementation, they run sequentially per frame.
 */
export class GameLoop {
  private lastFrameTime: number = 0;
  private accumulator: number = 0;
  private readonly timeStep: number = 1000 / 60; // Target 60 FPS fixed time step for physics/logic
  private animationFrameId: number | null = null;
  private isRunning: boolean = false;

  constructor(
    private onUpdate: UpdateCallback,
    private onRender: RenderCallback
  ) {}

  public start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this.accumulator = 0;
    
    this.loop(this.lastFrameTime);
  }

  public stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private loop = (currentTime: number): void => {
    if (!this.isRunning) return;

    // Calculate delta time in milliseconds
    const deltaTime = currentTime - this.lastFrameTime;
    this.lastFrameTime = currentTime;

    // Optional: Clamp delta time to avoid spiral of death on lag spikes
    // const safeDelta = Math.min(deltaTime, 250);

    // Update Logic
    // In a sophisticated loop, we might use an accumulator for fixed time steps
    // For now, we pass variable delta time for simplicity in smooth animations
    this.onUpdate(deltaTime);

    // Render Logic
    this.onRender();

    // Debug Output (FPS Calculation helper could go here)
    // this.updateFPS(deltaTime);

    this.animationFrameId = requestAnimationFrame(this.loop);
  };
}