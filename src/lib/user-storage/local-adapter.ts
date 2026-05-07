"use client";

const IS_BROWSER = typeof window !== "undefined";

export interface UserPreferences {
  theme: "light" | "dark" | "system";
  chartMode: "daily" | "intraday";
}

export interface RecentSearchItem {
  symbol: string;
  name: string;
  type?: string;
}

export interface UserStorageSchema {
  watchlist: string[];
  recentSearches: RecentSearchItem[];
  recentViewed: string[];
  buyPrices: Record<string, number>;
  bookmarkedReports: string[];
  preferences: UserPreferences;
}

const DEFAULT_STATE: UserStorageSchema = {
  watchlist: ["005930", "000660"],
  recentSearches: [],
  recentViewed: [],
  buyPrices: {},
  bookmarkedReports: [],
  preferences: {
    theme: "system",
    chartMode: "daily"
  }
};

const STORAGE_KEY = "stockker_user_data_v1";

/**
 * Local-First User Persistence Adapter
 * (추후 Server 연동 시 이 인터페이스만 교체하여 구현 가능)
 */
export const LocalStorageAdapter = {
  getAll(): UserStorageSchema {
    if (!IS_BROWSER) return DEFAULT_STATE;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    try {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_STATE, ...parsed, preferences: { ...DEFAULT_STATE.preferences, ...(parsed.preferences || {}) } }; // Migration & fallback
    } catch {
      return DEFAULT_STATE;
    }
  },

  setAll(data: Partial<UserStorageSchema>) {
    if (!IS_BROWSER) return;
    const current = this.getAll();
    const next = { ...current, ...data };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  },

  getBuyPrice(symbol: string): number | undefined {
    const data = this.getAll();
    return data.buyPrices[symbol];
  },

  setBuyPrice(symbol: string, price: number) {
    const data = this.getAll();
    data.buyPrices[symbol] = price;
    this.setAll({ buyPrices: data.buyPrices });
  },

  removeBuyPrice(symbol: string) {
    const data = this.getAll();
    delete data.buyPrices[symbol];
    this.setAll({ buyPrices: data.buyPrices });
  },

  addToWatchlist(symbol: string) {
    const data = this.getAll();
    if (!data.watchlist.includes(symbol)) {
      this.setAll({ watchlist: [...data.watchlist, symbol] });
    }
  },

  removeFromWatchlist(symbol: string) {
    const data = this.getAll();
    this.setAll({ watchlist: data.watchlist.filter(s => s !== symbol) });
  },
  
  addRecentSearch(item: RecentSearchItem) {
    const data = this.getAll();
    const updated = [item, ...data.recentSearches.filter(s => typeof s === "string" ? s !== item.symbol : s.symbol !== item.symbol)].slice(0, 10);
    this.setAll({ recentSearches: updated });
  },

  addRecentViewed(symbol: string) {
    const data = this.getAll();
    const updated = [symbol, ...data.recentViewed.filter(s => s !== symbol)].slice(0, 10);
    this.setAll({ recentViewed: updated });
  },

  toggleBookmark(symbol: string) {
    const data = this.getAll();
    if (data.bookmarkedReports.includes(symbol)) {
      this.setAll({ bookmarkedReports: data.bookmarkedReports.filter(s => s !== symbol) });
    } else {
      this.setAll({ bookmarkedReports: [...data.bookmarkedReports, symbol] });
    }
  },

  setPreference<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) {
    const data = this.getAll();
    this.setAll({ preferences: { ...data.preferences, [key]: value } });
  }
};
