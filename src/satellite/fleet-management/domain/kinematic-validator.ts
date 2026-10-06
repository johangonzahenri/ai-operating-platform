/**
 * kinematic-validator.ts
 * PROJ-03 Fleet Management & Logistics — Deterministic Kinematic & Spatial Validation
 * 
 * Invariants:
 * 1. Coordinates: WGS 84 Latitude [-90, 90], Longitude [-180, 180].
 * 2. Speed: Plausible non-negative speed, heuristic anomaly threshold (default 200 km/h).
 * 3. Heading: Angular degrees [0, 360).
 * 4. Temporal Monotonicity & Plausibility: No future drift > 5 min, displacement speed gating.
 */

import { GeoPosition, InvalidKinematicsError } from './types.js';

export const DEFAULT_MAX_PLAUSIBLE_SPEED_KMH = 200;
export const DEFAULT_MAX_FUTURE_DRIFT_MS = 5 * 60 * 1000; // 5 minutos
const EARTH_RADIUS_METERS = 6371000;

export interface CoordinateValidationResult {
  readonly valid: boolean;
  readonly reason?: string;
}

export interface SpeedValidationResult {
  readonly valid: boolean;
  readonly anomaly: boolean;
  readonly reason?: string;
}

export interface HeadingValidationResult {
  readonly valid: boolean;
  readonly reason?: string;
}

export interface TimestampValidationResult {
  readonly valid: boolean;
  readonly reason?: string;
}

export interface DisplacementValidationResult {
  readonly valid: boolean;
  readonly calculatedSpeedKmh: number;
  readonly distanceMeters: number;
  readonly anomaly: boolean;
  readonly reason?: string;
}

export class KinematicValidator {
  /**
   * Valida estrictamente límites geográficos WGS 84.
   */
  public static validateCoordinates(position: GeoPosition): CoordinateValidationResult {
    if (!position || typeof position !== 'object') {
      return { valid: false, reason: 'Objeto de posición indefinido o no válido' };
    }

    const { latitude, longitude, altitudeMeters } = position;

    if (typeof latitude !== 'number' || !Number.isFinite(latitude)) {
      return { valid: false, reason: 'Latitud debe ser un número finito' };
    }

    if (latitude < -90 || latitude > 90) {
      return { valid: false, reason: `Latitud fuera de rango [-90, 90]: ${latitude}` };
    }

    if (typeof longitude !== 'number' || !Number.isFinite(longitude)) {
      return { valid: false, reason: 'Longitud debe ser un número finito' };
    }

    if (longitude < -180 || longitude > 180) {
      return { valid: false, reason: `Longitud fuera de rango [-180, 180]: ${longitude}` };
    }

    if (altitudeMeters !== undefined) {
      if (typeof altitudeMeters !== 'number' || !Number.isFinite(altitudeMeters)) {
        return { valid: false, reason: 'Altitud debe ser un número finito' };
      }
      if (altitudeMeters < -500 || altitudeMeters > 9000) {
        return { valid: false, reason: `Altitud fuera de rango plausible terrestre [-500, 9000m]: ${altitudeMeters}` };
      }
    }

    return { valid: true };
  }

  /**
   * Valida plausibilidad de velocidad reportada por sensor.
   */
  public static validateSpeed(
    speedKmh: number,
    maxPlausibleSpeedKmh: number = DEFAULT_MAX_PLAUSIBLE_SPEED_KMH
  ): SpeedValidationResult {
    if (typeof speedKmh !== 'number' || !Number.isFinite(speedKmh)) {
      return { valid: false, anomaly: true, reason: 'Velocidad debe ser un número finito' };
    }

    if (speedKmh < 0) {
      return { valid: false, anomaly: true, reason: `Velocidad no puede ser negativa: ${speedKmh}` };
    }

    if (speedKmh > maxPlausibleSpeedKmh) {
      return {
        valid: true,
        anomaly: true,
        reason: `Velocidad reportada (${speedKmh} km/h) excede el umbral de plausibilidad física (${maxPlausibleSpeedKmh} km/h)`
      };
    }

    return { valid: true, anomaly: false };
  }

