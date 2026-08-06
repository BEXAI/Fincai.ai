/**
 * Fincai Autonomous Pricing Engine - Time Utilities
 * 
 * Handles time-to-expiry calculations with special handling
 * for 0DTE (Zero Days to Expiration) options.
 * 
 * License: MIT (Original optlib by Davis Edwards / Daniel Rojas)
 */

import { MIN_TIME_TO_EXPIRY, CALENDAR_DAYS_PER_YEAR, TRADING_DAYS_PER_YEAR } from './types';

/**
 * Calculate time to expiry in years from a Date object
 * Uses calendar days (365.25) for consistency
 */
export function calculateTimeToExpiry(
  expirationDate: Date,
  currentDate: Date = new Date()
): number {
  const msPerYear = CALENDAR_DAYS_PER_YEAR * 24 * 60 * 60 * 1000;
  const timeDiff = expirationDate.getTime() - currentDate.getTime();
  
  if (timeDiff <= 0) {
    return 0;
  }
  
  return timeDiff / msPerYear;
}

/**
 * Calculate time to expiry with market close precision
 * Options typically expire at 4:00 PM ET on expiration date
 */
export function calculateTimeToExpiryWithMarketClose(
  expirationDate: Date,
  currentDate: Date = new Date()
): number {
  const expiryWithClose = new Date(expirationDate);
  expiryWithClose.setUTCHours(21, 0, 0, 0); // 4 PM ET = 21:00 UTC (during EST)
  
  return calculateTimeToExpiry(expiryWithClose, currentDate);
}

/**
 * Clamp time to expiry to prevent numerical instability
 * Used for 0DTE options where T → 0 causes division issues
 */
export function clampTimeToExpiry(T: number): number {
  if (T <= 0) {
    return MIN_TIME_TO_EXPIRY;
  }
  return Math.max(T, MIN_TIME_TO_EXPIRY);
}

/**
 * Check if an option is 0DTE (expires today)
 */
export function is0DTE(expirationDate: Date, currentDate: Date = new Date()): boolean {
  const expDate = new Date(expirationDate);
  const curDate = new Date(currentDate);
  
  return (
    expDate.getFullYear() === curDate.getFullYear() &&
    expDate.getMonth() === curDate.getMonth() &&
    expDate.getDate() === curDate.getDate()
  );
}

/**
 * Check if time to expiry is below threshold requiring special handling
 */
export function requiresIntrinsicOnly(T: number): boolean {
  return T < MIN_TIME_TO_EXPIRY * 10; // Less than ~1 hour
}

/**
 * Convert annualized theta to daily theta
 */
export function annualizedToDailyTheta(annualizedTheta: number): number {
  return annualizedTheta / CALENDAR_DAYS_PER_YEAR;
}

/**
 * Convert time in trading days to years
 */
export function tradingDaysToYears(tradingDays: number): number {
  return tradingDays / TRADING_DAYS_PER_YEAR;
}

/**
 * Convert time in calendar days to years
 */
export function calendarDaysToYears(calendarDays: number): number {
  return calendarDays / CALENDAR_DAYS_PER_YEAR;
}

/**
 * Parse expiration date from OCC symbol format
 * OCC format: SYMBOL + YYMMDD + C/P + Strike*1000
 * Example: AAPL231215C00175000
 */
export function parseExpirationFromOCC(occSymbol: string): Date | null {
  const match = occSymbol.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);
  if (!match) return null;
  
  const dateStr = match[2];
  const year = 2000 + parseInt(dateStr.substring(0, 2));
  const month = parseInt(dateStr.substring(2, 4)) - 1;
  const day = parseInt(dateStr.substring(4, 6));
  
  return new Date(year, month, day);
}

/**
 * Get the next standard expiration date (typically Friday)
 */
export function getNextExpirationDate(fromDate: Date = new Date()): Date {
  const date = new Date(fromDate);
  const dayOfWeek = date.getDay();
  const daysUntilFriday = (5 - dayOfWeek + 7) % 7 || 7;
  
  date.setDate(date.getDate() + daysUntilFriday);
  date.setHours(16, 0, 0, 0); // 4 PM market close
  
  return date;
}

/**
 * Check if a date is a market holiday (simplified - major US holidays)
 */
export function isMarketHoliday(date: Date): boolean {
  const month = date.getMonth();
  const day = date.getDate();
  const dayOfWeek = date.getDay();
  
  // New Year's Day
  if (month === 0 && day === 1) return true;
  
  // Independence Day
  if (month === 6 && day === 4) return true;
  
  // Christmas
  if (month === 11 && day === 25) return true;
  
  // Thanksgiving (4th Thursday of November)
  if (month === 10 && dayOfWeek === 4 && day >= 22 && day <= 28) return true;
  
  return false;
}
