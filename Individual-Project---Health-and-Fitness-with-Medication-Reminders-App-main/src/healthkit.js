// HEALTHKIT SERVICE
// This file is a "service" - it contains functions that communicate with
// Apple's HealthKit API to read health data like steps, calories, and heart rate.
//
// IMPORTANT: HealthKit ONLY works on iOS devices. When running on web (localhost),
// these functions will return default values (0 or null).
//
// How this works:
// 1. The app checks if it's running on iOS
// 2. If yes, it loads the HealthKit plugin
// 3. It requests permission from the user to read their health data
// 4. Once authorized, it can query HealthKit for steps, calories, etc.

// Capacitor is a framework that lets web apps run as native mobile apps
// It provides a bridge between JavaScript and native iOS/Android code
import { Capacitor } from "@capacitor/core";

// PLATFORM DETECTION

// Check if we're running on a native platform (iOS or Android) vs web browser
// This returns true on iOS/Android, false on web (localhost)
const isNativePlatform = Capacitor.isNativePlatform();

// PLUGIN VARIABLE

// This variable will hold the HealthKit plugin once it's loaded
// We start with null because we load it dynamically (only when needed)
let CapacitorHealthkit = null;

// INITIALIZE HEALTH PLUGIN
//
// This function loads the HealthKit plugin. We do this "dynamically" (on-demand)
// rather than at startup because:
// 1. The plugin only works on iOS, so loading it on web would cause errors
// 2. Dynamic loading makes the app faster to start

const initHealth = async () => {
  // Check if we're on a native platform
  // If we're on web (localhost), don't try to load the plugin
  if (!isNativePlatform) {
    console.log("Health plugin only works on native platforms (iOS)");
    return false; // Return false to indicate plugin is not available
  }

  // Check if already initialized
  // If we've already loaded the plugin, don't load it again
  if (CapacitorHealthkit) {
    return true; // Return true to indicate plugin is ready
  }

  // Try to load the plugin
  try {
    // Dynamic import - this loads the plugin code only when this function runs
    // The 'capacitor-health' package provides the CapacitorHealthkit object
    const module = await import(/* @vite-ignore */ "capacitor-health");

    // Store the plugin in our variable for later use
    CapacitorHealthkit = module.CapacitorHealthkit;

    console.log("Health plugin loaded successfully");
    return true; // Plugin loaded successfully
  } catch (error) {
    // If loading fails, log the error and return false
    console.error("Failed to load Health plugin:", error);
    return false;
  }
};

// AUTHORIZATION FUNCTIONS
//
// Before reading any health data, we need the user's permission.
// Apple requires apps to explicitly ask for access to each type of health data.
// The user sees a popup asking them to allow or deny access.

/**
 * isHealthKitAvailable
 *
 * Checks if HealthKit is available on the current device.
 * HealthKit is only available on:
 * - iPhones running iOS
 * - iPads running iPadOS
 * - Apple Watches (through the paired iPhone)
 *
 * NOT available on:
 * - Web browsers (localhost)
 * - Android devices
 * - Mac computers
 * - iOS Simulator (limited functionality)
 *
 * @returns {Promise<boolean>} - true if HealthKit is available, false otherwise
 */
export const isHealthKitAvailable = async () => {
  // Check 1: Are we on a native platform?
  if (!isNativePlatform) {
    console.log("HealthKit is only available on iOS devices");
    return false;
  }

  // Check 2: Are we specifically on iOS?
  // Capacitor.getPlatform() returns 'ios', 'android', or 'web'
  if (Capacitor.getPlatform() !== "ios") {
    console.log(
      "HealthKit is only available on iOS, current platform:",
      Capacitor.getPlatform(),
    );
    return false;
  }

  // Check 3: Can we load the plugin?
  const initialized = await initHealth();
  if (!initialized || !CapacitorHealthkit) {
    return false;
  }

  // Check 4: Ask the plugin if HealthKit is available
  try {
    // The isAvailable() function checks if the device supports HealthKit
    const result = await CapacitorHealthkit.isAvailable();
    console.log("HealthKit availability:", result);
    return result.available === true;
  } catch (error) {
    console.error("Error checking HealthKit availability:", error);
    return false;
  }
};

