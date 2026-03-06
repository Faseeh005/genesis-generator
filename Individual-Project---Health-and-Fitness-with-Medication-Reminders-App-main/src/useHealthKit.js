// useHealthKit - Cross-platform health data hook
//
// Android: uses custom HealthConnect Capacitor plugin (Kotlin bridge)
// iOS: uses capacitor-health (HealthKit)
// Web: returns default/zero values

import { useEffect, useState, useCallback, useRef } from "react";
import { Capacitor } from "@capacitor/core";

// ── Platform detection ────────────────────────────────────────────────────
const getPlatform = () => {
  try {
    return Capacitor.getPlatform(); // 'android' | 'ios' | 'web'
  } catch {
    return "web";
  }
};

// ── Get native HealthConnect plugin (Android only) ────────────────────────
const getHealthConnectPlugin = () => {
  try {
    // On Android, this is registered via registerPlugin(HealthPlugin::class.java) in MainActivity
    // and exposed as Capacitor.Plugins.HealthConnect
    const { HealthConnect } = Capacitor.Plugins;
    if (HealthConnect) {
      console.log("[HealthConnect] Plugin found on Capacitor bridge");
      return HealthConnect;
    }
    console.warn("[HealthConnect] Plugin NOT found on Capacitor.Plugins");
    console.log("[HealthConnect] Available plugins:", Object.keys(Capacitor.Plugins || {}));
    return null;
  } catch (e) {
    console.error("[HealthConnect] Error accessing plugin:", e);
    return null;
  }
};

