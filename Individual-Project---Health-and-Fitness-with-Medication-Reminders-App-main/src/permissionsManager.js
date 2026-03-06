// PERMISSIONS MANAGER - Handles all app permissions on startup

import { Capacitor } from "@capacitor/core";

// Check if we're on a native platform
const isNative = () => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

// Check if we're on Android
const isAndroid = () => {
  try {
    return Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
};

// Check if we're on iOS
const isIOS = () => {
  try {
    return Capacitor.getPlatform() === "ios";
  } catch {
    return false;
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// NOTIFICATION PERMISSIONS
// ══════════════════════════════════════════════════════════════════════════════

export const requestNotificationPermission = async () => {
  // For web/PWA
  if ("Notification" in window) {
    if (Notification.permission === "granted") {
      return true;
    }
    if (Notification.permission !== "denied") {
      const permission = await Notification.requestPermission();
      return permission === "granted";
    }
  }
  return false;
};

// ══════════════════════════════════════════════════════════════════════════════
// BIOMETRIC PERMISSIONS
// ══════════════════════════════════════════════════════════════════════════════

let biometricPlugin = null;

const loadBiometricPlugin = async () => {
  if (biometricPlugin) return biometricPlugin;

  if (!isNative()) return null;

  try {
    const moduleName = "capacitor-native-biometric";
    const module = await import(/* webpackIgnore: true */ /* @vite-ignore */ moduleName);
    biometricPlugin = module.NativeBiometric;
    return biometricPlugin;
  } catch (error) {
    console.log("Biometric plugin not available:", error);
    return null;
  }
};

export const checkBiometricAvailability = async () => {
  if (!isNative()) {
    return { isAvailable: false, biometryType: "none" };
  }

  try {
    const plugin = await loadBiometricPlugin();
    if (!plugin) {
      return { isAvailable: false, biometryType: "none" };
    }

    const result = await plugin.isAvailable();

    let biometryTypeName = "Biometric";
    if (result.biometryType === 1) biometryTypeName = "Touch ID";
    else if (result.biometryType === 2) biometryTypeName = "Face ID";
    else if (result.biometryType === 3) biometryTypeName = "Fingerprint";
    else if (result.biometryType === 4)
      biometryTypeName = "Face Authentication";

    return {
      isAvailable: result.isAvailable,
      biometryType: biometryTypeName,
    };
  } catch (error) {
    console.log("Biometric check error:", error);
    return { isAvailable: false, biometryType: "none" };
  }
};

export const saveBiometricCredentials = async (email, password) => {
  if (!isNative()) return false;

  try {
    const plugin = await loadBiometricPlugin();
    if (!plugin) return false;

    await plugin.setCredentials({
      username: email,
      password: password,
      server: "com.medfit.health",
    });
    return true;
  } catch (error) {
    console.log("Save credentials error:", error);
    return false;
  }
};

export const getBiometricCredentials = async () => {
  if (!isNative()) return null;

  try {
    const plugin = await loadBiometricPlugin();
    if (!plugin) return null;

    // First verify identity
    await plugin.verifyIdentity({
      reason: "Log in to MedFit Health",
      title: "MedFit Health",
      subtitle: "Use biometrics to log in",
      useFallback: true,
      fallbackTitle: "Use Passcode",
    });

    // Then get credentials
    const credentials = await plugin.getCredentials({
      server: "com.medfit.health",
    });

    if (credentials?.username && credentials?.password) {
      return {
        email: credentials.username,
        password: credentials.password,
      };
    }
    return null;
  } catch (error) {
    console.log("Get credentials error:", error);
    return null;
  }
};

export const hasBiometricCredentials = async () => {
  if (!isNative()) return false;

  try {
    const plugin = await loadBiometricPlugin();
    if (!plugin) return false;

    const credentials = await plugin.getCredentials({
      server: "com.medfit.health",
    });
    return !!(credentials?.username && credentials?.password);
  } catch {
    return false;
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// HEALTH CONNECT (Android) / HEALTHKIT (iOS)
// ══════════════════════════════════════════════════════════════════════════════

let healthPlugin = null;

const loadHealthPlugin = async () => {
  if (healthPlugin) return healthPlugin;

  try {
    if (isIOS()) {
      const healthModuleName = "capacitor-health";
      const module = await import(/* webpackIgnore: true */ /* @vite-ignore */ healthModuleName);
      healthPlugin = module.CapacitorHealthkit;
    } else if (isAndroid()) {
      // Use the custom native HealthConnect plugin registered on the Capacitor bridge
      const plugins = (await import("@capacitor/core")).Capacitor.Plugins;
      healthPlugin = plugins?.HealthConnect ?? null;
    }
    return healthPlugin;
  } catch (error) {
    console.log("Health plugin not available:", error);
    return null;
  }
};

export const checkHealthAvailability = async () => {
  if (!isNative()) return false;

  try {
    const plugin = await loadHealthPlugin();
    if (!plugin) return false;

    if (isAndroid()) {
      const result = await plugin.checkAvailability();
      return result?.available || false;
    } else {
      const result = await plugin.isAvailable();
      return result?.available || false;
    }
  } catch (error) {
    console.log("Health availability check error:", error);
    return false;
  }
};

export const requestHealthPermissions = async () => {
  if (!isNative()) return false;

  try {
    const plugin = await loadHealthPlugin();
    if (!plugin) return false;

    if (isAndroid()) {
      const result = await plugin.requestPermissions();
      return result?.granted || false;
    } else {
      const readTypes = [
        "HKQuantityTypeIdentifierStepCount",
        "HKQuantityTypeIdentifierActiveEnergyBurned",
        "HKQuantityTypeIdentifierHeartRate",
        "HKQuantityTypeIdentifierDistanceWalkingRunning",
      ];

      await plugin.requestAuthorization({
        all: readTypes,
        read: readTypes,
        write: [],
      });

      return true;
    }
  } catch (error) {
    console.log("Health authorization error:", error);
    return false;
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// MASTER PERMISSION REQUEST - Call this on app startup
// ══════════════════════════════════════════════════════════════════════════════

export const requestAllPermissions = async () => {
  const results = {
    notifications: false,
    biometric: { available: false, type: "none" },
    health: false,
  };

  // Request notification permission
  results.notifications = await requestNotificationPermission();

  // Check biometric availability
  results.biometric = await checkBiometricAvailability();

  // Check health availability (don't request yet - do that when user goes to fitness page)
  results.health = await checkHealthAvailability();

  return results;
};

export { isNative, isAndroid, isIOS };