/**
 * requestHealthKitAuthorization
 *
 * Asks the user for permission to read their health data.
 * This will show a system popup where the user can:
 * - Allow access to all requested data types
 * - Allow access to some data types
 * - Deny access entirely
 *
 * IMPORTANT:
 * - You can only ask once per data type
 * - If denied, the user must go to Settings > Privacy > Health to change it
 * - The app cannot know if access was denied (for privacy reasons)
 *
 * @returns {Promise<boolean>} - true if authorization request was made, false on error
 */
export const requestHealthKitAuthorization = async () => {
  // Check if we're on iOS
  if (!isNativePlatform) {
    console.log("HealthKit authorization is only available on iOS");
    return false;
  }

  // Initialize the plugin
  const initialized = await initHealth();
  if (!initialized || !CapacitorHealthkit) {
    return false;
  }

  try {
    // Define the data types we want to read
    // These are Apple's official identifiers for each health data type
    // Each identifier starts with "HKQuantityTypeIdentifier" followed by the data type
    const readTypes = [
      "HKQuantityTypeIdentifierStepCount", // Number of steps walked
      "HKQuantityTypeIdentifierActiveEnergyBurned", // Calories burned from activity
      "HKQuantityTypeIdentifierBasalEnergyBurned", // Calories burned at rest (metabolism)
      "HKQuantityTypeIdentifierHeartRate", // Heart rate in BPM
      "HKQuantityTypeIdentifierDistanceWalkingRunning", // Distance walked or run in meters
      "HKQuantityTypeIdentifierFlightsClimbed", // Floors/flights of stairs climbed
    ];

    // Request authorization from the user
    // This will show the iOS Health permissions popup
    const result = await CapacitorHealthkit.requestAuthorization({
      all: readTypes, // Request access to all these types
      read: readTypes, // Specifically request READ access
      write: [], // We don't need to write any data (empty array)
    });

    console.log("HealthKit authorization result:", result);
    return true; // Authorization request was made successfully
  } catch (error) {
    console.error("Error requesting HealthKit authorization:", error);
    return false;
  }
};

// STEP COUNT FUNCTIONS
//
// Steps are one of the most commonly tracked health metrics.
// iPhones automatically count steps using the built-in accelerometer.
// Apple Watches provide more accurate step counts.

/**
 * getTodayStepCount
 *
 * Gets the total number of steps taken today.
 *
 * How it works:
 * 1. Calculate the start of today (midnight)
 * 2. Query HealthKit for all step samples between midnight and now
 * 3. Add up all the step counts
 *
 * Why we sum multiple samples:
 * - Steps are recorded in small batches throughout the day
 * - Each batch is a separate "sample" in HealthKit
 * - We need to add them all together to get the total
 *
 * @returns {Promise<number>} - Total steps taken today (0 if not available)
 */
export const getTodayStepCount = async () => {
  // Return 0 if not on native platform
  if (!isNativePlatform) {
    console.log("Returning 0 steps for web platform");
    return 0;
  }

  // Initialize the plugin
  const initialized = await initHealth();
  if (!initialized || !CapacitorHealthkit) {
    return 0;
  }

  try {
    // ─── Calculate today's date range ───
    // We need the start of today (midnight) and the current time
    const now = new Date(); // Current date and time

    // Create a new date for the start of today
    // new Date(year, month, day) creates a date at midnight (00:00:00)
    const startOfDay = new Date(
      now.getFullYear(), // Current year (e.g., 2026)
      now.getMonth(), // Current month (0-11, where 0 = January)
      now.getDate(), // Current day of the month (1-31)
    );

    // Query HealthKit for step data
    const result = await CapacitorHealthkit.queryHKitSampleType({
      sampleName: "HKQuantityTypeIdentifierStepCount", // The type of data to query
      startDate: startOfDay.toISOString(), // Start of time range (ISO 8601 format)
      endDate: now.toISOString(), // End of time range
      limit: 0, // 0 means no limit - get all samples
    });

    // Sum up all step samples
    let totalSteps = 0;

    // Check if we got results
    if (result && result.resultData && Array.isArray(result.resultData)) {
      // Loop through each sample and add its quantity to the total
      result.resultData.forEach((sample) => {
        // parseFloat converts the string to a number
        // || 0 provides a default of 0 if the conversion fails
        totalSteps += parseFloat(sample.quantity) || 0;
      });
    }

    console.log("Today step count:", totalSteps);

    // Round to remove any decimal places and return
    return Math.round(totalSteps);
  } catch (error) {
    console.error("Error getting step count:", error);
    return 0; // Return 0 if there's an error
  }
};

