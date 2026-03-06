// useHealthKit CUSTOM HOOK
//
// Cross-platform hook that works on:
// - iOS: uses capacitor-health (HealthKit)
// - Android: uses the custom HealthConnect Capacitor plugin (Kotlin)
// - Web: returns default/zero values

import { useEffect, useState, useCallback, useRef } from "react";
import { Capacitor } from "@capacitor/core";

// Helper: detect platform
const getPlatform = () => {
  try {
    return Capacitor.getPlatform(); // 'android' | 'ios' | 'web'
  } catch {
    return "web";
  }
};

// Helper: get the native HealthConnect plugin on Android
const getHealthConnectPlugin = () => {
  try {
    // The Kotlin plugin is registered as "HealthConnect" on the Capacitor bridge
    const plugins = Capacitor.Plugins;
    return plugins?.HealthConnect ?? null;
  } catch {
    return null;
  }
};

// Helper: build empty week array
const getEmptyWeekData = () => {
  const now = new Date();
  return Array.from({ length: 7 }, (_, idx) => {
    const i = 6 - idx;
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    return {
      date: date.toISOString().split("T")[0],
      dayName: date.toLocaleDateString("en-GB", { weekday: "short" }),
      steps: 0,
    };
  });
};

export const useHealthKit = () => {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [healthData, setHealthData] = useState({
    steps: 0,
    calories: 0,
    activeCalories: 0,
    distance: 0,
    flightsClimbed: 0,
    heartRate: null,
    isFromHealthKit: false,
  });
  const [weeklySteps, setWeeklySteps] = useState([]);

  const platform = useRef(getPlatform()).current;
  const refreshIntervalRef = useRef(null);

  // ── Android: fetch health data from native HealthConnect plugin ──────────
  const fetchAndroidHealthData = useCallback(async () => {
    const plugin = getHealthConnectPlugin();
    if (!plugin) return;

    try {
      // Fetch today's data in parallel
      const [stepsRes, caloriesRes, distanceRes, weeklyRes] = await Promise.all([
        plugin.getTodaySteps().catch(() => ({ steps: 0 })),
        plugin.getTodayCalories().catch(() => ({ calories: 0 })),
        plugin.getTodayDistance().catch(() => ({ distance: 0 })),
        plugin.getWeeklySteps().catch(() => ({ week: [] })),
      ]);

      const steps = stepsRes?.steps ?? 0;
      const calories = caloriesRes?.calories ?? 0;
      const distance = distanceRes?.distance ?? 0;

      setHealthData({
        steps,
        calories,
        activeCalories: calories,
        distance,
        flightsClimbed: 0,
        heartRate: null,
        isFromHealthKit: true, // flag used by dashboard to show real data
      });

      // Weekly steps
      let weekData = weeklyRes?.week;
      if (weekData && Array.isArray(weekData) && weekData.length > 0) {
        setWeeklySteps(weekData);
      } else {
        // Fallback: put today's steps in the last slot
        const empty = getEmptyWeekData();
        empty[empty.length - 1].steps = steps;
        setWeeklySteps(empty);
      }
    } catch (err) {
      console.error("Error fetching Android health data:", err);
      setError(err.message || "Failed to fetch health data");
    }
  }, []);

  // ── Android: check availability & permissions, then fetch ────────────────
  const initAndroid = useCallback(async () => {
    const plugin = getHealthConnectPlugin();
    if (!plugin) {
      console.log("HealthConnect plugin not found on bridge");
      setIsLoading(false);
      return;
    }

    try {
      // Check if Health Connect is installed
      const avail = await plugin.checkAvailability();
      const available = avail?.available === true;
      setIsAvailable(available);

      if (!available) {
        console.log("Health Connect not available:", avail?.status);
        setIsLoading(false);
        return;
      }

      // Check if permissions are already granted
      const perms = await plugin.checkPermissions();
      const granted = perms?.granted === true;
      setIsAuthorized(granted);

      if (granted) {
        await fetchAndroidHealthData();
      }
    } catch (err) {
      console.error("Android health init error:", err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [fetchAndroidHealthData]);

  // ── Request authorization ───────────────────────────────────────────────
  const requestAuthorization = useCallback(async () => {
    if (platform !== "android") return false;

    const plugin = getHealthConnectPlugin();
    if (!plugin) return false;

    try {
      const result = await plugin.requestPermissions();
      if (result?.granted) {
        setIsAuthorized(true);
        // Immediately fetch data after permission granted
        await fetchAndroidHealthData();
        return true;
      }
      return false;
    } catch (err) {
      console.error("requestPermissions error:", err);
      setError(err.message);
      return false;
    }
  }, [platform, fetchAndroidHealthData]);

  // ── Refresh health data ─────────────────────────────────────────────────
  const refreshHealthData = useCallback(async () => {
    if (platform === "android" && isAuthorized) {
      await fetchAndroidHealthData();
    }
    return { healthData, weeklySteps };
  }, [platform, isAuthorized, fetchAndroidHealthData, healthData, weeklySteps]);

  // ── Initialise on mount ─────────────────────────────────────────────────
  useEffect(() => {
    if (platform === "android") {
      initAndroid();
    } else {
      // Web or iOS (iOS handled by capacitor-health / original hook if needed)
      setWeeklySteps(getEmptyWeekData());
      setIsLoading(false);
    }
  }, [platform, initAndroid]);

  // ── Auto-refresh every 5 minutes when authorized ───────────────────────
  useEffect(() => {
    if (platform === "android" && isAuthorized) {
      refreshIntervalRef.current = setInterval(() => {
        fetchAndroidHealthData();
      }, 5 * 60 * 1000);

      return () => clearInterval(refreshIntervalRef.current);
    }
  }, [platform, isAuthorized, fetchAndroidHealthData]);

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
