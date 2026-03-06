// ══════════════════════════════════════════════════════════════════════════════
// BIOMETRIC AUTHENTICATION SERVICE
// ══════════════════════════════════════════════════════════════════════════════
//
// This service handles Face ID / Touch ID / Fingerprint authentication.
// It safely handles cases where the native plugin isn't available.
//
// ══════════════════════════════════════════════════════════════════════════════

import { Capacitor } from "@capacitor/core";

// Lazy load the biometric plugin to prevent app crash
let NativeBiometric = null;

const loadBiometricPlugin = async () => {
  if (NativeBiometric) return NativeBiometric;

  try {
    const moduleName = "capacitor-native-biometric";
    const module = await import(/* webpackIgnore: true */ /* @vite-ignore */ moduleName);
    NativeBiometric = module.NativeBiometric;
    return NativeBiometric;
  } catch (error) {
    console.warn("Biometric plugin not available:", error);
    return null;
  }
};

const SERVER_ID = "com.medfithealth.app";

/**
 * Check if running on native platform
 */
export const isNativePlatform = () => {
  return Capacitor.isNativePlatform();
};

/**
 * Check if biometric authentication is available
 */
export const isBiometricAvailable = async () => {
  if (!isNativePlatform()) {
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
    console.error("Biometric check error:", error);
    return { isAvailable: false, biometryType: "none" };
  }
};

/**
 * Save credentials securely
 */
export const saveCredentials = async (email, password) => {
  if (!isNativePlatform()) return false;

  try {
    const plugin = await loadBiometricPlugin();
    if (!plugin) return false;

    await plugin.setCredentials({
      username: email,
      password: password,
      server: SERVER_ID,
    });
    console.log("✅ Credentials saved");
    return true;
  } catch (error) {
    console.error("Save credentials error:", error);
    return false;
  }
};

/**
 * Check if credentials exist
 */
export const hasStoredCredentials = async () => {
  if (!isNativePlatform()) return false;

  try {
    const plugin = await loadBiometricPlugin();
    if (!plugin) return false;

    const credentials = await plugin.getCredentials({
      server: SERVER_ID,
    });
    return !!(credentials?.username && credentials?.password);
  } catch (error) {
    // No credentials stored - this is normal, not an error
    return false;
  }
};

/**
 * Authenticate with biometric and get credentials
 */
export const authenticateWithBiometric = async (
  reason = "Log in to MedFit Health",
) => {
  if (!isNativePlatform()) {
    return { success: false, error: "Not on native platform" };
  }

  try {
    const plugin = await loadBiometricPlugin();
    if (!plugin) {
      return { success: false, error: "Biometric not available" };
    }

    await plugin.verifyIdentity({
      reason: reason,
      title: "MedFit Health",
      subtitle: "Log in with biometrics",
      useFallback: true,
      fallbackTitle: "Use Passcode",
    });

    const credentials = await plugin.getCredentials({
      server: SERVER_ID,
    });

    if (credentials?.username && credentials?.password) {
      return {
        success: true,
        email: credentials.username,
        password: credentials.password,
      };
    }
    return { success: false, error: "No credentials found" };
  } catch (error) {
    console.error("Biometric auth error:", error);
    return { success: false, error: error.message || "Authentication failed" };
  }
};

/**
 * Delete stored credentials
 */
export const deleteCredentials = async () => {
  if (!isNativePlatform()) return false;

  try {
    const plugin = await loadBiometricPlugin();
    if (!plugin) return false;

    await plugin.deleteCredentials({ server: SERVER_ID });
    console.log("✅ Credentials deleted");
    return true;
  } catch (error) {
    console.error("Delete credentials error:", error);
    return false;
  }
};
