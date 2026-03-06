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
    const plugins = Capacitor.Plugins;
    const plugin = plugins?.HealthConnect ?? null;
    console.log("[HealthKit] getHealthConnectPlugin:", plugin ? "FOUND" : "NOT FOUND");
    if (plugin) {
      console.log("[HealthKit] Plugin methods:", Object.keys(plugin));
    }
    return plugin;
  } catch (e) {
    console.error("[HealthKit] Error getting plugin:", e);
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
    if (!plugin) {
      console.error("[HealthKit] Cannot fetch data - plugin not found");
      return;
    }

    try {
      console.log("[HealthKit] Fetching health data...");
      
      const [stepsRes, caloriesRes, distanceRes, weeklyRes] = await Promise.all([
        plugin.getTodaySteps().catch((e) => { console.error("[HealthKit] getTodaySteps error:", e); return { steps: 0 }; }),
        plugin.getTodayCalories().catch((e) => { console.error("[HealthKit] getTodayCalories error:", e); return { calories: 0 }; }),
        plugin.getTodayDistance().catch((e) => { console.error("[HealthKit] getTodayDistance error:", e); return { distance: 0 }; }),
        plugin.getWeeklySteps().catch((e) => { console.error("[HealthKit] getWeeklySteps error:", e); return { week: [] }; }),
      ]);

      console.log("[HealthKit] Raw responses:", JSON.stringify({ stepsRes, caloriesRes, distanceRes, weeklyRes }));

      const steps = stepsRes?.steps ?? 0;
      const calories = caloriesRes?.calories ?? 0;
      const distance = distanceRes?.distance ?? 0;

      console.log("[HealthKit] Parsed data - steps:", steps, "calories:", calories, "distance:", distance);

      setHealthData({
        steps,
        calories,
        activeCalories: calories,
        distance,
        flightsClimbed: 0,
        heartRate: null,
        isFromHealthKit: true,
      });

      // Weekly steps
      let weekData = weeklyRes?.week;
      console.log("[HealthKit] Weekly data type:", typeof weekData, "isArray:", Array.isArray(weekData), "value:", JSON.stringify(weekData));
      
      if (weekData && Array.isArray(weekData) && weekData.length > 0) {
        setWeeklySteps(weekData);
      } else {
        const empty = getEmptyWeekData();
        empty[empty.length - 1].steps = steps;
        setWeeklySteps(empty);
      }
    } catch (err) {
      console.error("[HealthKit] Error fetching Android health data:", err);
      setError(err.message || "Failed to fetch health data");
    }
  }, []);

  // ── Android: check availability & permissions, then fetch ────────────────
  const initAndroid = useCallback(async () => {
    console.log("[HealthKit] initAndroid called, platform:", platform);
    const plugin = getHealthConnectPlugin();
    if (!plugin) {
      console.error("[HealthKit] Plugin not found on bridge - is HealthPlugin registered in MainActivity?");
      setIsLoading(false);
      return;
    }

    try {
      console.log("[HealthKit] Checking availability...");
      const avail = await plugin.checkAvailability();
      console.log("[HealthKit] Availability result:", JSON.stringify(avail));
      const available = avail?.available === true;
      setIsAvailable(available);

      if (!available) {
        console.log("[HealthKit] Health Connect not available:", avail?.status);
        setIsLoading(false);
        return;
      }

      console.log("[HealthKit] Checking permissions...");
      const perms = await plugin.checkPermissions();
      console.log("[HealthKit] Permissions result:", JSON.stringify(perms));
      const granted = perms?.granted === true;
      setIsAuthorized(granted);

      if (granted) {
        console.log("[HealthKit] Permissions granted, fetching data...");
        await fetchAndroidHealthData();
      } else {
        console.log("[HealthKit] Permissions NOT granted - user needs to authorize");
      }
    } catch (err) {
      console.error("[HealthKit] Android health init error:", err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [fetchAndroidHealthData]);

  // ── Request authorization ───────────────────────────────────────────────
  const requestAuthorization = useCallback(async () => {
    console.log("[HealthKit] requestAuthorization called, platform:", platform);
    if (platform !== "android") return false;

    const plugin = getHealthConnectPlugin();
    if (!plugin) return false;

    try {
      console.log("[HealthKit] Requesting permissions...");
      const result = await plugin.requestPermissions();
      console.log("[HealthKit] requestPermissions result:", JSON.stringify(result));
      
      if (result?.granted) {
        setIsAuthorized(true);
        await fetchAndroidHealthData();
        return true;
      } else {
        console.log("[HealthKit] Permissions were NOT granted by user");
        return false;
      }
    } catch (err) {
      console.error("[HealthKit] requestPermissions error:", err);
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
    console.log("[HealthKit] useEffect mount, platform:", platform);
    if (platform === "android") {
      initAndroid();
    } else {
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
