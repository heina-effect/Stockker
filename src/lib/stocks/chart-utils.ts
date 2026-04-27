export function aggregateToOHLC(ticks: { time: string; price?: number; open?: number; close?: number; high?: number; low?: number; volume?: number }[]) {
  // Sort ticks chronologically by time to ensure open/close are correct
  const sortedTicks = [...ticks].sort((a, b) => a.time.localeCompare(b.time));
  
  const buckets: Record<string, any> = {};
  for (const tick of sortedTicks) {
    if (!tick.time) continue;
    
    let hourStr = "";
    let minStr = "";
    if (tick.time.includes(":")) {
      const parts = tick.time.split(":");
      hourStr = parts[0];
      minStr = parts[1];
    } else if (tick.time.length >= 4) {
      hourStr = tick.time.substring(0, 2);
      minStr = tick.time.substring(2, 4);
    } else {
      hourStr = "00";
      minStr = "00";
    }

    const minFloor = Math.floor(parseInt(minStr, 10) / 10) * 10;
    const bucketTime = `${hourStr}:${minFloor.toString().padStart(2, '0')}`;

    if (!buckets[bucketTime]) {
      buckets[bucketTime] = {
        time: bucketTime, 
        open: tick.open ?? tick.price ?? 0, 
        high: tick.high ?? tick.price ?? 0, 
        low: tick.low ?? tick.price ?? 0, 
        close: tick.close ?? tick.price ?? 0,
        volume: tick.volume || 0,
      };
    } else {
      const b = buckets[bucketTime];
      b.high = Math.max(b.high, tick.high ?? tick.price ?? 0);
      b.low = Math.min(b.low, tick.low ?? tick.price ?? 0);
      b.close = tick.close ?? tick.price ?? 0;
      b.volume += (tick.volume || 0);
    }
  }
  
  return Object.values(buckets).map((d) => {
    d.isUp = d.close >= d.open;
    d.body = [Math.min(d.open, d.close), Math.max(d.open, d.close)];
    return d;
  });
}

export function calculateMA<T extends Record<string, unknown>>(data: T[], period: number, key: string = 'close') {
  return data.map((d, i, arr) => {
    if (i < period - 1) return { ...d }; 
    let sum = 0;
    for (let j = 0; j < period; j++) {
      const val = arr[i - j][key];
      // If any of the required previous periods has null/undefined, MA is null
      if (val === null || val === undefined) {
        return { ...d, [`ma${period}`]: null };
      }
      sum += Number(val);
    }
    return { ...d, [`ma${period}`]: sum / period };
  });
}
