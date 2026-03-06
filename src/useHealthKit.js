// useHealthKit.js
// Fetches live health data from Android Health Connect via HealthPlugin.kt.
// Bridge: JS → window.Capacitor.Plugins.HealthConnect → HealthPlugin.kt → Health Connect API

import { useCallback, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";

const isAndroid = () => Capacitor.getPlatform() === "android";

const getPlugin = () => {
  if (typeof window === "undefined") return null;
  const p = window.Capacitor?.Plugins?.HealthConnect;
  if (!p)
    console.warn(
      "[health] HealthConnect plugin not on bridge — run: npx cap sync android",
    );
  return p || null;
};

const buildEmptyWeek = () => {
  const today = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    return {
      date: d.toISOString().split("T")[0],
      dayName: d.toLocaleDateString("en-GB", { weekday: "short" }),
      steps: 0,
    };
  });
};

const blankHealthData = () => ({
  steps: 0,
  calories: 0,
  activeCalories: 0,
  distance: 0,
  heartRate: null,
  isFromHealthKit: false,
});

export const useHealthKit = () => {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [healthData, setHealthData] = useState(blankHealthData());
  const [weeklySteps, setWeeklySteps] = useState(buildEmptyWeek());

  // ── Fetch today's data ──────────────────────────────────────────────────────
  const fetchTodayData = useCallback(async () => {
    const plugin = getPlugin();
    if (!plugin) return;

    const [stepsRes, calRes, distRes] = await Promise.allSettled([
      plugin.getTodaySteps(),
      plugin.getTodayCalories(),
      plugin.getTodayDistance(),
    ]);

    const steps =
      stepsRes.status === "fulfilled" ? Number(stepsRes.value?.steps ?? 0) : 0;
    const calories =
      calRes.status === "fulfilled" ? Number(calRes.value?.calories ?? 0) : 0;
    const distance =
      distRes.status === "fulfilled" ? Number(distRes.value?.distance ?? 0) : 0;

    console.log(
      "[health] Today → steps:",
      steps,
      "| cal:",
      calories,
      "| dist:",
      distance,
      "km",
    );

    setHealthData({
      steps,
      calories,
      activeCalories: calories,
      distance,
      heartRate: null,
      isFromHealthKit: true,
    });
  }, []);

  // ── Fetch 7-day weekly steps ────────────────────────────────────────────────
  const fetchWeeklySteps = useCallback(async () => {
    const plugin = getPlugin();
    if (!plugin) return;

    const result = await plugin.getWeeklySteps();
    console.log("[health] getWeeklySteps raw result:", JSON.stringify(result));

    if (!result?.week) return;

    const raw = result.week;
    const week = Array.isArray(raw) ? raw : Object.values(raw);

    if (week.length > 0) {
      const normalised = week.map((d) => ({
        date: d.date || "",
        dayName: d.dayName || "",
        steps: Number(d.steps) || 0,
      }));
      console.log(
        "[health] Weekly steps normalised:",
        normalised.map((d) => `${d.dayName}:${d.steps}`),
      );
      setWeeklySteps(normalised);
    }
  }, []);

  // ── Combined fetch ──────────────────────────────────────────────────────────
  const fetchAllData = useCallback(async () => {
    try {
      await Promise.all([fetchTodayData(), fetchWeeklySteps()]);
    } catch (e) {
      console.error("[health] fetchAllData error:", e);
    }
  }, [fetchTodayData, fetchWeeklySteps]);

  // ── Check if device has permissions already granted ─────────────────────────
  // FIX: Verify actual device-level permissions, not just assume authorization
  // because the plugin responds. On a new device after login, the plugin will
  // respond with zeros but permissions won't be granted yet.
  const checkDevicePermissions = useCallback(async () => {
    const plugin = getPlugin();
    if (!plugin) return false;

    try {
      const result = await plugin.checkPermissions();
      console.log("[health] checkPermissions result:", JSON.stringify(result));
      // Plugin returns { granted: true } if all required permissions are active
      return result?.granted === true;
    } catch (e) {
      console.warn("[health] checkPermissions error:", e.message);
      return false;
    }
  }, []);

  // ── Request permission ──────────────────────────────────────────────────────
  const requestAuthorization = useCallback(async () => {
    const plugin = getPlugin();
    if (!plugin) {
      setError("Health Connect plugin not found — rebuild the app.");
      return false;
    }
    try {
      setIsLoading(true);
      console.log("[health] Requesting permissions...");
      await plugin.requestPermissions();
      console.log("[health] Permissions screen closed, verifying...");

      // Verify permissions were actually granted after the screen closed
      const granted = await checkDevicePermissions();
      if (granted) {
        setIsAuthorized(true);
        await fetchAllData();
      } else {
        console.warn("[health] Permissions were NOT granted by user.");
        setIsAuthorized(false);
      }

      setIsLoading(false);
      return granted;
    } catch (err) {
      console.error("[health] requestAuthorization error:", err);
      setError("Could not open Health Connect. Make sure it is installed.");
      setIsLoading(false);
      return false;
    }
  }, [fetchAllData, checkDevicePermissions]);

  // ── Manual refresh ──────────────────────────────────────────────────────────
  const refreshHealthData = useCallback(async () => {
    setIsLoading(true);
    await fetchAllData();
    setIsLoading(false);
  }, [fetchAllData]);

  // ── Initialise ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAndroid()) {
      setIsLoading(false);
      return;
    }

    const init = async () => {
      const plugin = getPlugin();
      if (!plugin) {
        setIsLoading(false);
        return;
      }

      // 1. Check availability
      let available = false;
      try {
        const avail = await plugin.checkAvailability();
        available = avail?.available === true;
        console.log("[health] checkAvailability:", JSON.stringify(avail));
      } catch (e) {
        available = true; // assume available, let the permission step fail gracefully
        console.warn("[health] checkAvailability threw:", e.message);
      }
      setIsAvailable(available);

      if (!available) {
        setIsLoading(false);
        return;
      }

      // 2. FIX: Check actual device permissions before fetching or marking authorized.
      //    On a fresh device/login the plugin responds with zeros but is NOT authorized.
      console.log("[health] Checking device permissions...");
      const granted = await checkDevicePermissions();
      console.log("[health] Device permissions granted:", granted);

      if (granted) {
        // Permissions already exist on this device — load data silently
        setIsAuthorized(true);
        console.log("[health] Permissions confirmed, loading data...");
        await fetchAllData();
      } else {
        // No permissions on this device — show the connect button
        console.log(
          "[health] No permissions on this device — user must connect Health Connect.",
        );
        setIsAuthorized(false);
      }

      setIsLoading(false);
    };

    init();

    const timer = setInterval(fetchAllData, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // NOTE: Removed the useEffect that set isAuthorized based on isFromHealthKit.
  // That was the root cause — it marked authorized=true whenever the plugin
  // responded, even on a new device with no permissions granted yet.

  return {
    isAvailable,
    isAuthorized,
    isLoading,
    error,
    healthData,
    weeklySteps,
    requestAuthorization,
    refreshHealthData,
  };
};

export default useHealthKit;
