import { describe, it, expect } from 'vitest';
import { aggregateToOHLC, calculateMA } from './chart-utils';

describe('Chart Utils - Intraday', () => {
  it('should correctly sort internal ticks and aggregate OHLC', () => {
    // Unordered ticks: 10:05 closing at 110, 10:01 opening at 100
    const unorderedTicks = [
      { time: '10:05', price: 110, volume: 10 },
      { time: '10:01', price: 100, volume: 5 },
      { time: '10:02', price: 120, volume: 2 },
    ];
    
    const result = aggregateToOHLC(unorderedTicks);
    
    expect(result).toHaveLength(1);
    expect(result[0].time).toBe('10:00');
    expect(result[0].open).toBe(100); // 10:01 is chronologically first
    expect(result[0].close).toBe(110); // 10:05 is chronologically last
    expect(result[0].high).toBe(120);
    expect(result[0].low).toBe(100);
    expect(result[0].volume).toBe(17);
  });

  it('should calculate MA correctly and skip if null exists in interval', () => {
    const data = [
      { close: 10 },
      { close: 20 },
      { close: null },
      { close: 30 },
      { close: 40 },
      { close: 50 },
    ];
    
    const maData = calculateMA(data, 3);
    
    // First 2 should have no ma3
    expect(maData[0].ma3).toBeUndefined();
    expect(maData[1].ma3).toBeUndefined();
    
    // Index 2, 3, 4 includes the null value in lookback, must be null
    expect(maData[2].ma3).toBeNull();
    expect(maData[3].ma3).toBeNull();
    expect(maData[4].ma3).toBeNull();
    
    // Index 5 (30, 40, 50) is valid
    expect(maData[5].ma3).toBe(40);
  });
});
