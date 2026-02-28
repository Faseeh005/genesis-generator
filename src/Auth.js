// ══════════════════════════════════════════════════════════════════════════════
// AUTH COMPONENT - Login and Signup Page
// This component handles user authentication (logging in and signing up)
// It's shown when the user is not logged in
// ══════════════════════════════════════════════════════════════════════════════

// Import React and the useState hook for managing component state
import React, { useState } from "react";

// Import Firebase authentication functions
import { auth } from "./firebase"; // Our Firebase configuration
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";

// ──────────────────────────────────────────────────────────────────────────────
// Auth Component Function
// Props:
//   - user: the currently logged-in user (should be null when this renders)
//   - setUser: function to update the user state in the parent component
// ──────────────────────────────────────────────────────────────────────────────

function Auth({ user, setUser }) {
  // ═══ STATE VARIABLES ═══════════════════════════════════════════════════════

  // email - stores the email address entered by the user
  const [email, setEmail] = useState("");

  // password - stores the password entered by the user
  const [password, setPassword] = useState("");

  // isSignUp - boolean that determines if we're showing signup or login form
  // true = signup form, false = login form
  const [isSignUp, setIsSignUp] = useState(false);

  // error - stores any error message to show to the user
  // Empty string means no error
  const [error, setError] = useState("");

  // loading - boolean that tracks if we're currently processing authentication
  // true = show loading state, false = normal state
  const [loading, setLoading] = useState(false);

  // ═══ HANDLE AUTHENTICATION FUNCTION ════════════════════════════════════════

  // This function is called when the user submits the login/signup form
  // It handles both creating a new account and logging into an existing account
  const handleAuth = async (e) => {
    // Prevent the form from refreshing the page (default HTML form behavior)
    e.preventDefault();

    // Clear any previous error messages
    setError("");

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

  // ═══ RENDER AUTH PAGE UI ═══════════════════════════════════════════════════

  return (
    // Outer container with centered layout
    <div className="auth-page">
      {/* Card containing the login/signup form */}
      <div className="auth-card">
        {/* ─── HEADER SECTION ─── */}

        {/* App logo/icon */}
        <div className="auth-logo">🏥</div>

        {/* App name */}
        <h1 className="auth-title">MedFit Health</h1>

        {/* Subtitle - changes based on whether we're in signup or login mode */}
        <p className="auth-sub">
          {
            isSignUp
              ? "Create your account to get started" // Shown during signup
              : "Welcome back! Log in to continue" // Shown during login
          }
        </p>

        {/* ─── ERROR MESSAGE DISPLAY ─── */}

        {/* Only show error box if there's an error message */}
        {error && <div className="auth-error">⚠️ {error}</div>}

        {/* ─── AUTHENTICATION FORM ─── */}

        {/* Form element - calls handleAuth when submitted */}
        <form onSubmit={handleAuth}>
          {/* EMAIL FIELD */}
          <div className="auth-field">
            <label className="auth-label">Email Address</label>
            <input
              className="auth-input"
              type="email" // HTML5 email validation
              placeholder="you@example.com"
              value={email} // Controlled input - value comes from state
              onChange={(e) => setEmail(e.target.value)} // Update state when user types
              required // HTML5 required attribute
            />
          </div>

          {/* PASSWORD FIELD */}
          <div className="auth-field">
            <label className="auth-label">Password</label>
            <input
              className="auth-input"
              type="password" // Hides password characters
              placeholder="Min 6 characters"
              value={password} // Controlled input
              onChange={(e) => setPassword(e.target.value)} // Update state
              required
            />
          </div>

          {/* SUBMIT BUTTON */}
          <button
            type="submit"
            className="auth-submit"
            disabled={loading} // Disable button while processing to prevent double-submission
          >
            {/* Button text changes based on state */}
            {
              loading
                ? "⏳ Please wait..." // Shown while authenticating
                : isSignUp
                  ? "🚀 Create Account" // Shown in signup mode
                  : "🔐 Log In" // Shown in login mode
            }
          </button>
        </form>

        {/* ─── TOGGLE BETWEEN LOGIN AND SIGNUP ─── */}

        {/* Links to switch between login and signup modes */}
        <div className="auth-toggle">
          {/* Text changes based on current mode */}
          {
            isSignUp
              ? "Already have an account?" // Shown in signup mode
              : "Don't have an account?" // Shown in login mode
          }

          {/* Button to toggle between modes */}
          <button
            className="auth-toggle-btn"
            onClick={() => {
              // Toggle the signup mode
              setIsSignUp(!isSignUp);

              // Clear any error messages when switching modes
              setError("");
            }}
          >
            {/* Button text is opposite of current mode */}
            {isSignUp ? "Log In" : "Sign Up"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Export the component so it can be imported in App.js
export default Auth;