  /**
   * Valida orientación angular en grados [0, 360).
   */
  public static validateHeading(headingDeg: number): HeadingValidationResult {
    if (typeof headingDeg !== 'number' || !Number.isFinite(headingDeg)) {
      return { valid: false, reason: 'Rumbo (heading) debe ser un número finito' };
    }

    if (headingDeg < 0 || headingDeg >= 360) {
      return { valid: false, reason: `Rumbo fuera de rango angular [0, 360): ${headingDeg}` };
    }

    return { valid: true };
  }

  /**
   * Valida coherencia temporal frente al reloj de referencia para evitar timestamps futuros irreales.
   */
  public static validateTimestampFreshness(
    timestamp: number,
    referenceTime: number = Date.now(),
    maxFutureDriftMs: number = DEFAULT_MAX_FUTURE_DRIFT_MS
  ): TimestampValidationResult {
    if (typeof timestamp !== 'number' || !Number.isInteger(timestamp) || timestamp <= 0) {
      return { valid: false, reason: `Timestamp debe ser un entero positivo: ${timestamp}` };
    }

    if (timestamp > referenceTime + maxFutureDriftMs) {
      return {
        valid: false,
        reason: `Timestamp se encuentra en el futuro más allá de la deriva tolerable (+${maxFutureDriftMs}ms): ${timestamp}`
      };
    }

    return { valid: true };
  }

  /**
   * Calcula la distancia ortodrómica en metros entre dos coordenadas (Fórmula del Semiverseno / Haversine).
   */
  public static haversineDistanceMeters(p1: GeoPosition, p2: GeoPosition): number {
    const coordVal1 = this.validateCoordinates(p1);
    if (!coordVal1.valid) throw new InvalidKinematicsError(`Punto 1 inválido: ${coordVal1.reason}`);

    const coordVal2 = this.validateCoordinates(p2);
    if (!coordVal2.valid) throw new InvalidKinematicsError(`Punto 2 inválido: ${coordVal2.reason}`);

    const toRad = (deg: number) => (deg * Math.PI) / 180;

    const lat1Rad = toRad(p1.latitude);
    const lat2Rad = toRad(p2.latitude);
    const dLat = toRad(p2.latitude - p1.latitude);
    const dLon = toRad(p2.longitude - p1.longitude);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_METERS * c;
  }

  /**
   * Valida la plausibilidad cinemática de desplazamiento entre dos capturas temporales consecutivas.
   * Detecta saltos imposibles de GPS (GPS Spoofing / teleportación).
   */
  public static validateDisplacementPlausibility(
    p1: GeoPosition,
    t1: number,
    p2: GeoPosition,
    t2: number,
    maxPlausibleSpeedKmh: number = DEFAULT_MAX_PLAUSIBLE_SPEED_KMH
  ): DisplacementValidationResult {
    const deltaMs = t2 - t1;
    if (deltaMs <= 0) {
      return {
        valid: false,
        calculatedSpeedKmh: 0,
        distanceMeters: 0,
        anomaly: true,
        reason: `Delta de tiempo no monotónico o nulo entre puntos (deltaMs: ${deltaMs})`
      };
    }

    const distanceMeters = this.haversineDistanceMeters(p1, p2);
    const deltaHours = deltaMs / (1000 * 3600);
    const calculatedSpeedKmh = (distanceMeters / 1000) / deltaHours;

    if (calculatedSpeedKmh > maxPlausibleSpeedKmh) {
      return {
        valid: true,
        calculatedSpeedKmh,
        distanceMeters,
        anomaly: true,
        reason: `Velocidad media de desplazamiento (${calculatedSpeedKmh.toFixed(1)} km/h) excede el umbral de plausibilidad física (${maxPlausibleSpeedKmh} km/h). Posible anomalía o suplantación de señal.`
      };
    }

    return {
      valid: true,
      calculatedSpeedKmh,
      distanceMeters,
      anomaly: false
    };
  }
}
