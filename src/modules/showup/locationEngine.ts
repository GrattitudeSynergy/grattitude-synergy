import type {
  AttendanceLocationStatus,
  OfficeLocationConfig,
} from '../../core/types';

// ============================================================================
// OFFICE LOCATION GEOFENCING & DISTANCE ENGINE (locationEngine.ts)
// ============================================================================
// Uses the Haversine formula to compute great-circle distance in meters
// between an employee's browser GPS coordinates and the Admin-configured
// official office coordinates. Never relies on IP address alone and never
// assumes 'Office' when GPS is unavailable or office location is unset.
// ============================================================================

const EARTH_RADIUS_METERS = 6371000;

export const DEFAULT_OFFICE_RADIUS_METERS = 150;

/**
 * Computes great-circle distance in meters between two WGS-84 coordinates.
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

/**
 * Evaluates whether a set of GPS coordinates falls inside the configured
 * office geofence radius.
 * - If coordinates are missing/invalid -> 'Location Unavailable'
 * - If office location is not yet configured -> 'Outside Office' (never assumes Office)
 * - If distance <= configured radius -> 'Office'
 * - Otherwise -> 'Outside Office'
 */
export function evaluateAttendanceLocation(
  coords: { latitude: number; longitude: number } | null | undefined,
  officeConfig: OfficeLocationConfig | null | undefined
): {
  locationStatus: AttendanceLocationStatus;
  distanceFromOfficeMeters?: number;
} {
  if (
    !coords ||
    !Number.isFinite(coords.latitude) ||
    !Number.isFinite(coords.longitude)
  ) {
    return {
      locationStatus: 'Location Unavailable',
      distanceFromOfficeMeters: undefined,
    };
  }

  if (
    !officeConfig ||
    !Number.isFinite(officeConfig.latitude) ||
    !Number.isFinite(officeConfig.longitude)
  ) {
    return {
      locationStatus: 'Outside Office',
      distanceFromOfficeMeters: undefined,
    };
  }

  const radius =
    Number.isFinite(officeConfig.radiusMeters) && officeConfig.radiusMeters > 0
      ? officeConfig.radiusMeters
      : DEFAULT_OFFICE_RADIUS_METERS;

  const distance = Math.round(
    calculateDistanceMeters(
      coords.latitude,
      coords.longitude,
      officeConfig.latitude,
      officeConfig.longitude
    )
  );

  return {
    locationStatus: distance <= radius ? 'Office' : 'Outside Office',
    distanceFromOfficeMeters: distance,
  };
}

/**
 * Formats distance in meters or kilometers for Admin inspection.
 */
export function formatDistanceLabel(meters?: number): string {
  if (meters === undefined || meters === null || !Number.isFinite(meters)) {
    return '';
  }
  if (meters < 1000) {
    return `${Math.round(meters)} m from office`;
  }
  return `${(meters / 1000).toFixed(2)} km from office`;
}

/**
 * Checks whether the browser is running in a secure context (HTTPS or localhost)
 * required by the Geolocation API.
 */
export function isSecureGeolocationContext(): boolean {
  if (typeof window === 'undefined') return true;
  if (window.isSecureContext) return true;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}
