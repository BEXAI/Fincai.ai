/**
 * Fincai Autonomous Pricing Engine - Treasury Yield Curve Service
 * 
 * Fetches daily Treasury yield curve data from fiscaldata.treasury.gov
 * and provides interpolated risk-free rates for any maturity using
 * cubic spline interpolation.
 * 
 * The risk-free rate is critical for option pricing:
 * - 1-week option should use 1-week T-bill rate
 * - 2-year LEAP should use 2-year Treasury note rate
 * 
 * License: MIT (Original optlib by Davis Edwards / Daniel Rojas)
 */

import { YieldCurve, YieldCurvePoint } from './types';

const TREASURY_API_URL = 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service';
const YIELD_CURVE_ENDPOINT = '/v2/accounting/od/avg_interest_rates';

const MATURITY_MAPPING: { [key: string]: number } = {
  '1-month': 1/12,
  '2-month': 2/12,
  '3-month': 3/12,
  '6-month': 6/12,
  '1-year': 1,
  '2-year': 2,
  '3-year': 3,
  '5-year': 5,
  '7-year': 7,
  '10-year': 10,
  '20-year': 20,
  '30-year': 30,
};

let cachedYieldCurve: YieldCurve | null = null;
let lastFetchTime: Date | null = null;
const CACHE_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Cubic spline coefficients for a segment
 */
interface SplineSegment {
  a: number;
  b: number;
  c: number;
  d: number;
  x: number;
}

/**
 * Build cubic spline for interpolation
 */
function buildCubicSpline(points: YieldCurvePoint[]): SplineSegment[] {
  const n = points.length;
  if (n < 2) return [];
  
  // Sort by maturity
  const sorted = [...points].sort((a, b) => a.maturity - b.maturity);
  
  const x = sorted.map(p => p.maturity);
  const y = sorted.map(p => p.rate);
  
  // Natural cubic spline (second derivative = 0 at endpoints)
  const h: number[] = [];
  const alpha: number[] = [0];
  
  for (let i = 0; i < n - 1; i++) {
    h.push(x[i + 1] - x[i]);
  }
  
  for (let i = 1; i < n - 1; i++) {
    alpha.push(
      (3 / h[i]) * (y[i + 1] - y[i]) -
      (3 / h[i - 1]) * (y[i] - y[i - 1])
    );
  }
  
  const l: number[] = [1];
  const mu: number[] = [0];
  const z: number[] = [0];
  
  for (let i = 1; i < n - 1; i++) {
    l.push(2 * (x[i + 1] - x[i - 1]) - h[i - 1] * mu[i - 1]);
    mu.push(h[i] / l[i]);
    z.push((alpha[i] - h[i - 1] * z[i - 1]) / l[i]);
  }
  
  l.push(1);
  z.push(0);
  
  const c: number[] = new Array(n).fill(0);
  const b: number[] = new Array(n - 1).fill(0);
  const d: number[] = new Array(n - 1).fill(0);
  
  for (let j = n - 2; j >= 0; j--) {
    c[j] = z[j] - mu[j] * c[j + 1];
    b[j] = (y[j + 1] - y[j]) / h[j] - h[j] * (c[j + 1] + 2 * c[j]) / 3;
    d[j] = (c[j + 1] - c[j]) / (3 * h[j]);
  }
  
  const segments: SplineSegment[] = [];
  for (let i = 0; i < n - 1; i++) {
    segments.push({
      a: y[i],
      b: b[i],
      c: c[i],
      d: d[i],
      x: x[i],
    });
  }
  
  return segments;
}

/**
 * Evaluate cubic spline at point
 */
function evaluateSpline(segments: SplineSegment[], points: YieldCurvePoint[], t: number): number {
  if (segments.length === 0) {
    return 0.05; // Default 5% if no data
  }
  
  const sorted = [...points].sort((a, b) => a.maturity - b.maturity);
  
  // Clamp to valid range
  if (t <= sorted[0].maturity) {
    return sorted[0].rate;
  }
  if (t >= sorted[sorted.length - 1].maturity) {
    return sorted[sorted.length - 1].rate;
  }
  
  // Find segment
  let segmentIdx = 0;
  for (let i = 0; i < segments.length; i++) {
    if (t >= segments[i].x && (i === segments.length - 1 || t < segments[i + 1].x)) {
      segmentIdx = i;
      break;
    }
  }
  
  const seg = segments[segmentIdx];
  const dx = t - seg.x;
  
  return seg.a + seg.b * dx + seg.c * dx * dx + seg.d * dx * dx * dx;
}

/**
 * Fetch yield curve from Treasury API
 */
