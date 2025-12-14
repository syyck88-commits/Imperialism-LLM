
import { Game } from '../core/Game';
import { Hex, hexRound } from '../Grid/HexMath';
import { ISO_FACTOR } from '../Renderer/RenderUtils';

export class CameraInput {
  private game: Game;
  private canvas: HTMLCanvasElement;
  
  // Drag State
  private isDragging: boolean = false;
  private isInteractionStartedOnCanvas: boolean = false; 
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;
  private dragThreshold: number = 10;
  private totalDragDist: number = 0;

  // Keyboard State
  private keysPressed: Set<string> = new Set();
  private readonly panSpeed: number = 500; // pixels per second

  // Zoom Constraints
  private readonly minZoom = 0.5;
  private readonly maxZoom = 5.0;

  constructor(game: Game, canvas: HTMLCanvasElement) {
    this.game = game;
    this.canvas = canvas;

    this.initListeners();
  }

  private initListeners() {
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mousemove', this.onMouseMove); 
    window.addEventListener('mouseup', this.onMouseUp);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('mouseleave', this.onMouseLeave);
    
    // Disable context menu for right-click logic
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());

    // Keyboard
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  public dispose() {
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('mouseleave', this.onMouseLeave);
    this.canvas.removeEventListener('contextmenu', e => e.preventDefault());
    
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  public update(deltaTime: number) {
      if (this.keysPressed.size === 0) return;

      const seconds = deltaTime / 1000;
      const speed = (this.panSpeed * seconds) / this.game.camera.zoom;

      if (this.keysPressed.has('KeyW') || this.keysPressed.has('ArrowUp')) {
          this.game.camera.y -= speed;
      }
      if (this.keysPressed.has('KeyS') || this.keysPressed.has('ArrowDown')) {
          this.game.camera.y += speed;
      }
      if (this.keysPressed.has('KeyA') || this.keysPressed.has('ArrowLeft')) {
          this.game.camera.x -= speed;
      }
      if (this.keysPressed.has('KeyD') || this.keysPressed.has('ArrowRight')) {
          this.game.camera.x += speed;
      }
  }

  public screenToWorld(screenX: number, screenY: number): Hex {
    const worldX = (screenX / this.game.camera.zoom) + this.game.camera.x;
    
    // Un-squash Y
    const worldY = ((screenY / this.game.camera.zoom) + this.game.camera.y) / ISO_FACTOR;
    
    const size = this.game.mapRenderer.hexSize;
    
    const q = (Math.sqrt(3)/3 * worldX  -  1/3 * worldY) / size;
    const r = (2/3 * worldY) / size;

    return hexRound({ q, r, s: -q - r });
  }

  private onKeyDown = (e: KeyboardEvent) => {
      // Ignore controls if user is typing in an input field
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') {
          return;
      }
      this.keysPressed.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
      this.keysPressed.delete(e.code);
  };

  private onMouseDown = (e: MouseEvent) => {
    this.isInteractionStartedOnCanvas = true;
    this.isDragging = true;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
    this.totalDragDist = 0;
    this.canvas.focus();
  };

  private onMouseUp = (e: MouseEvent) => {
    if (this.isInteractionStartedOnCanvas && this.totalDragDist < this.dragThreshold && e.target === this.canvas) {
        this.handleMapClick(e);
    }
    this.isDragging = false;
    this.isInteractionStartedOnCanvas = false;
  };

  private handleMapClick(e: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Scale mouse coordinates to match canvas's internal resolution
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const scaledX = mouseX * scaleX;
    const scaledY = mouseY * scaleY;

    const hex = this.screenToWorld(scaledX, scaledY);

    if (this.game.map.isValid(hex.q, hex.r)) {
        if (e.button === 0) {
            // Left Click: Select
            this.game.selectUnitAt(hex);
        } else if (e.button === 2) {
            // Right Click: Action (Move)
            this.game.moveSelectedUnit(hex);
        }
    }
  }

  private onMouseLeave = () => {
    this.isDragging = false;
    this.isInteractionStartedOnCanvas = false;
    this.game.hoveredHex = null;
  };

  private onMouseMove = (e: MouseEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (this.isDragging && this.isInteractionStartedOnCanvas) {
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      const dist = Math.sqrt(dx*dx + dy*dy);
      this.totalDragDist += dist;

      if ((e.buttons & 1) || (e.buttons & 4)) {
          this.game.camera.x -= dx / this.game.camera.zoom;
          this.game.camera.y -= dy / this.game.camera.zoom;
      }

      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    }

    // Check bounds against the display rectangle, not the internal canvas resolution
    if (mouseX >= 0 && mouseX <= rect.width && mouseY >= 0 && mouseY <= rect.height) {
        // Scale mouse coordinates to match canvas's internal resolution
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const scaledX = mouseX * scaleX;
        const scaledY = mouseY * scaleY;

        const hex = this.screenToWorld(scaledX, scaledY);
        
        if (this.game.map.isValid(hex.q, hex.r)) {
            this.game.hoveredHex = hex;
        } else {
            this.game.hoveredHex = null;
        }
    } else {
        // This handles cases where the mouse is still moving over the window but has left the canvas rect
        this.game.hoveredHex = null;
    }
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const zoomIntensity = 0.1;
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Scale mouse coordinates for accurate zoom-to-cursor
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const scaledX = mouseX * scaleX;
    const scaledY = mouseY * scaleY;

    const worldX_before = (scaledX / this.game.camera.zoom) + this.game.camera.x;
    const worldY_before = (scaledY / this.game.camera.zoom) + this.game.camera.y;

    const zoomFactor = e.deltaY < 0 ? (1 + zoomIntensity) : (1 - zoomIntensity);
    let newZoom = this.game.camera.zoom * zoomFactor;
    newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, newZoom));
    
    this.game.camera.zoom = newZoom;
    this.game.camera.x = worldX_before - (scaledX / newZoom);
    this.game.camera.y = worldY_before - (scaledY / newZoom);
  };
}
