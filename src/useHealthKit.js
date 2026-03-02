// useHealthKit CUSTOM HOOK
//
// What is a "Custom Hook"?
// A custom hook is a reusable piece of logic that can use React features
// (like useState and useEffect). It always starts with "use".
//
// Why use a custom hook?
// 1. Separates HealthKit logic from the UI components
// 2. Makes the code reusable - any component can use this hook
// 3. Keeps components clean and focused on displaying UI
//
// What this hook does:
// 1. Checks if HealthKit is available when the component mounts
// 2. Provides a function to request authorization
// 3. Fetches health data and stores it in state
// 4. Auto-refreshes data every 5 minutes
// 5. Provides loading and error states

import { useState, useEffect, useCallback } from "react";

// Import our HealthKit service functions
import {
  isHealthKitAvailable,
  requestHealthKitAuthorization,
  getTodayHealthSummary,
  getWeeklyStepCount,
  isRunningOnIOS,
} from "./healthkit";

// THE HOOK

export const useHealthKit = () => {
  // Is HealthKit available on this device?
  // true = iOS device with HealthKit support
  // false = web browser or Android
  const [isAvailable, setIsAvailable] = useState(false);

  // Has the user authorized HealthKit access?
  // true = user has granted permission
  // false = not yet asked or permission denied
  const [isAuthorized, setIsAuthorized] = useState(false);

  // Is data currently being fetched?
  // true = fetching data (show loading spinner)
  // false = not fetching (show data)
  const [isLoading, setIsLoading] = useState(true);

  // Error message if something went wrong
  // null = no error
  // string = error message to display
  const [error, setError] = useState(null);

  // Today's health data from HealthKit
  // This object contains all the health metrics
  const [healthData, setHealthData] = useState({
    steps: 0,
    calories: 0,
    activeCalories: 0,
    distance: 0,
    flightsClimbed: 0,
    heartRate: null,
    isFromHealthKit: false, // false = using default/fallback values
  });

  // Weekly step data for the chart
  // Array of { date, dayName, steps } objects
  const [weeklySteps, setWeeklySteps] = useState([]);

  // CHECK AVAILABILITY ON MOUNT
  // This runs once when the component using this hook first renders

  useEffect(() => {
    /**
     * checkAvailability
     *
     * Checks if HealthKit is available on this device.
     * This runs automatically when the component mounts.
     */
    const checkAvailability = async () => {
      // Are we on iOS?
      if (!isRunningOnIOS()) {
        console.log("Not running on iOS - HealthKit not available");
        setIsAvailable(false);
        setIsLoading(false); // Stop loading since we won't fetch data
        return;
      }

      // Is HealthKit available?
      const available = await isHealthKitAvailable();
      setIsAvailable(available);

      // If not available, stop loading
      if (!available) {
        setIsLoading(false);
      }
    };

    // Run the check
    checkAvailability();
  }, []); // Empty dependency array = run only once on mount

  // REQUEST AUTHORIZATION FUNCTION
  // This is wrapped in useCallback for performance optimization
  // useCallback ensures the function doesn't get recreated on every render

  /**
   * requestAuthorization
   *
   * Asks the user for permission to access their health data.
   * Shows the iOS Health permissions popup.
   *
   * @returns {Promise<boolean>} - true if authorized, false otherwise
   */
  const requestAuthorization = useCallback(async () => {
    // Check if HealthKit is available
    if (!isAvailable) {
      setError("HealthKit is not available on this device");
      return false;
    }

    // Start loading
    setIsLoading(true);
    setError(null); // Clear any previous errors

    try {
      // Request authorization from the user
      const authorized = await requestHealthKitAuthorization();
      setIsAuthorized(authorized);

      // If authorized, fetch data immediately
      if (authorized) {
        await refreshHealthData();
      } else {
        setError("HealthKit authorization was denied");
      }

      return authorized;
    } catch (err) {
      // Handle errors
      setError("Failed to request HealthKit authorization");
      console.error(err);
      return false;
    } finally {
      // Stop loading (runs whether success or failure)
      setIsLoading(false);
    }
  }, [isAvailable]); // Re-create this function if isAvailable changes

  // REFRESH HEALTH DATA FUNCTION

  /**
   * refreshHealthData
   *
   * Fetches the latest health data from HealthKit.
   * Can be called manually (e.g., when user taps "Refresh" button)
   * or automatically on a timer.
   */
  const refreshHealthData = useCallback(async () => {
    // Don't refresh if HealthKit is not available
    if (!isAvailable) {
      return;
    }

    // Start loading
    setIsLoading(true);
    setError(null);

    try {
      // Fetch today's summary and weekly steps at the same time
      // Promise.all runs both queries in parallel for better performance
      const [summary, weekly] = await Promise.all([
        getTodayHealthSummary(), // Get today's health data
        getWeeklyStepCount(), // Get past 7 days of steps
      ]);

      // Update state with the new data
      setHealthData(summary);
      setWeeklySteps(weekly);

      // If we got data from HealthKit, user must be authorized
      if (summary.isFromHealthKit) {
        setIsAuthorized(true);
      }
    } catch (err) {
      // Handle errors
      setError("Failed to fetch health data");
      console.error(err);
    } finally {
      // Stop loading
      setIsLoading(false);
    }
  }, [isAvailable]); // Re-create this function if isAvailable changes

  //  AUTO-REFRESH ON INTERVAL
  // This effect sets up automatic data refresh every 5 minutes

  useEffect(() => {
    // Don't set up interval if not available or not authorized
    if (!isAvailable || !isAuthorized) {
      return;
    }

    // Set up the interval
    // setInterval calls the function repeatedly at the specified interval
    const intervalId = setInterval(
      () => {
        refreshHealthData(); // Fetch fresh data
      },
      5 * 60 * 1000,
    ); // 5 minutes in milliseconds (5 * 60 seconds * 1000 ms)

    // Cleanup function
    // This runs when the component unmounts or when dependencies change
    // It prevents memory leaks by clearing the interval
    return () => clearInterval(intervalId);
  }, [isAvailable, isAuthorized, refreshHealthData]);

  return {
    // Status information
    isAvailable, // Is HealthKit available on this device?
    isAuthorized, // Has user authorized HealthKit access?
    isLoading, // Is data currently being fetched?
    error, // Error message (or null if no error)

    // Health data
    healthData, // Today's health metrics (steps, calories, etc.)
    weeklySteps, // Past 7 days of step counts for charts

    // Actions the component can take
    requestAuthorization, // Function to request HealthKit permission
    refreshHealthData, // Function to manually refresh data
  };
};

// Allows importing as: import useHealthKit from './useHealthKit'
export default useHealthKit;
