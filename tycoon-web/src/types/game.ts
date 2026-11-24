export type BuyAmount = 1 | 5 | 10;
export type CostQuotes = Record<BuyAmount, string>;

export interface PlayerState {
  id: string;
  username: string;
  balance: string;
  offlineEarned: string;
  lifetimeEarnings: string;
  incomePerSecond: string;
  prestigeMultiplier: string;
  rebirthCount: number;
  lastSyncedAt: string;
  serverTime: string;
}

export interface BusinessItem {
  slug: string;
  name: string;
  quantity: number;
  baseIncome: string;
  nextUnitCost: string;
  costs: CostQuotes;
}

export interface UpgradeItem {
  slug: string;
  name: string;
  description: string;
  cost: string;
  multiplier: string;
  businessSlug: string | null;
  businessName: string;
  purchased: boolean;
}

export interface RebirthHistoryItem {
  id: string;
  rebirthNumber: number;
  earningsAtRebirth: string;
  multiplierGained: string;
  newTotalMultiplier: string;
  createdAt: string;
}

export interface RebirthPreviewState {
  canRebirth: boolean;
  multiplierGained: string;
  newTotalMultiplier: string;
  nextThresholdEarnings: string;
}

export interface RebirthState extends RebirthPreviewState {
  history: RebirthHistoryItem[];
}

export interface GameStateResponse {
  player: PlayerState;
  businesses: BusinessItem[];
  upgrades: UpgradeItem[];
  rebirth: RebirthState;
}

export interface SessionResponse extends GameStateResponse {
  sessionToken: string;
  isNewSession: boolean;
}

export interface BuyBusinessResponse {
  purchased: {
    businessSlug: string;
    businessName: string;
    amountBought: number;
    totalCost: string;
    newQuantity: number;
    nextUnitCost: string;
    costs: CostQuotes;
  };
  economy: {
    offlineEarned: string;
    balance: string;
    lifetimeEarnings: string;
    incomePerSecond: string;
    lastSyncedAt: string;
  };
  rebirthPreview: RebirthPreviewState;
}

export interface BuyUpgradeResponse {
  purchased: {
    upgradeSlug: string;
    upgradeName: string;
    cost: string;
    multiplier: string;
  };
  economy: {
    offlineEarned: string;
    balance: string;
    lifetimeEarnings: string;
    incomePerSecond: string;
    lastSyncedAt: string;
  };
  rebirthPreview: RebirthPreviewState;
}

export interface RebirthResponse {
  rebirthRecord: RebirthHistoryItem;
  state: GameStateResponse;
}