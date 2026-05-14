import { describe, it, expect, beforeEach } from 'vitest';
import { LocalStorageAdapter } from './local-adapter';

describe('User Persistence - LocalStorageAdapter', () => {
  beforeEach(() => {
    // Clear localStorage mock if we run in browser-like env
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  it('starts with an empty explicit-save watchlist', () => {
    expect(LocalStorageAdapter.getAll().watchlist).toEqual([]);
  });

  it('should handle buy price persistence correctly', () => {
    // Explicitly set
    LocalStorageAdapter.setBuyPrice('005930', 70000);
    
    // Explicitly get
    expect(LocalStorageAdapter.getBuyPrice('005930')).toBe(70000);
    
    // Other symbols remain undefined
    expect(LocalStorageAdapter.getBuyPrice('000660')).toBeUndefined();
  });
  
  it('should properly isolate symbol data', () => {
      LocalStorageAdapter.setAll({
          watchlist: ["005930", "000660"],
          buyPrices: {
              "005930": 70000
          }
      });
      
      const all = LocalStorageAdapter.getAll();
      expect(all.watchlist).toContain("005930");
      expect(all.buyPrices["000660"]).toBeUndefined();
  });

  it('adds watchlist symbols once and persists them', () => {
    LocalStorageAdapter.setAll({ watchlist: ["005930"] });
    LocalStorageAdapter.addToWatchlist("000660");
    LocalStorageAdapter.addToWatchlist("000660");

    expect(LocalStorageAdapter.getAll().watchlist).toEqual(["005930", "000660"]);
  });
});