/**
 * getWeeklyStepCount
 *
 * Gets the step count for each of the past 7 days.
 * This is useful for displaying a weekly chart/graph.
 *
 * @returns {Promise<Array>} - Array of objects: [{ date, dayName, steps }, ...]
 */
export const getWeeklyStepCount = async () => {
  // Return empty data if not on native platform
  if (!isNativePlatform) {
    console.log("Returning empty week data for web platform");
    return getEmptyWeekData(); // Helper function defined below
  }

  // Initialize the plugin
  const initialized = await initHealth();
  if (!initialized || !CapacitorHealthkit) {
    return getEmptyWeekData();
  }

  try {
    const weekData = []; // Array to store each day's data
    const now = new Date();

    // Loop through the past 7 days
    // i = 6 means 6 days ago, i = 0 means today
    for (let i = 6; i >= 0; i--) {
      // Create a date for this day
      const date = new Date(now);
      date.setDate(date.getDate() - i); // Subtract i days from today

      // Calculate start and end of this day
      const startOfDay = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
      );
      const endOfDay = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        23,
        59,
        59,
      );

      try {
        // Query HealthKit for this day's steps
        const result = await CapacitorHealthkit.queryHKitSampleType({
          sampleName: "HKQuantityTypeIdentifierStepCount",
          startDate: startOfDay.toISOString(),
          endDate: endOfDay.toISOString(),
          limit: 0,
        });

        // Sum up the steps for this day
        let daySteps = 0;
        if (result && result.resultData && Array.isArray(result.resultData)) {
          result.resultData.forEach((sample) => {
            daySteps += parseFloat(sample.quantity) || 0;
          });
        }

        // Add this day's data to our array
        weekData.push({
          date: startOfDay.toISOString().split("T")[0], // Format: "2026-03-02"
          dayName: startOfDay.toLocaleDateString("en-GB", { weekday: "short" }), // Format: "Mon"
          steps: Math.round(daySteps),
        });
      } catch {
        // If there's an error for this specific day, add 0 steps
        weekData.push({
          date: startOfDay.toISOString().split("T")[0],
          dayName: startOfDay.toLocaleDateString("en-GB", { weekday: "short" }),
          steps: 0,
        });
      }
    }

    console.log("Weekly step data:", weekData);
    return weekData;
  } catch (error) {
    console.error("Error getting weekly steps:", error);
    return getEmptyWeekData();
  }
};

/**
 * getEmptyWeekData
 *
 * Function creates an empty week of data.
 * Used as a fallback when HealthKit is not available.
 *
 * @returns {Array} - Array of 7 objects with 0 steps each
 */
const getEmptyWeekData = () => {
  const weekData = [];
  const now = new Date();

  // Create 7 days of empty data
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    weekData.push({
      date: date.toISOString().split("T")[0],
      dayName: date.toLocaleDateString("en-GB", { weekday: "short" }),
      steps: 0, // No steps - empty data
    });
  }
  return weekData;
};

// CALORIES BURNED FUNCTIONS
//
// There are two types of calories in HealthKit:
//
// 1. Active Energy (Active Calories)
//    - Calories burned from physical activity (walking, exercising, etc.)
//    - This is what most fitness apps show
//
// 2. Basal Energy (Resting Calories)
//    - Calories burned just by being alive (breathing, digestion, etc.)
//    - This is your "resting metabolic rate"
//
// Total calories = Active + Basal

/**
 * getTodayCaloriesBurned
 *
 * Gets the TOTAL calories burned today (active + basal).
 *
 * @returns {Promise<number>} - Total calories burned today
 */
