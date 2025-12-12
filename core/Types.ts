

import { Hex } from '../Grid/HexMath';
import { TileData, ResourceType } from '../Grid/GameMap';
import { City } from '../Entities/City';
import { Unit } from '../Entities/Unit';

export interface HoverInfo {
  hex: Hex;
  tileData: TileData | null;
  yields: Map<ResourceType, number> | null;
  isConnected: boolean;
}

export interface GameStateCallback {
  onTurnChange: (turn: number, year: number) => void;
  onSelectionChange: (unit: Unit | null) => void;
  onHoverChange: (info: HoverInfo | null) => void;
  onCapitalUpdate: (city: City) => void;
  onLoading?: (progress: number, message: string) => void;
}