// ── Empty week data helper ────────────────────────────────────────────────
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
  const [healthConnectStatus, setHealthConnectStatus] = useState("checking"); // checking | installed | update_required | not_installed | error
  const [dataSources, setDataSources] = useState([]);
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
  const pluginRef = useRef(null);

  // ── Get plugin reference (cached) ───────────────────────────────────────
  const getPlugin = useCallback(() => {
    if (!pluginRef.current) {
      pluginRef.current = getHealthConnectPlugin();
    }
    return pluginRef.current;
  }, []);

  // ── Fetch health data from Health Connect ───────────────────────────────
  const fetchAndroidHealthData = useCallback(async () => {
    const plugin = getPlugin();
    if (!plugin) {
      console.error("[HealthConnect] Cannot fetch - plugin unavailable");
      return;
    }

    try {
      console.log("[HealthConnect] Fetching today's health data...");

      // Fetch all data in parallel
      const [stepsRes, caloriesRes, distanceRes, weeklyRes] = await Promise.all([
        plugin.getTodaySteps().catch((e) => {
          console.error("[HealthConnect] getTodaySteps failed:", e);
          return { steps: 0, error: String(e) };
        }),
        plugin.getTodayCalories().catch((e) => {
          console.error("[HealthConnect] getTodayCalories failed:", e);
          return { calories: 0, error: String(e) };
        }),
        plugin.getTodayDistance().catch((e) => {
          console.error("[HealthConnect] getTodayDistance failed:", e);
          return { distance: 0, error: String(e) };
        }),
        plugin.getWeeklySteps().catch((e) => {
          console.error("[HealthConnect] getWeeklySteps failed:", e);
          return { week: [], error: String(e) };
        }),
      ]);

      console.log("[HealthConnect] Steps response:", JSON.stringify(stepsRes));
      console.log("[HealthConnect] Calories response:", JSON.stringify(caloriesRes));
      console.log("[HealthConnect] Distance response:", JSON.stringify(distanceRes));
      console.log("[HealthConnect] Weekly response:", JSON.stringify(weeklyRes));

      const steps = Number(stepsRes?.steps) || 0;
      const calories = Number(caloriesRes?.calories) || 0;
      const distance = Number(distanceRes?.distance) || 0;

      console.log("[HealthConnect] Final parsed: steps=" + steps + " calories=" + calories + " distance=" + distance);

      setHealthData({
        steps,
        calories,
        activeCalories: calories,
        distance,
        flightsClimbed: 0,
        heartRate: null,
        isFromHealthKit: true, // true means "from native health source"
      });

      // Process weekly steps
      let weekData = weeklyRes?.week;

      // Handle Capacitor JSArray which might not be a real JS array
      if (weekData && !Array.isArray(weekData)) {
        // It might be a Capacitor JSArray - try to convert
        try {
          if (typeof weekData === "string") {
            weekData = JSON.parse(weekData);
          } else if (typeof weekData === "object" && weekData.length !== undefined) {
            // Array-like object
            weekData = Array.from({ length: weekData.length }, (_, i) => weekData[i]);
          }
        } catch (parseErr) {
          console.warn("[HealthConnect] Could not parse weekly data:", parseErr);
          weekData = [];
        }
      }

      if (weekData && Array.isArray(weekData) && weekData.length > 0) {
        console.log("[HealthConnect] Setting weekly steps:", weekData.length, "days");
        setWeeklySteps(weekData);
      } else {
        console.log("[HealthConnect] No weekly data, using empty week with today's steps");
        const empty = getEmptyWeekData();
        empty[empty.length - 1].steps = steps;
        setWeeklySteps(empty);
      }

      // Also fetch data sources for debugging
      try {
        const sourcesRes = await plugin.getDataSources();
        console.log("[HealthConnect] Data sources:", JSON.stringify(sourcesRes));
        if (sourcesRes?.sources) {
          let sources = sourcesRes.sources;
          if (!Array.isArray(sources)) {
            try {
              sources = typeof sources === "string" ? JSON.parse(sources) : Array.from({ length: sources.length }, (_, i) => sources[i]);
            } catch { sources = []; }
          }
          setDataSources(sources);
        }
      } catch (srcErr) {
        console.warn("[HealthConnect] Could not get data sources:", srcErr);
      }

    } catch (err) {
      console.error("[HealthConnect] fetchAndroidHealthData error:", err);
      setError(err.message || "Failed to fetch health data");
    }
  }, [getPlugin]);

  // ── Initialize Android Health Connect ───────────────────────────────────
  const initAndroid = useCallback(async () => {
    console.log("[HealthConnect] Initializing on Android...");
    const plugin = getPlugin();

    if (!plugin) {
      console.error("[HealthConnect] Plugin not found! Make sure HealthPlugin is registered in MainActivity.");
      console.log("[HealthConnect] Available Capacitor plugins:", Object.keys(Capacitor.Plugins || {}));
      setHealthConnectStatus("error");
      setError("Health Connect plugin not found. Rebuild the app with native changes.");
      setIsLoading(false);
      return;
    }

    try {
      // Step 1: Check if Health Connect is installed
      console.log("[HealthConnect] Step 1: Checking availability...");
      const avail = await plugin.checkAvailability();
      console.log("[HealthConnect] Availability:", JSON.stringify(avail));

      const status = avail?.status || "error";
      setHealthConnectStatus(status);

      if (!avail?.available) {
        console.warn("[HealthConnect] Not available. Status:", status);
        setIsAvailable(false);
        setIsLoading(false);
        return;
      }

      setIsAvailable(true);
      console.log("[HealthConnect] Health Connect is available!");

      // Step 2: Check permissions
      console.log("[HealthConnect] Step 2: Checking permissions...");
      const perms = await plugin.checkPermissions();
      console.log("[HealthConnect] Permissions:", JSON.stringify(perms));

      const granted = perms?.granted === true;
      setIsAuthorized(granted);

      if (granted) {
        console.log("[HealthConnect] Permissions already granted, fetching data...");
        await fetchAndroidHealthData();
      } else {
        console.log("[HealthConnect] Permissions NOT granted (have " + (perms?.grantedCount || 0) + "/" + (perms?.requiredCount || 3) + ")");
        console.log("[HealthConnect] User needs to call requestAuthorization()");
      }
    } catch (err) {
      console.error("[HealthConnect] Init error:", err);
      setError(err.message);
      setHealthConnectStatus("error");
    } finally {
      setIsLoading(false);
    }
  }, [getPlugin, fetchAndroidHealthData]);

  // ── Request authorization ───────────────────────────────────────────────
  const requestAuthorization = useCallback(async () => {
    console.log("[HealthConnect] requestAuthorization called, platform:", platform);
    if (platform !== "android") {
      console.log("[HealthConnect] Not on Android, skipping");
      return false;
    }

    const plugin = getPlugin();
    if (!plugin) {
      console.error("[HealthConnect] Plugin not available for permission request");
      return false;
    }

    try {
      console.log("[HealthConnect] Launching permission request...");
      const result = await plugin.requestPermissions();
      console.log("[HealthConnect] Permission result:", JSON.stringify(result));

      if (result?.granted) {
        console.log("[HealthConnect] Permissions GRANTED! Fetching data...");
        setIsAuthorized(true);
        setError(null);
        await fetchAndroidHealthData();
        return true;
      } else {
        console.warn("[HealthConnect] Permissions DENIED by user");
        setError("Health Connect permissions were denied. Please grant access in Settings > Apps > Health Connect.");
        return false;
      }
    } catch (err) {
      console.error("[HealthConnect] requestPermissions error:", err);
      setError(err.message);
      return false;
    }
  }, [platform, getPlugin, fetchAndroidHealthData]);

  // ── Refresh health data ─────────────────────────────────────────────────
  const refreshHealthData = useCallback(async () => {
    console.log("[HealthConnect] refreshHealthData called");
    if (platform === "android" && isAuthorized) {
      setIsLoading(true);
      try {
        await fetchAndroidHealthData();
      } finally {
        setIsLoading(false);
      }
    }
    return { healthData, weeklySteps };
  }, [platform, isAuthorized, fetchAndroidHealthData, healthData, weeklySteps]);

  // ── Open Health Connect settings (for Samsung Health sync) ──────────────
  const openHealthConnectSettings = useCallback(async () => {
    const plugin = getPlugin();
    if (plugin) {
      try {
        await plugin.openHealthConnectSettings();
      } catch (e) {
        console.error("[HealthConnect] Could not open settings:", e);
      }
    }
  }, [getPlugin]);

  // ── Initialize on mount ─────────────────────────────────────────────────
  useEffect(() => {
    console.log("[HealthConnect] useEffect mount, platform:", platform);
    if (platform === "android") {
      initAndroid();
    } else {
      // Web/iOS: set defaults
      setWeeklySteps(getEmptyWeekData());
      setIsLoading(false);
    }
  }, [platform, initAndroid]);

  // ── Auto-refresh every 5 minutes when authorized ───────────────────────
  useEffect(() => {
    if (platform === "android" && isAuthorized) {
      console.log("[HealthConnect] Starting 5-minute auto-refresh");
      refreshIntervalRef.current = setInterval(() => {
        console.log("[HealthConnect] Auto-refreshing...");
        fetchAndroidHealthData();
      }, 5 * 60 * 1000);

      return () => {
        console.log("[HealthConnect] Stopping auto-refresh");
        clearInterval(refreshIntervalRef.current);
      };
    }
  }, [platform, isAuthorized, fetchAndroidHealthData]);

  return {
    isAvailable,
    isAuthorized,
    isLoading,
    error,
    healthData,
    weeklySteps,
    healthConnectStatus,
    dataSources,
    requestAuthorization,
    refreshHealthData,
    openHealthConnectSettings,
  };
};

export default useHealthKit;
