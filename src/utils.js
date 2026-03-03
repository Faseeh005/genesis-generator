// Utility functions
// This file contains helper functions used throughout the app.

/**
 * getUserDisplayName
 * Returns the best available display name for a user.
 *
 * Priority:
 * 1. First name from user profile (set during onboarding)
 * 2. Email prefix (part before @)
 * 3. "User" as a fallback
 *
 * @example
 * // With profile
 * getUserDisplayName(user, { fullName: "John Smith" }) // Returns "John"
 *
 * // Without profile
 * getUserDisplayName({ email: "john@example.com" }, null) // Returns "John"
 */
export const getUserDisplayName = (user, userProfile) => {
  // Try to get name from user profile
  if (userProfile && userProfile.fullName) {
    // Get the first name (everything before the first space)
    const fullName = userProfile.fullName.trim();
    const firstName = fullName.split(" ")[0];

    // Capitalize properly: "JOHN" or "john" → "John"
    if (firstName.length > 0) {
      return (
        firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase()
      );
    }
  }

  // Try to get name from Firebase displayName
  // (This would be set if using Google Sign-In, etc.)
  if (user && user.displayName) {
    const firstName = user.displayName.split(" ")[0];
    return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
  }

  // Fall back to email prefix
  if (user && user.email) {
    const emailPrefix = user.email.split("@")[0];
    // Remove any numbers or special characters for a cleaner name
    const cleanName = emailPrefix.replace(/[0-9_.-]/g, "");
    if (cleanName.length > 0) {
      return (
        cleanName.charAt(0).toUpperCase() + cleanName.slice(1).toLowerCase()
      );
    }
    // If cleaning removed everything, just use the original prefix
    return emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
  }

  // Default value
  return "User";
};

/**
 * getUserFullName
 * Returns the user's full name if available, otherwise falls back to display name.
 */
export const getUserFullName = (user, userProfile) => {
  // Return full name if available
  if (userProfile && userProfile.fullName) {
    return userProfile.fullName;
  }

  // Fall back to display name
  return getUserDisplayName(user, userProfile);
};
