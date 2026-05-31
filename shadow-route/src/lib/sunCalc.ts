import SunCalc from 'suncalc';

export interface SunPosition {
  azimuthDeg: number;
  altitudeDeg: number;
  shadowLengthPerMeter: number;
}

export function getSunPosition(lat: number, lng: number, date: Date): SunPosition {
  const pos = SunCalc.getPosition(date, lat, lng);
  const azimuthDeg = ((pos.azimuth * 180 / Math.PI) + 180) % 360;
  const altitudeDeg = pos.altitude * 180 / Math.PI;
  const shadowLengthPerMeter = altitudeDeg > 1 ? 1 / Math.tan(pos.altitude) : Infinity;
  return { azimuthDeg, altitudeDeg, shadowLengthPerMeter };
}

export function getShadowBearing(sunAzimuthDeg: number): number {
  return (sunAzimuthDeg + 180) % 360;
}

export function isNight(lat: number, lng: number, date: Date): boolean {
  return getSunPosition(lat, lng, date).altitudeDeg < 0;
}