export const getTodayCaloriesBurned = async () => {
  // Return 0 if not on native platform
  if (!isNativePlatform) {
    return 0;
  }

  // Initialize the plugin
  const initialized = await initHealth();
  if (!initialized || !CapacitorHealthkit) {
    return 0;
  }

  try {
    // Calculate today's date range
    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

    // Get ACTIVE calories (from exercise/movement)
    const activeResult = await CapacitorHealthkit.queryHKitSampleType({
      sampleName: "HKQuantityTypeIdentifierActiveEnergyBurned",
      startDate: startOfDay.toISOString(),
      endDate: now.toISOString(),
      limit: 0,
    });

    // Sum up active calories
    let activeCalories = 0;
    if (
      activeResult &&
      activeResult.resultData &&
      Array.isArray(activeResult.resultData)
    ) {
      activeResult.resultData.forEach((sample) => {
        activeCalories += parseFloat(sample.quantity) || 0;
      });
    }

    // Get BASAL calories (resting metabolism)
    const basalResult = await CapacitorHealthkit.queryHKitSampleType({
      sampleName: "HKQuantityTypeIdentifierBasalEnergyBurned",
      startDate: startOfDay.toISOString(),
      endDate: now.toISOString(),
      limit: 0,
    });

    // Sum up basal calories
    let basalCalories = 0;
    if (
      basalResult &&
      basalResult.resultData &&
      Array.isArray(basalResult.resultData)
    ) {
      basalResult.resultData.forEach((sample) => {
        basalCalories += parseFloat(sample.quantity) || 0;
      });
    }

    // Calculate total
    const totalCalories = activeCalories + basalCalories;

    console.log("Today calories:", {
      active: activeCalories,
      basal: basalCalories,
      total: totalCalories,
    });

    return Math.round(totalCalories);
  } catch (error) {
    console.error("Error getting calories burned:", error);
    return 0;
  }
};

/**
 * getTodayActiveCalories
 *
 * Gets only the ACTIVE calories burned today (from exercise/movement).
 * This excludes resting calories.
 *
 * @returns {Promise<number>} - Active calories burned today
 */
export const getTodayActiveCalories = async () => {
  // Return 0 if not on native platform
  if (!isNativePlatform) {
    return 0;
  }

  // Initialize the plugin
  const initialized = await initHealth();
  if (!initialized || !CapacitorHealthkit) {
    return 0;
  }

  try {
    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

    // Query for active energy only
    const result = await CapacitorHealthkit.queryHKitSampleType({
      sampleName: "HKQuantityTypeIdentifierActiveEnergyBurned",
      startDate: startOfDay.toISOString(),
      endDate: now.toISOString(),
      limit: 0,
    });

    // Sum up the calories
    let activeCalories = 0;
    if (result && result.resultData && Array.isArray(result.resultData)) {
      result.resultData.forEach((sample) => {
        activeCalories += parseFloat(sample.quantity) || 0;
      });
    }

    return Math.round(activeCalories);
  } catch (error) {
    console.error("Error getting active calories:", error);
    return 0;
  }
};

// HEART RATE FUNCTIONS
//
// Heart rate is measured in BPM (beats per minute).
// On Apple Watch, heart rate is measured:
// - Continuously during workouts
// - Every 10 minutes when wearing the watch
// - On-demand when the user checks
//
// On iPhone, heart rate requires a connected Apple Watch or third-party device.

/**
 * getLatestHeartRate
 *
 * Gets the most recent heart rate reading from the past 24 hours.
 *
 * @returns {Promise<number|null>} - Heart rate in BPM, or null if not available
 */
export const getLatestHeartRate = async () => {
  // ─── Return null if not on native platform ───
  if (!isNativePlatform) {
    return null;
  }

  // ─── Initialize the plugin ───
  const initialized = await initHealth();
  if (!initialized || !CapacitorHealthkit) {
    return null;
  }

  try {
    const now = new Date();
    // Look back 24 hours for a heart rate reading
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const result = await CapacitorHealthkit.queryHKitSampleType({
      sampleName: "HKQuantityTypeIdentifierHeartRate",
      startDate: oneDayAgo.toISOString(),
      endDate: now.toISOString(),
      limit: 1, // Only get the most recent reading
    });

    // Check if we got a result
    if (result && result.resultData && result.resultData.length > 0) {
      const heartRate = parseFloat(result.resultData[0].quantity);
      console.log("Latest heart rate:", heartRate);
      return Math.round(heartRate);
    }

    // No heart rate data found
    return null;
  } catch (error) {
    console.error("Error getting heart rate:", error);
    return null;
  }
};

// DISTANCE FUNCTIONS

// Distance is tracked automatically by iPhone using:
// - GPS for outdoor activities
// - Step length estimation for indoor activities

/**
 * getTodayDistance
 *
 * Gets the total distance walked/run today in kilometers.
 *
 * @returns {Promise<number>} - Distance in km (e.g., 3.45)
 */
