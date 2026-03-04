// ══════════════════════════════════════════════════════════════════════════════
// AUTH COMPONENT - Login and Signup Page
// This component handles user authentication (logging in and signing up)
// It's shown when the user is not logged in
// ══════════════════════════════════════════════════════════════════════════════

// Import React and the useState hook for managing component state
import React, { useState, useEffect } from "react";

// Import Firebase authentication functions
import { auth } from "./firebase"; // Our Firebase configuration
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";

// import biometric authentication functions
import {
  isBiometricAvailable,
  saveCredentials,
  hasStoredCredentials,
  authenticateWithBiometric,
} from "./biometricAuth";

// ──────────────────────────────────────────────────────────────────────────────
// Auth Component Function
// Props:
//   - user: the currently logged-in user (should be null when this renders)
//   - setUser: function to update the user state in the parent component
// ──────────────────────────────────────────────────────────────────────────────

function Auth({ user, setUser }) {
  // email - stores the email address entered by the user
  const [email, setEmail] = useState("");

  // password - stores the password entered by the user
  const [password, setPassword] = useState("");

  // isSignUp - boolean that determines if we're showing signup or login form
  // true = signup form, false = login form
  const [isSignUp, setIsSignUp] = useState(false);

  // showForgotPassword - boolean that controls whether to show the forgot password form
  // true = show forgot password form, false = show login/signup form
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  // error - stores any error message to show to the user
  // Empty string means no error
  const [error, setError] = useState("");

  // successMessage stores success message for forgot password
  const [successMessage, setSuccessMessage] = useState("");

  // loading - boolean that tracks if we're currently processing authentication
  // true = show loading state, false = normal state
  const [loading, setLoading] = useState(false);

  // Biometric state
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState("");
  const [hasSavedCredentials, setHasSavedCredentials] = useState(false);
  const [showBiometricPrompt, setShowBiometricPrompt] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);

  // Handle Authentication Function

  // This function is called when the user submits the login/signup form
  // It handles both creating a new account and logging into an existing account
  const handleAuth = async (e) => {
    // Prevent the form from refreshing the page (default HTML form behavior)
    e.preventDefault();

    // Clear any previous error messages
    setError("");
    setSuccessMessage("");

    // Set loading state to true (shows "Please wait..." on button)
    setLoading(true);

    // Try-catch block to handle authentication and catch any errors
    try {
      // Check if we're in signup mode or login mode
      if (isSignUp) {
        // SIGNUP MODE - Create a new user account

        // createUserWithEmailAndPassword is a Firebase function that:
        // 1. Creates a new user in Firebase Authentication
        // 2. Automatically logs them in
        // 3. Returns the user credentials
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          email,
          password,
        );

        // Update the user state in the parent App component
        // This will trigger a re-render and show the main app
        setUser(userCredential.user);
      } else {
        // LOGIN MODE - Sign in to an existing account

        // signInWithEmailAndPassword is a Firebase function that:
        // 1. Verifies the email and password
        // 2. Logs the user in
        // 3. Returns the user credentials
        const userCredential = await signInWithEmailAndPassword(
          auth,
          email,
          password,
        );

        // After successful login, offer to save credentials for biometric
        if (biometricAvailable && !hasSavedCredentials) {
          setShowBiometricPrompt(true);
        } else if (hasSavedCredentials) {
          // Update stored credentials if already enabled
          await saveCredentials(email, password);
        }

        // Update the user state
        setUser(userCredential.user);
      }
    } catch (err) {
      // If authentication fails, catch the error and show a friendly message

      // Firebase returns specific error codes we can check
      // We translate these into user-friendly messages

      if (err.code === "auth/user-not-found") {
        // This email doesn't exist in our system
        setError("No account found. Please sign up!");
      } else if (err.code === "auth/wrong-password") {
        // Email exists but password is incorrect
        setError("Incorrect password. Try again.");
      } else if (err.code === "auth/email-already-in-use") {
        // Trying to signup with an email that already has an account
        setError("Account already exists. Log in!");
      } else if (err.code === "auth/weak-password") {
        // Password doesn't meet Firebase requirements (minimum 6 characters)
        setError("Password must be at least 6 characters.");
      } else if (err.code === "auth/invalid-email") {
        // Email format is invalid
        setError("Please enter a valid email address.");
      } else {
        // For any other errors, show the Firebase error message
        setError(err.message);
      }
    } finally {
      // The finally block runs whether try succeeded or failed
      // Set loading back to false to re-enable the submit button
      setLoading(false);
    }
  };

  // Check biometric availability on mount
  /*useEffect(() => {
    const checkBiometric = async () => {
      const { isAvailable, biometryType } = await isBiometricAvailable();
      setBiometricAvailable(isAvailable);
      setBiometricType(biometryType);

      if (isAvailable) {
        const hasCredentials = await hasStoredCredentials();
        setHasSavedCredentials(hasCredentials);

        // Auto-prompt for biometric login if credentials exist
        if (hasCredentials) {
          handleBiometricLogin();
        }
      }
    };

    checkBiometric();
  }, []); */

  // Handle biometric login
  const handleBiometricLogin = async () => {
    setBiometricLoading(true);
    setError("");

    try {
      const result = await authenticateWithBiometric("Log in to MedFit Health");

      if (result.success) {
        await signInWithEmailAndPassword(auth, result.email, result.password);
      } else {
        if (result.error !== "Authentication failed") {
          setError(result.error || "Biometric login failed");
        }
      }
    } catch (error) {
      console.error("Biometric login error:", error);
      setError("Login failed. Please use email and password.");
    } finally {
      setBiometricLoading(false);
    }
  };

  // Enable biometric login
  const enableBiometricLogin = async () => {
    const saved = await saveCredentials(email, password);
    if (saved) {
      setHasSavedCredentials(true);
    }
    setShowBiometricPrompt(false);
  };

  // Skip biometric setup
  const skipBiometricSetup = () => {
    setShowBiometricPrompt(false);
  };

  // HANDLE FORGOT PASSWORD
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // This function sends a password reset email to the user.
  // The email contains a secure link that allows them to set a new password.
  //
  // How it works:
  // 1. User enters their email address
  // 2. Firebase sends an email with a secure reset link
  // 3. User clicks the link and is taken to a Firebase-hosted page
  // 4. User enters their new password
  // 5. Password is updated and user can log in with the new password
  //
  // ═══════════════════════════════════════════════════════════════════════════

  const handleForgotPassword = async (e) => {
    // Prevent the form from refreshing the page
    e.preventDefault();

    // Clear any previous messages
    setError("");
    setSuccessMessage("");

    // ─── VALIDATE EMAIL IS ENTERED ───
    if (!email || email.trim() === "") {
      setError("Please enter your email address.");
      return; // Stop here if no email
    }

    // ─── BASIC EMAIL FORMAT VALIDATION ───
    // This regex checks for a basic email pattern: something@something.something
    // ^ = start of string
    // [^\s@]+ = one or more characters that are NOT whitespace or @
    // @ = literal @ symbol
    // [^\s@]+ = one or more characters that are NOT whitespace or @
    // \. = literal dot
    // [^\s@]+ = one or more characters that are NOT whitespace or @
    // $ = end of string
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      setError("Please enter a valid email address.");
      return; // Stop here if email format is invalid
    }

    // Set loading state
    setLoading(true);

    try {
      // ─── SEND THE PASSWORD RESET EMAIL ───
      // sendPasswordResetEmail is a Firebase function that:
      // 1. Checks if the email exists in the system (but doesn't tell us for security)
      // 2. Generates a secure, time-limited reset token
      // 3. Sends an email with a link containing the token
      // 4. The link goes to a Firebase-hosted password reset page
      await sendPasswordResetEmail(auth, email);

      // ─── SHOW SUCCESS MESSAGE ───
      setSuccessMessage(
        "Password reset email sent! Please check your inbox (and spam folder) for a link to reset your password.",
      );

      // Clear the email field for security
      // (so the email isn't visible if someone else uses the device)
      setEmail("");
    } catch (err) {
      // ─── ERROR HANDLING ───
      console.error("Password reset error:", err.code);

      switch (err.code) {
        case "auth/invalid-email":
          setError("Please enter a valid email address.");
          break;
        case "auth/user-not-found":
          // SECURITY NOTE: For security reasons, we show a generic success message
          // even if the email doesn't exist. This prevents attackers from
          // discovering which emails are registered in our system.
          setSuccessMessage(
            "If an account exists with this email, a password reset link has been sent. Please check your inbox.",
          );
          break;
        case "auth/too-many-requests":
          setError(
            "Too many attempts. Please wait a few minutes before trying again.",
          );
          break;
        case "auth/network-request-failed":
          setError("Network error. Please check your internet connection.");
          break;
        default:
          setError("Failed to send reset email. Please try again.");
      }
    } finally {
      // Stop loading
      setLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // FORM SWITCHING FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // These functions handle switching between the different forms
  // (login, signup, forgot password) and clearing the state appropriately.
  //
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * switchToLogin
   *
   * Switches to the login form and clears all messages.
   */
  const switchToLogin = () => {
    setIsSignUp(false);
    setShowForgotPassword(false);
    setError("");
    setSuccessMessage("");
    setPassword(""); // Clear password for security
  };

  /**
   * switchToSignUp
   *
   * Switches to the signup form and clears all messages.
   */
  const switchToSignUp = () => {
    setIsSignUp(true);
    setShowForgotPassword(false);
    setError("");
    setSuccessMessage("");
    setPassword(""); // Clear password for security
  };

  /**
   * switchToForgotPassword
   *
   * Switches to the forgot password form and clears all messages.
   */
  const switchToForgotPassword = () => {
    setShowForgotPassword(true);
    setError("");
    setSuccessMessage("");
    setPassword(""); // Clear password for security
  };

  // Render Auth Page UI

  return (
    // Outer container with centered layout
    <div className="auth-page">
      {/* Card containing the login/signup/forgot password form */}
      <div className="auth-card">
        {/* Header section */}

        {/* App logo/icon */}
        <div className="auth-logo">🏥</div>

        {/* App name */}
        <h1 className="auth-title">MedFit Health</h1>

        {/* Subtitle - changes based on whether we're in signup or login mode */}
        <p className="auth-sub">
          {
            showForgotPassword
              ? "Enter your email to receive a password reset link"
              : isSignUp
                ? "Create your account to get started" // Shown during signup
                : "Welcome back! Log in to continue" // Shown during login
          }
        </p>

        {/* Only show error box if there's an error message */}
        {error && <div className="auth-error">⚠️ {error}</div>}

        {/* ═══ SUCCESS MESSAGE ═══ */}
        {/* Only shows when password reset email is sent */}
        {successMessage && (
          <div
            style={{
              background: "#f0fdf4",
              border: "2px solid #22c55e",
              color: "#166534",
              padding: "12px 16px",
              borderRadius: 8,
              fontSize: 14,
              marginBottom: 16,
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
            }}
          >
            <span>✅</span>
            <span>{successMessage}</span>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            FORGOT PASSWORD FORM
            Shows when showForgotPassword is true
            ═══════════════════════════════════════════════════════════════════ */}
        {showForgotPassword ? (
          <form onSubmit={handleForgotPassword}>
            {/* Email field */}
            <div className="auth-field">
              <label className="auth-label">Email Address</label>
              <input
                className="auth-input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            {/* Submit button */}
            <button
              type="submit"
              className="auth-submit"
              disabled={loading}
              style={{ opacity: loading ? 0.7 : 1 }}
            >
              {loading ? "⏳ Sending..." : "📧 Send Reset Link"}
            </button>

            {/* Back to login link */}
            <div className="auth-toggle" style={{ marginTop: 20 }}>
              <span>Remember your password? </span>
              <button
                type="button"
                className="auth-toggle-btn"
                onClick={switchToLogin}
              >
                Back to Login
              </button>
            </div>
          </form>
        ) : (
          /* ═══════════════════════════════════════════════════════════════════
             LOGIN / SIGNUP FORM
             Shows when showForgotPassword is false
             ═══════════════════════════════════════════════════════════════════ */
          <form onSubmit={handleAuth}>
            {/* Biometric login button */}
            {/* {biometricAvailable && hasSavedCredentials && !isSignUp && (
              <div style={{ marginBottom: 20 }}>
                <button
                  type="button"
                  onClick={handleBiometricLogin}
                  disabled={biometricLoading}
                  style={{
                    width: "100%",
                    padding: 14,
                    background: "linear-gradient(135deg, #1e3a8a, #3b82f6)",
                    color: "white",
                    border: "none",
                    borderRadius: 12,
                    fontSize: 16,
                    fontWeight: 600,
                    cursor: biometricLoading ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    opacity: biometricLoading ? 0.7 : 1,
                  }}
                >
                  {biometricLoading ? (
                    "Authenticating..."
                  ) : (
                    <>
                      <span style={{ fontSize: 24 }}>
                        {biometricType === "Face ID" ? "👤" : "👆"}
                      </span>
                      Login with {biometricType}
                    </>
                  )}
                </button>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    margin: "16px 0",
                    gap: 10,
                  }}
                >
                  <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
                  <span style={{ color: "#94a3b8", fontSize: 13 }}>
                    or use email
                  </span>
                  <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
                </div>
              </div>
            )} */}

            {/* Email field */}
            <div className="auth-field">
              <label className="auth-label">Email Address</label>
              <input
                className="auth-input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            {/* Password field */}
            <div className="auth-field">
              <label className="auth-label">Password</label>
              <input
                className="auth-input"
                type="password"
                placeholder="Min 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                minLength={6}
              />
            </div>

            {/* Forgot Password link - only shows on login form */}
            {!isSignUp && (
              <div
                style={{ textAlign: "right", marginBottom: 16, marginTop: -8 }}
              >
                <button
                  type="button"
                  onClick={switchToForgotPassword}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#2563eb",
                    fontSize: 13,
                    cursor: "pointer",
                    textDecoration: "underline",
                    padding: 0,
                  }}
                >
                  Forgot your password?
                </button>
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              className="auth-submit"
              disabled={loading}
              style={{ opacity: loading ? 0.7 : 1 }}
            >
              {loading
                ? "⏳ Please wait..."
                : isSignUp
                  ? "🚀 Create Account"
                  : "🔐 Log In"}
            </button>

            {/* Toggle between Login and Signup */}
            <div className="auth-toggle">
              {isSignUp
                ? "Already have an account? "
                : "Don't have an account? "}
              <button
                type="button"
                className="auth-toggle-btn"
                onClick={() => {
                  if (isSignUp) {
                    switchToLogin();
                  } else {
                    switchToSignUp();
                  }
                }}
              >
                {isSignUp ? "Log In" : "Sign Up"}
              </button>
            </div>
          </form>
        )}
      </div>
      {/* Biometric Setup Prompt Modal */}
      {showBiometricPrompt && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            padding: 20,
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: 20,
              padding: 24,
              maxWidth: 340,
              width: "100%",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 70,
                height: 70,
                background: "linear-gradient(135deg, #dbeafe, #bfdbfe)",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
                fontSize: 32,
              }}
            >
              {biometricType === "Face ID" ? "👤" : "👆"}
            </div>

            <h3
              style={{
                margin: "0 0 8px",
                fontSize: 20,
                fontWeight: 700,
                color: "#1e293b",
              }}
            >
              Enable {biometricType}?
            </h3>

            <p
              style={{
                margin: "0 0 24px",
                color: "#64748b",
                fontSize: 14,
                lineHeight: 1.5,
              }}
            >
              Log in faster next time using {biometricType}. Your credentials
              will be stored securely.
            </p>

            <button
              onClick={enableBiometricLogin}
              style={{
                width: "100%",
                padding: 14,
                background: "#2563eb",
                color: "white",
                border: "none",
                borderRadius: 10,
                fontSize: 16,
                fontWeight: 600,
                cursor: "pointer",
                marginBottom: 10,
              }}
            >
              Enable {biometricType}
            </button>

            <button
              onClick={skipBiometricSetup}
              style={{
                width: "100%",
                padding: 14,
                background: "transparent",
                color: "#64748b",
                border: "none",
                borderRadius: 10,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Not Now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Export the component so it can be imported in App.js
export default Auth;
