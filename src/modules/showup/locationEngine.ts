import type {
  AttendanceLocationStatus,
  NormalizedLocationStatus,
  AttendanceDeviceType,
  AttendanceDeviceInfo,
  OfficeLocationConfig,
} from '../../core/types';

// ============================================================================
// OFFICE LOCATION GEOFENCING & DEVICE DETECTION ENGINE (locationEngine.ts)
// ============================================================================
// 1. Haversine great-circle distance in meters against Admin-configured office
//    coordinates & radius -> 'In Office' | 'Outside Office' | 'Location Unavailable'.
// 2. Reliable browser/device detection -> Device Type (Mobile Phone, Tablet,
//    Laptop/Desktop, Unknown), OS, Browser, and User-Agent for audit logs.
// 3. Never uses IP address alone and never assumes 'In Office' when GPS fails.
// ============================================================================

const EARTH_RADIUS_METERS = 6371000;

export const DEFAULT_OFFICE_RADIUS_METERS = 150;

/**
 * Normalizes legacy 'Office' status values to 'In Office'.
 */
export function normalizeLocationStatus(
  status?: AttendanceLocationStatus | string | null
): NormalizedLocationStatus {
  if (status === 'In Office' || status === 'Office') return 'In Office';
  if (status === 'Outside Office') return 'Outside Office';
  return 'Location Unavailable';
}

/**
 * Normalizes legacy deviceType strings ('Desktop / Laptop', 'Mobile / Tablet')
 * to the canonical AttendanceDeviceType union.
 */
export function normalizeDeviceType(
  deviceType?: string | null
): AttendanceDeviceType {
  if (deviceType === 'Mobile Phone' || deviceType === 'Mobile / Tablet') {
    return 'Mobile Phone';
  }
  if (deviceType === 'Tablet') return 'Tablet';
  if (deviceType === 'Laptop/Desktop' || deviceType === 'Desktop / Laptop') {
    return 'Laptop/Desktop';
  }
  return 'Unknown';
}

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
 * - If office location is not yet configured -> 'Outside Office' (never assumes In Office)
 * - If distance <= configured radius -> 'In Office'
 * - Otherwise -> 'Outside Office'
 */
export function evaluateAttendanceLocation(
  coords: { latitude: number; longitude: number } | null | undefined,
  officeConfig: OfficeLocationConfig | null | undefined
): {
  locationStatus: NormalizedLocationStatus;
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
    locationStatus: distance <= radius ? 'In Office' : 'Outside Office',
    distanceFromOfficeMeters: distance,
  };
}

/**
 * Detects Device Type (Mobile Phone, Tablet, Laptop/Desktop, or Unknown),
 * Operating System, Browser, and raw User-Agent string.
 * Safe fallback: never throws and records 'Unknown' if undetectable.
 */
export function detectAttendanceDevice(
  overrideUa?: string,
  overrideMaxTouchPoints?: number,
  overridePlatform?: string
): AttendanceDeviceInfo {
  try {
    const ua =
      overrideUa !== undefined
        ? overrideUa
        : typeof navigator !== 'undefined'
        ? navigator.userAgent || ''
        : '';
    const maxTouchPoints =
      overrideMaxTouchPoints !== undefined
        ? overrideMaxTouchPoints
        : typeof navigator !== 'undefined'
        ? navigator.maxTouchPoints || 0
        : 0;
    const platform =
      overridePlatform !== undefined
        ? overridePlatform
        : typeof navigator !== 'undefined'
        ? navigator.platform || ''
        : '';

    const cleanUa = ua.trim();
    if (!cleanUa) {
      return {
        deviceType: 'Unknown',
        os: 'Unknown',
        browser: 'Unknown',
        userAgent: 'Unknown',
      };
    }

    // 1. Detect Operating System
    const isIpadOsDesktopUa =
      /Macintosh/i.test(cleanUa) &&
      (maxTouchPoints > 1 || /iPad/i.test(platform));
    let os = 'Unknown';
    if (/iPad/i.test(cleanUa) || isIpadOsDesktopUa) {
      os = 'iPadOS';
    } else if (/iPhone|iPod/i.test(cleanUa)) {
      os = 'iOS';
    } else if (/Android/i.test(cleanUa)) {
      os = 'Android';
    } else if (/Windows NT|Win64|Win32|Windows/i.test(cleanUa)) {
      os = 'Windows';
    } else if (/Macintosh|Mac OS X/i.test(cleanUa)) {
      os = 'macOS';
    } else if (/CrOS/i.test(cleanUa)) {
      os = 'ChromeOS';
    } else if (/Linux|X11/i.test(cleanUa)) {
      os = 'Linux';
    }

    // 2. Detect Browser (order matters because Chrome UA contains Safari, Edge contains Chrome, etc.)
    let browser = 'Unknown';
    if (/EdgA?|Edge|EdgiOS/i.test(cleanUa)) {
      browser = 'Edge';
    } else if (/OPR\/|Opera/i.test(cleanUa)) {
      browser = 'Opera';
    } else if (/Firefox|FxiOS/i.test(cleanUa)) {
      browser = 'Firefox';
    } else if (/Chrome|CriOS/i.test(cleanUa)) {
      browser = 'Chrome';
    } else if (/Safari/i.test(cleanUa)) {
      browser = 'Safari';
    }

    // 3. Detect Device Type (Tablet vs Mobile Phone vs Laptop/Desktop)
    let deviceType: AttendanceDeviceType = 'Unknown';
    const isTablet =
      /iPad|Tablet|PlayBook|Silk/i.test(cleanUa) ||
      isIpadOsDesktopUa ||
      (/Android/i.test(cleanUa) && !/Mobile/i.test(cleanUa));
    const isMobilePhone =
      !isTablet &&
      /iPhone|iPod|Android.*Mobile|Windows Phone|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(
        cleanUa
      );

    if (isTablet) {
      deviceType = 'Tablet';
    } else if (isMobilePhone) {
      deviceType = 'Mobile Phone';
    } else if (
      os === 'Windows' ||
      os === 'macOS' ||
      os === 'Linux' ||
      os === 'ChromeOS'
    ) {
      deviceType = 'Laptop/Desktop';
    }

    return {
      deviceType,
      os,
      browser,
      userAgent: cleanUa.slice(0, 300),
    };
  } catch {
    return {
      deviceType: 'Unknown',
      os: 'Unknown',
      browser: 'Unknown',
      userAgent: 'Unknown',
    };
  }
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