export const getTodayDistance = async () => {
  // Return 0 if not on native platform
  if (!isNativePlatform) {
    return 0;
  }

  // ─── Initialize the plugin
  const initialized = await initHealth();
  if (!initialized || !CapacitorHealthkit) {
    return 0;
  }

  try {
    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

    const result = await CapacitorHealthkit.queryHKitSampleType({
      sampleName: "HKQuantityTypeIdentifierDistanceWalkingRunning",
      startDate: startOfDay.toISOString(),
      endDate: now.toISOString(),
      limit: 0,
    });

    // Sum up the distance (in meters)
    let totalDistance = 0;
    if (result && result.resultData && Array.isArray(result.resultData)) {
      result.resultData.forEach((sample) => {
        totalDistance += parseFloat(sample.quantity) || 0;
      });
    }

    // Convert meters to kilometers
    // 1000 meters = 1 kilometer
    const distanceKm = totalDistance / 1000;

    console.log("Today distance:", distanceKm.toFixed(2), "km");

    // Round to 2 decimal places
    // Math.round(3.456 * 100) / 100 = 3.46
    return Math.round(distanceKm * 100) / 100;
  } catch (error) {
    console.error("Error getting distance:", error);
    return 0;
  }
};

/**
 * getTodayFlightsClimbed
 *
 * Gets the number of flights of stairs climbed today.
 * One flight = approximately 10 feet (3 meters) of elevation gain.
 *
 * @returns {Promise<number>} - Number of flights climbed
 */
export const getTodayFlightsClimbed = async () => {
  // ─── Return 0 if not on native platform ───
  if (!isNativePlatform) {
    return 0;
  }

  // ─── Initialize the plugin ───
  const initialized = await initHealth();
  if (!initialized || !CapacitorHealthkit) {
    return 0;
  }

  try {
    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

    const result = await CapacitorHealthkit.queryHKitSampleType({
      sampleName: "HKQuantityTypeIdentifierFlightsClimbed",
      startDate: startOfDay.toISOString(),
      endDate: now.toISOString(),
      limit: 0,
    });

    // Sum up the flights
    let totalFlights = 0;
    if (result && result.resultData && Array.isArray(result.resultData)) {
      result.resultData.forEach((sample) => {
        totalFlights += parseFloat(sample.quantity) || 0;
      });
    }

    return Math.round(totalFlights);
  } catch (error) {
    console.error("Error getting flights climbed:", error);
    return 0;
  }
};

// COMPREHENSIVE HEALTH SUMMARY
//
// This function fetches ALL health metrics at once.
// It's more efficient than calling each function separately because
// it uses Promise.all() to run all queries in parallel.

/**
 * Gets a complete summary of today's health data.
 * This is the main function used by the Dashboard to get all data at once.
 * @returns {Promise<Object>} - Object containing all health metrics
 */
export const getTodayHealthSummary = async () => {
  // ─── Default values to return if HealthKit is not available ───
  const defaultSummary = {
    steps: 0,
    calories: 0,
    activeCalories: 0,
    distance: 0,
    flightsClimbed: 0,
    heartRate: null,
    isFromHealthKit: false, // Flag to indicate data source
  };

  // Return defaults if not on native platform
  if (!isNativePlatform) {
    console.log("HealthKit not available - returning default values");
    return defaultSummary;
  }

  try {
    // Promise.all() runs multiple async functions at the same time
    // This is faster than calling them one after another
    const [
      steps,
      calories,
      activeCalories,
      distance,
      flightsClimbed,
      heartRate,
    ] = await Promise.all([
      getTodayStepCount(),
      getTodayCaloriesBurned(),
      getTodayActiveCalories(),
      getTodayDistance(),
      getTodayFlightsClimbed(),
      getLatestHeartRate(),
    ]);

    // Return all the data in one object
    return {
      steps,
      calories,
      activeCalories,
      distance,
      flightsClimbed,
      heartRate,
      isFromHealthKit: true, // Data came from HealthKit
    };
  } catch (error) {
    console.error("Error getting health summary:", error);
    return defaultSummary; // Return defaults if there's an error
  }
};

// UTILITY FUNCTIONS

/**
 * isRunningOnIOS
 *
 * Simple helper to check if the app is running on iOS.
 * Used to decide whether to show HealthKit-related UI.
 *
 * @returns {boolean} - true if running on iOS
 */
export const isRunningOnIOS = () => {
  // Both conditions must be true:
  // 1. We're on a native platform (not web)
  // 2. That platform is iOS specifically
  return isNativePlatform && Capacitor.getPlatform() === "ios";
};