async function fetchYieldCurveFromTreasury(): Promise<YieldCurve | null> {
  try {
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 7); // Look back 7 days for recent data
    
    const formatDate = (d: Date) => d.toISOString().split('T')[0];
    
    const params = new URLSearchParams({
      'filter': `record_date:gte:${formatDate(startDate)},security_type_desc:eq:Treasury Bills,security_type_desc:eq:Treasury Notes,security_type_desc:eq:Treasury Bonds`,
      'sort': '-record_date',
      'page[size]': '100',
    });
    
    const response = await fetch(`${TREASURY_API_URL}${YIELD_CURVE_ENDPOINT}?${params}`);
    
    if (!response.ok) {
      console.warn(`[YieldCurve] Treasury API returned ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (!data.data || data.data.length === 0) {
      console.warn('[YieldCurve] No data from Treasury API');
      return null;
    }
    
    // Group by maturity and get latest rate
    const ratesByMaturity: { [key: string]: number } = {};
    
    for (const record of data.data) {
      const securityDesc = record.security_desc?.toLowerCase() || '';
      const rate = parseFloat(record.avg_interest_rate_amt);
      
      if (isNaN(rate)) continue;
      
      // Map security description to maturity
      for (const [key, years] of Object.entries(MATURITY_MAPPING)) {
        if (securityDesc.includes(key.replace('-', ' '))) {
          if (!ratesByMaturity[key] || ratesByMaturity[key] < rate) {
            ratesByMaturity[key] = rate;
          }
          break;
        }
      }
    }
    
    const points: YieldCurvePoint[] = Object.entries(ratesByMaturity).map(([key, rate]) => ({
      maturity: MATURITY_MAPPING[key],
      rate: rate / 100, // Convert to decimal
    }));
    
    if (points.length < 3) {
      console.warn('[YieldCurve] Insufficient yield curve points');
      return null;
    }
    
    return {
      date: formatDate(today),
      points: points.sort((a, b) => a.maturity - b.maturity),
      source: 'fiscaldata.treasury.gov',
    };
  } catch (error) {
    console.error('[YieldCurve] Failed to fetch from Treasury:', error);
    return null;
  }
}

/**
 * Get default yield curve (fallback when API unavailable)
 */
function getDefaultYieldCurve(): YieldCurve {
  const today = new Date().toISOString().split('T')[0];
  
  // Approximate current rates (as of late 2024)
  return {
    date: today,
    points: [
      { maturity: 1/12, rate: 0.0530 },   // 1-month: 5.30%
      { maturity: 3/12, rate: 0.0520 },   // 3-month: 5.20%
      { maturity: 6/12, rate: 0.0505 },   // 6-month: 5.05%
      { maturity: 1, rate: 0.0480 },      // 1-year: 4.80%
      { maturity: 2, rate: 0.0450 },      // 2-year: 4.50%
      { maturity: 5, rate: 0.0430 },      // 5-year: 4.30%
      { maturity: 10, rate: 0.0440 },     // 10-year: 4.40%
      { maturity: 30, rate: 0.0460 },     // 30-year: 4.60%
    ],
    source: 'default',
  };
}

/**
 * Get cached or fresh yield curve
 */
export async function getYieldCurve(): Promise<YieldCurve> {
  const now = new Date();
  
  // Check cache validity
  if (cachedYieldCurve && lastFetchTime) {
    const elapsed = now.getTime() - lastFetchTime.getTime();
    if (elapsed < CACHE_DURATION_MS) {
      return cachedYieldCurve;
    }
  }
  
  // Fetch fresh data
  const freshCurve = await fetchYieldCurveFromTreasury();
  
  if (freshCurve) {
    cachedYieldCurve = freshCurve;
    lastFetchTime = now;
    console.log(`[YieldCurve] Fetched ${freshCurve.points.length} points from Treasury`);
    return freshCurve;
  }
  
  // Use cached data if available
  if (cachedYieldCurve) {
    console.warn('[YieldCurve] Using stale cache data');
    return cachedYieldCurve;
  }
  
  // Fall back to defaults
  console.warn('[YieldCurve] Using default yield curve');
  const defaultCurve = getDefaultYieldCurve();
  cachedYieldCurve = defaultCurve;
  lastFetchTime = now;
  return defaultCurve;
}

/**
 * Interpolate risk-free rate for given time to expiry
 */
export async function getInterpolatedRate(T: number): Promise<number> {
  const curve = await getYieldCurve();
  const segments = buildCubicSpline(curve.points);
  return evaluateSpline(segments, curve.points, T);
}

/**
 * Get risk-free rate synchronously using cached curve
 */
export function getInterpolatedRateSync(T: number): number {
  if (!cachedYieldCurve) {
    // Use default rate if no curve loaded
    return 0.05;
  }
  const segments = buildCubicSpline(cachedYieldCurve.points);
  return evaluateSpline(segments, cachedYieldCurve.points, T);
}

/**
 * Get current yield curve status
 */
export function getYieldCurveStatus(): { 
  loaded: boolean; 
  date: string | null;
  source: string | null;
  pointCount: number;
} {
  return {
    loaded: cachedYieldCurve !== null,
    date: cachedYieldCurve?.date || null,
    source: cachedYieldCurve?.source || null,
    pointCount: cachedYieldCurve?.points.length || 0,
  };
}

/**
 * Force refresh yield curve (for admin/manual update)
 */
export async function refreshYieldCurve(): Promise<boolean> {
  lastFetchTime = null; // Invalidate cache
  const curve = await getYieldCurve();
  return curve.source !== 'default';
}

/**
 * Initialize yield curve on startup
 */
export async function initializeYieldCurve(): Promise<void> {
  console.log('[YieldCurve] Initializing...');
  await getYieldCurve();
  console.log(`[YieldCurve] Initialized with ${cachedYieldCurve?.points.length || 0} points from ${cachedYieldCurve?.source}`);
}
