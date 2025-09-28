export const calculatePriceRanges = (prices) => {
  if (!prices || prices.length === 0) return [];
  
  const sortedPrices = prices.sort((a, b) => a - b);
  const min = sortedPrices[0];
  const max = sortedPrices[sortedPrices.length - 1];
  
  const ranges = [];
  
  // Calculate dynamic ranges based on price distribution
  const priceGap = max - min;
  
  if (priceGap < 1000) {
    // Small price range
    ranges.push(
      Math.ceil(min + priceGap * 0.3),
      Math.ceil(min + priceGap * 0.6),
      Math.ceil(min + priceGap * 0.9)
    );
  } else {
    // Larger price range - use standard intervals
    const intervals = [100, 200, 500, 1000, 2000, 5000, 10000, 20000];
    
    intervals.forEach(interval => {
      if (interval > min && interval < max * 1.2) {
        ranges.push(interval);
      }
    });
  }
  
  // Round to nearest 50 or 100
  return ranges.map(price => {
    if (price < 1000) return Math.round(price / 50) * 50;
    return Math.round(price / 100) * 100;
  }).filter((value, index, self) => self.indexOf(value) === index);
};