// React and hooks - the foundation of our React app
import React, { useState, useEffect, useRef } from "react";

// CSS imported from main.tsx

// Firebase imports - for database and authentication
import { database, auth } from "./firebase";
import {
  ref,
  push,
  onValue,
  remove,
  update,
  set,
  get,
} from "firebase/database";
import { onAuthStateChanged, signOut, deleteUser } from "firebase/auth";

// Gives access to Apple Health data on iOS devices
import { useHealthKit } from "./useHealthKit";

import { getUserDisplayName } from "./utils"; // Utility function for getting display name

// Our custom components
import Auth from "./Auth"; // Login/signup page
import Chat from "./Chat"; // AI chat assistant
import {
  requestNotificationPermission,
  showNotification,
  scheduleNotification,
} from "./Notifications";
// import { type } from "firebase/firestore/pipelines"; // removed - unused

// Add this import with your other imports
import {
  isBiometricAvailable,
  saveCredentials,
  hasStoredCredentials,
  authenticateWithBiometric,
} from "./biometricAuth";

// VOICE ASSISTANT UTILITY FUNCTION
// This function converts text to speech using the Web Speech API
// Built into all modern browsers - no libraries needed!

const speak = (text, isEnabled) => {
  // If voice is disabled, don't speak
  if (!isEnabled) return;

  // Check if browser supports speech synthesis
  if (!window.speechSynthesis) {
    console.warn("Speech synthesis not supported in this browser");
    return;
  }

  // Cancel any currently speaking text to avoid overlapping
  window.speechSynthesis.cancel();

  // Helper to actually speak once we have a voice
  const doSpeak = (voice) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    utterance.lang = "en-GB";
    if (voice) utterance.voice = voice;

    utterance.onerror = (event) => {
      console.error("Speech synthesis error:", event);
    };

    window.speechSynthesis.speak(utterance);
  };

  // Try to find a good English voice
  const pickVoice = () => {
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;
    // Prefer a natural/enhanced English voice
    const preferred = voices.find(
      (v) =>
        v.lang.startsWith("en") &&
        /natural|enhanced|premium|neural/i.test(v.name),
    );
    if (preferred) return preferred;
    // Fallback: any English voice
    const english = voices.find((v) => v.lang.startsWith("en"));
    return english || voices[0];
  };

  // On Android Chrome, voices load asynchronously
  const voices = window.speechSynthesis.getVoices();
  if (voices && voices.length > 0) {
    doSpeak(pickVoice());
  } else {
    // Wait for voices to load then speak
    const onVoicesReady = () => {
      window.speechSynthesis.removeEventListener(
        "voiceschanged",
        onVoicesReady,
      );
      doSpeak(pickVoice());
    };
    window.speechSynthesis.addEventListener("voiceschanged", onVoicesReady);
    // Fallback timeout: speak without voice selection after 500ms
    setTimeout(() => {
      window.speechSynthesis.removeEventListener(
        "voiceschanged",
        onVoicesReady,
      );
      if (window.speechSynthesis.speaking) return;
      doSpeak(null);
    }, 500);
  }
};

// Function for Measurements page
function Measurements({ user, setActivePage, initialTab }) {
  const [activeTab, setActiveTab] = useState(initialTab || "log");
  const [measurements, setMeasurements] = useState({
    systolic: "",
    diastolic: "",
    heartRate: "",
    weight: "",
    bloodSugarBefore: "",
    bloodSugarAfter: "",
    temperature: "",
  });

  const [history, setHistory] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [editingReminder, setEditingReminder] = useState(null);
  const [reminderType, setReminderType] = useState("measurement");
  const [reminderTitle, setReminderTitle] = useState("");
  const [reminderTime, setReminderTime] = useState("08:00");
  const [reminderDays, setReminderDays] = useState([
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
    "Sat",
    "Sun",
  ]);
  const [reminderNotes, setReminderNotes] = useState("");

  const today = new Date().toISOString().split("T")[0];
  const userName = user.email.split("@")[0];

  // loads measurement history from last 7 days
  // sorts by date and reverses to show oldest first
  useEffect(() => {
    if (!user) return;
    const historyRef = ref(database, `users/${user.uid}/measurements`);
    onValue(historyRef, (snapshot) => {
      if (snapshot.val()) {
        const data = Object.entries(snapshot.val()).map(([date, values]) => ({
          date,
          ...values,
        }));
        const last7Days = data
          .sort((a, b) => new Date(b.date) - new Date(a.date))
          .slice(0, 7)
          .reverse();
        setHistory(last7Days);
      } else {
        setHistory([]);
      }
    });
  }, [user]);

  // loads all reminders from firebase
  // converts object to array for easier mapping
  useEffect(() => {
    if (!user) return;
    const remindersRef = ref(database, `users/${user.uid}/reminders`);
    onValue(remindersRef, (snapshot) => {
      if (snapshot.val()) {
        const data = Object.entries(snapshot.val()).map(([id, reminder]) => ({
          id,
          ...reminder,
        }));
        setReminders(data);
      } else {
        setReminders([]);
      }
    });
  }, [user]);

  // loads today's measurements if already logged
  // pre-fills form with existing values
  useEffect(() => {
    if (!user) return;
    const todayRef = ref(database, `users/${user.uid}/measurements/${today}`);
    onValue(todayRef, (snapshot) => {
      if (snapshot.val()) {
        setMeasurements(snapshot.val());
      }
    });
  }, [user, today]);

  // saves today's measurements to firebase
  // filters out any empty fields before saving
  const saveMeasurements = async () => {
    const filteredMeasurements = Object.fromEntries(
      Object.entries(measurements).filter(([_, value]) => value !== ""),
    );

    if (Object.keys(filteredMeasurements).length === 0) {
      alert("Please enter at least one measurement");
      return;
    }

    const measurementRef = ref(
      database,
      `users/${user.uid}/measurements/${today}`,
    );
    await update(measurementRef, filteredMeasurements);
    alert("Measurements saved successfully!");
  };

  // creates new reminder or updates existing one
  // pushes to firebase if new, updates if editing
  const saveReminder = async () => {
    if (!reminderTitle || !reminderTime) {
      alert("Please fill in title and time");
      return;
    }

    const reminderData = {
      type: reminderType,
      title: reminderTitle,
      time: reminderTime,
      days: reminderDays,
      notes: reminderNotes,
      enabled: true,
      createdAt: new Date().toISOString(),
    };

    if (editingReminder) {
      const reminderRef = ref(
        database,
        `users/${user.uid}/reminders/${editingReminder.id}`,
      );
      await update(reminderRef, reminderData);
    } else {
      const remindersRef = ref(database, `users/${user.uid}/reminders`);
      await push(remindersRef, reminderData);
    }

    closeReminderModal();
  };

  // deletes reminder from firebase after confirmation
  const deleteReminder = async (id) => {
    if (window.confirm("Delete this reminder?")) {
      await remove(ref(database, `users/${user.uid}/reminders/${id}`));
    }
  };

  // toggles reminder on/off by flipping enabled boolean
  const toggleReminder = async (reminder) => {
    const reminderRef = ref(
      database,
      `users/${user.uid}/reminders/${reminder.id}`,
    );
    await update(reminderRef, { enabled: !reminder.enabled });
  };

  // loads reminder data into form for editing
  // sets all form fields and opens modal
  const editReminder = (reminder) => {
    setEditingReminder(reminder);
    setReminderType(reminder.type);
    setReminderTitle(reminder.title);
    setReminderTime(reminder.time);
    setReminderDays(reminder.days);
    setReminderNotes(reminder.notes || "");
    setShowReminderModal(true);
  };

  // resets all form fields and closes modal
  const closeReminderModal = () => {
    setShowReminderModal(false);
    setEditingReminder(null);
    setReminderType("measurement");
    setReminderTitle("");
    setReminderTime("08:00");
    setReminderDays(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    setReminderNotes("");
  };

  // adds or removes day from reminder schedule
  const toggleDay = (day) => {
    if (reminderDays.includes(day)) {
      setReminderDays(reminderDays.filter((d) => d !== day));
    } else {
      setReminderDays([...reminderDays, day]);
    }
  };

  // transforms history data into format for graphs
  // creates separate datasets for each measurement type
  const graphData = {
    bloodPressure: history.map((day) => ({
      date: new Date(day.date).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
      }),
      systolic: day.systolic || 0,
      diastolic: day.diastolic || 0,
    })),
    heartRate: history.map((day) => ({
      date: new Date(day.date).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
      }),
      bpm: day.heartRate || 0,
    })),
    weight: history.map((day) => ({
      date: new Date(day.date).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
      }),
      kg: day.weight || 0,
    })),
    bloodSugar: history.map((day) => ({
      date: new Date(day.date).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
      }),
      before: day.bloodSugarBefore || 0,
      after: day.bloodSugarAfter || 0,
    })),
    temperature: history.map((day) => ({
      date: new Date(day.date).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
      }),
      temp: day.temperature || 0,
    })),
  };

  return (
    <div className="page">
      <div className="page-header-bar">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            className="back-btn"
            onClick={() => setActivePage("dashboard")}
          >
            ← Back to Dashboard
          </button>
          <div>
            <h1 className="page-title-main">📊 Health Measurements</h1>
            <p className="page-subtitle">
              Track your vital signs and set reminders
            </p>
          </div>
        </div>
        <span className="header-user">{userName}</span>
      </div>

      <div className="measurements-tabs">
        <button
          className={`measurements-tab ${activeTab === "log" ? "active" : ""}`}
          onClick={() => setActiveTab("log")}
        >
          📝 Log Measurements
        </button>
        <button
          className={`measurements-tab ${activeTab === "reminders" ? "active" : ""}`}
          onClick={() => setActiveTab("reminders")}
        >
          🔔 Reminders
        </button>
      </div>

      {activeTab === "log" && (
        <>
          <div className="card-white">
            <h3 className="section-title">
              Today's Measurements - {new Date().toLocaleDateString("en-GB")}
            </h3>

            <div className="measurements-grid">
              <div className="measurement-item">
                <div className="measurement-icon">🩸</div>
                <div className="measurement-label">Blood Pressure</div>
                <div className="bp-inputs">
                  <input
                    type="number"
                    className="form-input"
                    placeholder="Systolic"
                    value={measurements.systolic}
                    onChange={(e) =>
                      setMeasurements({
                        ...measurements,
                        systolic: e.target.value,
                      })
                    }
                  />
                  <span className="bp-separator">/</span>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="Diastolic"
                    value={measurements.diastolic}
                    onChange={(e) =>
                      setMeasurements({
                        ...measurements,
                        diastolic: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="measurement-unit">mmHg</div>
              </div>

              <div className="measurement-item">
                <div className="measurement-icon">❤️</div>
                <div className="measurement-label">Heart Rate</div>
                <input
                  type="number"
                  className="form-input"
                  placeholder="Enter BPM"
                  value={measurements.heartRate}
                  onChange={(e) =>
                    setMeasurements({
                      ...measurements,
                      heartRate: e.target.value,
                    })
                  }
                />
                <div className="measurement-unit">BPM</div>
              </div>

              <div className="measurement-item">
                <div className="measurement-icon">⚖️</div>
                <div className="measurement-label">Weight</div>
                <input
                  type="number"
                  className="form-input"
                  placeholder="Enter weight"
                  value={measurements.weight}
                  onChange={(e) =>
                    setMeasurements({ ...measurements, weight: e.target.value })
                  }
                />
                <div className="measurement-unit">kg</div>
              </div>

              <div className="measurement-item">
                <div className="measurement-icon">🍽️</div>
                <div className="measurement-label">
                  Blood Sugar (Before Meal)
                </div>
                <input
                  type="number"
                  className="form-input"
                  placeholder="Before eating"
                  value={measurements.bloodSugarBefore}
                  onChange={(e) =>
                    setMeasurements({
                      ...measurements,
                      bloodSugarBefore: e.target.value,
                    })
                  }
                />
                <div className="measurement-unit">mg/dL</div>
              </div>

              <div className="measurement-item">
                <div className="measurement-icon">🍽️</div>
                <div className="measurement-label">
                  Blood Sugar (After Meal)
                </div>
                <input
                  type="number"
                  className="form-input"
                  placeholder="After eating"
                  value={measurements.bloodSugarAfter}
                  onChange={(e) =>
                    setMeasurements({
                      ...measurements,
                      bloodSugarAfter: e.target.value,
                    })
                  }
                />
                <div className="measurement-unit">mg/dL</div>
              </div>

              <div className="measurement-item">
                <div className="measurement-icon">🌡️</div>
                <div className="measurement-label">Temperature</div>
                <input
                  type="number"
                  step="0.1"
                  className="form-input"
                  placeholder="Body temp"
                  value={measurements.temperature}
                  onChange={(e) =>
                    setMeasurements({
                      ...measurements,
                      temperature: e.target.value,
                    })
                  }
                />
                <div className="measurement-unit">°C</div>
              </div>
            </div>

            <button
              className="save-measurements-btn"
              onClick={saveMeasurements}
            >
              💾 Save Today's Measurements
            </button>
          </div>

          <h2 className="section-title-lg" style={{ marginTop: 32 }}>
            Weekly Trends (Last 7 Days)
          </h2>

          {history.length === 0 ? (
            <div className="empty-state">
              <div style={{ fontSize: 56 }}>📊</div>
              <p>No measurement history yet. Start logging to see trends!</p>
            </div>
          ) : (
            <div className="graphs-grid">
              <div className="graph-card">
                <h3 className="graph-title">🩸 Blood Pressure</h3>
                <div className="simple-graph">
                  {graphData.bloodPressure.map((point, index) => (
                    <div key={index} className="graph-bar-group">
                      <div className="graph-bars">
                        <div
                          className="graph-bar systolic"
                          style={{
                            height: `${(point.systolic / 200) * 100}px`,
                          }}
                          title={`Systolic: ${point.systolic}`}
                          role="img"
                          aria-label={`Systolic: ${point.systolic} mmHg`}
                          tabIndex="0"
                        ></div>
                        <div
                          className="graph-bar diastolic"
                          style={{
                            height: `${(point.diastolic / 200) * 100}px`,
                          }}
                          title={`Diastolic: ${point.diastolic}`}
                          role="img"
                          aria-label={`Diastolic: ${point.diastolic} mmHg`}
                          tabIndex="0"
                        ></div>
                      </div>
                      <div className="graph-label">{point.date}</div>
                    </div>
                  ))}
                </div>
                <div className="graph-legend">
                  <span>
                    <span className="legend-dot systolic"></span> Systolic
                  </span>
                  <span>
                    <span className="legend-dot diastolic"></span> Diastolic
                  </span>
                </div>
              </div>

              <div className="graph-card">
                <h3 className="graph-title">❤️ Heart Rate</h3>
                <div className="simple-graph">
                  {graphData.heartRate.map((point, index) => (
                    <div key={index} className="graph-bar-group">
                      <div
                        className="graph-bar heart-rate"
                        style={{ height: `${(point.bpm / 150) * 100}px` }}
                        title={`${point.bpm} BPM`}
                        role="img"
                        aria-label={`Heart rate: ${point.bpm} beats per minute`}
                        tabIndex="0"
                      ></div>
                      <div className="graph-label">{point.date}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="graph-card">
                <h3 className="graph-title">⚖️ Weight</h3>
                <div className="simple-graph">
                  {graphData.weight.map((point, index) => (
                    <div key={index} className="graph-bar-group">
                      <div
                        className="graph-bar weight"
                        style={{ height: `${(point.kg / 150) * 100}px` }}
                        title={`${point.kg} kg`}
                        role="img"
                        aria-label={`Weight: ${point.kg} kilograms`}
                        tabIndex="0"
                      ></div>
                      <div className="graph-label">{point.date}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="graph-card">
                <h3 className="graph-title">🍽️ Blood Sugar</h3>
                <div className="simple-graph">
                  {graphData.bloodSugar.map((point, index) => (
                    <div key={index} className="graph-bar-group">
                      <div className="graph-bars">
                        <div
                          className="graph-bar blood-sugar-before"
                          style={{ height: `${(point.before / 300) * 100}px` }}
                          title={`Before: ${point.before}`}
                          role="img"
                          aria-label={`Blood sugar before meal: ${point.before} mg/dL`}
                          tabIndex="0"
                        ></div>
                        <div
                          className="graph-bar blood-sugar-after"
                          style={{ height: `${(point.after / 300) * 100}px` }}
                          title={`After: ${point.after}`}
                          role="img"
                          aria-label={`Blood sugar after meal: ${point.after} mg/dL`}
                          tabIndex="0"
                        ></div>
                      </div>
                      <div className="graph-label">{point.date}</div>
                    </div>
                  ))}
                </div>
                <div className="graph-legend">
                  <span>
                    <span className="legend-dot blood-sugar-before"></span>{" "}
                    Before Meal
                  </span>
                  <span>
                    <span className="legend-dot blood-sugar-after"></span> After
                    Meal
                  </span>
                </div>
              </div>

              <div className="graph-card">
                <h3 className="graph-title">🌡️ Temperature</h3>
                <div className="simple-graph">
                  {graphData.temperature.map((point, index) => (
                    <div key={index} className="graph-bar-group">
                      <div
                        className="graph-bar temperature"
                        style={{ height: `${((point.temp - 35) / 8) * 100}px` }}
                        title={`${point.temp}°C`}
                        role="img"
                        aria-label={`Temperature: ${point.temp} degrees Celsius`}
                        tabIndex="0"
                      ></div>
                      <div className="graph-label">{point.date}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === "reminders" && (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <h2 className="section-title-lg">Your Reminders</h2>
            <button
              className="add-med-btn"
              onClick={() => setShowReminderModal(true)}
            >
              + Add Reminder
            </button>
          </div>

          {reminders.length === 0 ? (
            <div className="empty-state">
              <div style={{ fontSize: 56 }}>🔔</div>
              <p>No reminders set. Create one to stay on track!</p>
            </div>
          ) : (
            <div className="reminders-grid">
              {reminders.map((reminder) => (
                <div
                  key={reminder.id}
                  className={`reminder-card ${!reminder.enabled ? "disabled" : ""}`}
                >
                  <div className="reminder-header">
                    <div className="reminder-type-badge">
                      {reminder.type === "measurement" ? "📊" : "💊"}
                      {reminder.type === "measurement"
                        ? "Measurement"
                        : "Medication"}
                    </div>
                    <label className="reminder-toggle">
                      <input
                        type="checkbox"
                        checked={reminder.enabled}
                        onChange={() => toggleReminder(reminder)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  <h3 className="reminder-title">{reminder.title}</h3>
                  <div className="reminder-time">🕐 {reminder.time}</div>

                  <div className="reminder-days">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                      (day) => (
                        <span
                          key={day}
                          className={`day-badge ${reminder.days.includes(day) ? "active" : "inactive"}`}
                        >
                          {day}
                        </span>
                      ),
                    )}
                  </div>

                  {reminder.notes && (
                    <div className="reminder-notes">📝 {reminder.notes}</div>
                  )}

                  <div className="reminder-actions">
                    <button
                      className="reminder-action-btn edit"
                      onClick={() => editReminder(reminder)}
                    >
                      ✏️ Edit
                    </button>
                    <button
                      className="reminder-action-btn delete"
                      onClick={() => deleteReminder(reminder.id)}
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* reminder modal */}
      {showReminderModal && (
        <div className="modal-overlay" onClick={closeReminderModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>{editingReminder ? "Edit Reminder" : "Add Reminder"}</h2>
                <p className="modal-sub">Set up a reminder to stay on track</p>
              </div>
              <button className="modal-close" onClick={closeReminderModal}>
                ✕
              </button>
            </div>

            <div className="modal-body">
              <label className="form-label">Reminder Type</label>
              <select
                className="form-input"
                value={reminderType}
                onChange={(e) => setReminderType(e.target.value)}
              >
                <option value="measurement">📊 Measurement Reminder</option>
                <option value="medication">💊 Medication Reminder</option>
              </select>

              <label className="form-label">Title *</label>
              <input
                className="form-input"
                placeholder="e.g., Check Blood Pressure"
                value={reminderTitle}
                onChange={(e) => setReminderTitle(e.target.value)}
              />

              <label className="form-label">Time *</label>
              <input
                type="time"
                className="form-input"
                value={reminderTime}
                onChange={(e) => setReminderTime(e.target.value)}
              />

              <label className="form-label">Repeat on Days</label>
              <div className="day-selector">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                  (day) => (
                    <button
                      key={day}
                      className={`day-btn ${reminderDays.includes(day) ? "selected" : ""}`}
                      onClick={() => toggleDay(day)}
                    >
                      {day}
                    </button>
                  ),
                )}
              </div>

              <label className="form-label">Notes (Optional)</label>
              <textarea
                className="form-input form-textarea"
                placeholder="Additional notes..."
                value={reminderNotes}
                onChange={(e) => setReminderNotes(e.target.value)}
              />
            </div>

            <div className="modal-footer">
              <button className="modal-cancel" onClick={closeReminderModal}>
                Cancel
              </button>
              <button className="modal-submit" onClick={saveReminder}>
                {editingReminder ? "Update Reminder" : "Add Reminder"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// DASHBOARD COMPONENT
// This is the main home page users see when they log in
// Shows overview of health stats, water intake, charts, and quick action buttons

function Dashboard({ user, userProfile, medications, setActivePage }) {
  // fitness - stores today's fitness data (steps, water, activities)
  const [fitness, setFitness] = useState(null);

  // Track which medications have been taken today
  // This is the same state we use in the Medications page
  const [takenMeds, setTakenMeds] = useState({});

  // NOTIFICATIONS STATE
  // Controls whether the notifications dropdown is visible
  const [showNotifications, setShowNotifications] = useState(false);
  const bellAnchorRef = useRef(null);
  const [notificationsDropdownStyle, setNotificationsDropdownStyle] = useState(
    {},
  );

  // Stores the user's reminders/notifications from Firebase
  const [notifications, setNotifications] = useState([]);

  // Stores notification history (past notifications that have been triggered)
  const [notificationHistory, setNotificationHistory] = useState([]);

  // Count of unread notifications
  const [unreadCount, setUnreadCount] = useState(0);

  // Hover state for donut chart tooltip
  const [hoveredSegment, setHoveredSegment] = useState(null); // 'taken', 'pending', or null

  // HealthKit disabled for Android compatibility
  /* const healthKitAvailable = false;
  const healthKitAuthorized = false;
  const healthKitLoading = false;
  const requestHealthKitAuth = async () => false;
  const refreshHealthData = async () => {};
  const weeklySteps = []; */

  // Healthkit Integration connects to Apple HealthKit on iOS devices.
  // On localhost it returns default values and isAvailable = false.

  const {
    isAvailable: healthKitAvailable, // Is HealthKit available? (iOS only)
    isAuthorized: healthKitAuthorized, // Has user granted permission?
    isLoading: healthKitLoading, // Is data being fetched?

    healthData, // Today's health metrics
    weeklySteps, // Past 7 days of steps

    requestAuthorization: requestHealthKitAuth, // Function to request permission
    refreshHealthData, // Function to refresh data
  } = useHealthKit();

  // Date & Time Formatting

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // User Data Calculations

  const userName = user.email.split("@")[0];
  const steps = healthData.isFromHealthKit
    ? healthData.steps
    : fitness?.steps || 0;
  const water = fitness?.water || 0;
  const waterMl = water * 250;
  const waterGoal = 2000;
  const waterPct = Math.min(100, Math.round((waterMl / waterGoal) * 100));
  const activities = fitness?.activities || [];
  const totalMins = activities.reduce(
    (sum, activity) => sum + (activity.duration || 0),
    0,
  );
  // Get calories from healthKit
  const healthKitCalories = healthData.isFromHealthKit
    ? healthData.calories
    : 0;

  // Weekly steps for the bar chart
  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const chartSteps =
    healthData.isFromHealthKit && weeklySteps.length > 0
      ? weeklySteps.map((day) => day.steps) // Extract steps from each day object
      : [0, 0, 0, 0, 0, 0, steps || 0];

  // Find the maximum steps for scaling the chart bars
  const maxSteps = Math.max(...chartSteps, 1);

  // Calculate REAL medication adherence statistics

  // Get today's date
  const today = new Date().toDateString();

  // Calculate taken and pending counts properly
  let totalDosesToday = 0;
  let dosesTakenToday = 0;

  medications.forEach((med) => {
    const freq = (med.frequency || "").toLowerCase();

    let dosesPerDay = 1;

    let doseSlots = ["single"];

    if (freq.includes("three times")) {
      dosesPerDay = 3;
      doseSlots = ["morning", "afternoon", "evening"];
    } else if (freq.includes("twice")) {
      dosesPerDay = 2;
      doseSlots = ["morning", "evening"];
    } else if (freq.includes("as needed")) {
      dosesPerDay = 0;
      doseSlots = [];
    } else {
      dosesPerDay = 1;
      doseSlots = ["single"];
    }

    // Add this medication's doses to the total expected for today
    totalDosesToday += dosesPerDay;

    // Count how many doses of this medication were taken today
    // Check each dose slot for this medication
    doseSlots.forEach((slot) => {
      // Create the key used in takenMeds (e.g. "abc123_morning")
      const doseKey = `${med.id}_${slot}`;

      if (takenMeds[doseKey] === true) {
        dosesTakenToday += 1;
      }
    });
  });

  // Formula: (doses taken / total doses) * 100
  // Math.min(100, ...) caps the percentage at 100% maximum
  // This prevents the percentage from going over 100% due to any data issues
  const takenPercentage =
    totalDosesToday > 0
      ? Math.min(100, Math.round((dosesTakenToday / totalDosesToday) * 100))
      : 0;

  // Count how many medications have been marked as taken
  const takenCount = dosesTakenToday;

  // Total number of medications
  const totalMeds = medications.length;

  // Count pending (not taken yet)
  const pendingCount = Math.max(0, totalDosesToday - dosesTakenToday);

  const pendingPercentage =
    totalDosesToday > 0 ? Math.max(0, 100 - takenPercentage) : 100;

  // Calculate percentages for the donut chart
  // If no medications, show 0% taken
  /*const takenPercentage = totalMeds > 0 ? (takenCount / totalMeds) * 100 : 0;
  const pendingPercentage =
    totalMeds > 0 ? (pendingCount / totalMeds) * 100 : 100; */

  // Load Fitness Data Effect

  useEffect(() => {
    if (!user) return;

    const today = new Date().toISOString().split("T")[0];
    const fitnessRef = ref(database, `users/${user.uid}/fitness/${today}`);

    onValue(fitnessRef, (snapshot) => {
      setFitness(snapshot.val());
    });
  }, [user]);

  // Load Taken Medications Effect

  // Load which medications have been marked as taken today
  // This is the SAME data used in the Medications page
  useEffect(() => {
    if (!user) return;

    const today = new Date().toISOString().split("T")[0];

    // Reference to today's taken medications
    const takenRef = ref(database, `users/${user.uid}/takenMeds/${today}`);

    const unsubscribe = onValue(takenRef, (snapshot) => {
      console.log("Firebase data received:", snapshot.val());

      if (snapshot.val()) {
        setTakenMeds(snapshot.val());
        console.log("Loaded takenMeds:", snapshot.val());
      } else {
        setTakenMeds({});
        console.log("No takenMeds data for today - set empty object");
      }
    });

    return () => {
      console.log("Cleaning up listener");
      unsubscribe();
    };
  }, [user, today]);

  // LOAD NOTIFICATIONS FROM FIREBASE
  // This effect loads: upcoming medication reminders and notification history

  useEffect(() => {
    if (!user) return;

    // Load Active Reminders
    const remindersRef = ref(database, `users/${user.uid}/reminders`);

    const unsubscribeReminders = onValue(remindersRef, (snapshot) => {
      if (snapshot.val()) {
        const remindersData = snapshot.val();
        const remindersList = Object.entries(remindersData).map(
          ([id, reminder]) => ({
            id,
            ...reminder,
          }),
        );

        // Sort by time (earliest first)
        remindersList.sort((a, b) => {
          const timeA = a.time || "00:00";
          const timeB = b.time || "00:00";
          return timeA.localeCompare(timeB);
        });

        setNotifications(remindersList);
      } else {
        setNotifications([]);
      }
    });

    // Load Notification History
    const historyRef = ref(database, `users/${user.uid}/notificationHistory`);

    const unsubscribeHistory = onValue(historyRef, (snapshot) => {
      if (snapshot.val()) {
        const historyData = snapshot.val();
        const historyList = Object.entries(historyData).map(
          ([id, notification]) => ({
            id,
            ...notification,
          }),
        );

        // Sort by timestamp (most recent first)
        historyList.sort((a, b) => {
          const dateA = new Date(a.triggeredAt || 0);
          const dateB = new Date(b.triggeredAt || 0);
          return dateB - dateA;
        });

        // Count unread notifications
        const unread = historyList.filter((n) => !n.read).length;
        setUnreadCount(unread);

        setNotificationHistory(historyList);
      } else {
        setNotificationHistory([]);
        setUnreadCount(0);
      }
    });

    // Cleanup listeners
    return () => {
      unsubscribeReminders();
      unsubscribeHistory();
    };
  }, [user]);

  // Notification helper functions

  const formatTime = (time) => {
    if (!time) return "";
    const [hours, minutes] = time.split(":");
    const hour = parseInt(hours);
    return `${hour > 12 ? hour - 12 : hour || 12}:${minutes} ${hour >= 12 ? "PM" : "AM"}`;
  };

  const formatNotificationDate = (dateString) => {
    if (!dateString) return "";

    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Check if it's today
    if (date.toDateString() === today.toDateString()) {
      return `Today at ${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
    }

    // Check if it's yesterday
    if (date.toDateString() === yesterday.toDateString()) {
      return `Yesterday at ${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
    }

    // Otherwise show the date
    return date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const markNotificationAsRead = async (notificationId) => {
    if (!user) return;

    const notificationRef = ref(
      database,
      `users/${user.uid}/notificationHistory/${notificationId}`,
    );
    await update(notificationRef, { read: true });
  };

  const markAllNotificationsAsRead = async () => {
    if (!user) return;

    const updates = {};
    notificationHistory.forEach((notification) => {
      if (!notification.read) {
        updates[
          `users/${user.uid}/notificationHistory/${notification.id}/read`
        ] = true;
      }
    });

    if (Object.keys(updates).length > 0) {
      await update(ref(database), updates);
    }
  };

  const clearAllNotifications = async () => {
    if (!user) return;

    const historyRef = ref(database, `users/${user.uid}/notificationHistory`);
    await remove(historyRef);
    setNotificationHistory([]);
    setUnreadCount(0);
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case "medication":
        return "💊";
      case "appointment":
        return "📅";
      case "measurement":
        return "📊";
      case "exercise":
        return "🏃";
      case "water":
        return "💧";
      default:
        return "🔔";
    }
  };

  const updateNotificationsDropdownPosition = () => {
    if (!bellAnchorRef.current || typeof window === "undefined") return;

    const rect = bellAnchorRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const panelWidth = Math.min(340, Math.max(260, viewportWidth - 24));
    const margin = 12;

    const preferredLeft = rect.right - panelWidth;
    const clampedLeft = Math.min(
      Math.max(margin, preferredLeft),
      Math.max(margin, viewportWidth - panelWidth - margin),
    );

    setNotificationsDropdownStyle({
      top: Math.round(rect.bottom + 8),
      left: Math.round(clampedLeft),
      width: panelWidth,
    });
  };

  const toggleNotifications = () => {
    setShowNotifications((prev) => !prev);
  };

  const closeNotifications = () => {
    setShowNotifications(false);
  };

  useEffect(() => {
    if (!showNotifications) return undefined;

    updateNotificationsDropdownPosition();

    const handleViewportChange = () => updateNotificationsDropdownPosition();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [showNotifications]);

  // This function returns the best available name for the user:
  // 1. First, try to get the first name from their profile (set during onboarding)
  // 2. If no profile name, fall back to the email prefix
  //
  // Examples:
  // - If profile has fullName "John Smith" → returns "John"
  // - If no profile but email is "john@example.com" → returns "john"

  const getUserDisplayName = () => {
    // Try to get name from user profile
    if (userProfile && userProfile.fullName) {
      // Get the first name (everything before the first space)
      const firstName = userProfile.fullName.split(" ")[0];

      // Capitalize the first letter (in case it was entered in lowercase)
      return (
        firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase()
      );
    }

    // Fall back to email prefix
    // If no profile name is available, use the part before @ in the email
    if (user && user.email) {
      const emailPrefix = user.email.split("@")[0];
      // Capitalize the first letter
      return emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
    }

    // Default fallback
    return "User";
  };

  // Get the display name to use throughout the component
  const displayName = getUserDisplayName(user, userProfile);

  // Add Water Function

  const addWater = (ml) => {
    const today = new Date().toISOString().split("T")[0];
    const glasses = Math.round(ml / 250);
    const fitnessRef = ref(database, `users/${user.uid}/fitness/${today}`);
    update(fitnessRef, { water: water + glasses });
  };

  // State for current time (updates every minute)
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // 60000ms = 1 minute
    return () => clearInterval(timer);
  }, []);

  // Helper function to get dose times for a medication
  const getDoseTimes = (frequency) => {
    const freq = frequency?.toLowerCase() || "";
    if (freq.includes("three times"))
      return ["morning", "afternoon", "evening"];
    else if (freq.includes("twice")) return ["morning", "evening"];
    else if (freq.includes("once") || freq.includes("daily")) return ["single"];
    else if (freq.includes("as needed")) return ["asneeded"];
    return ["single"];
  };

  // Function to find next upcoming medication
  const getNextMedication = () => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const upcomingDoses = [];

    medications.forEach((med) => {
      const doseTimes = getDoseTimes(med.frequency);
      doseTimes.forEach((slot) => {
        const doseKey = `${med.id}_${slot}`;

        // skip if already taken
        if (takenMeds[doseKey]) return;

        let scheduledTime;
        if (slot === "single" || slot === "asneeded") {
          scheduledTime = med.time || "08:00";
        } else {
          const defaultTimes = {
            morning: "08:00",
            afternoon: "14:00",
            evening: "18:00",
            night: "22:00",
          };
          scheduledTime = defaultTimes[slot] || "08:00";
        }

        const [hours, minutes] = scheduledTime.split(":").map(Number);
        const scheduledMinutes = hours * 60 + minutes;

        if (scheduledMinutes > currentMinutes) {
          upcomingDoses.push({
            medication: med,
            slot: slot,
            scheduledTime: scheduledTime,
            minutesUntil: scheduledMinutes - currentMinutes,
          });
        }
      });
    });

    upcomingDoses.sort((a, b) => a.minutesUntil - b.minutesUntil);
    return upcomingDoses.length > 0 ? upcomingDoses[0] : null;
  };

  // Format time remaining nicely
  const formatTimeRemaining = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
    else if (hours > 0) return `${hours}h`;
    else return `${mins}m`;
  };

  // Format time for display (e.g., "2:30 PM")
  const timeDisplay = (time) => {
    if (!time) return "";
    const [hours, minutes] = time.split(":");
    const hour = parseInt(hours);
    return `${hour > 12 ? hour - 12 : hour || 12}:${minutes} ${hour >= 12 ? "PM" : "AM"}`;
  };

  const nextMed = getNextMedication();

  //Calculate donut chart values

  // SVG circle circumference calculation
  // For a circle with radius 35, circumference = 2 * π * r = 2 * 3.14159 * 35 ≈ 220
  const radius = 35;
  const circumference = 2 * Math.PI * radius;

  // Calculate the length of each segment based on percentage
  const takenDashLength = (takenPercentage / 100) * circumference;
  const pendingDashLength = (pendingPercentage / 100) * circumference;

  // Starting position for pending segment (after taken segment)
  const pendingOffset = 55 - takenDashLength;

  // Render Dashboard UI

  // Render Dashboard UI

  return (
    <div className="page">
      {/* PAGE HEADER */}
      <div className="page-header-bar">
        <div>
          <h1 className="page-title-main">HealthCare Dashboard</h1>
          <p className="page-subtitle">
            {dateStr} • {timeStr}
          </p>
        </div>

        <div className="header-right">
          <span className="online-dot"></span>
          <span className="header-user">Logged in as {displayName}</span>

          {/* ═══ NOTIFICATIONS BELL BUTTON ═══ */}
          <div
            className="notifications-anchor"
            ref={bellAnchorRef}
            style={{ position: "relative" }}
          >
            <button
              className="bell-btn"
              title="Notifications"
              onClick={toggleNotifications}
              style={{
                position: "relative",
                background: showNotifications ? "#e0e7ff" : "transparent",
                borderRadius: 8,
              }}
            >
              🔔
              {/* Unread badge */}
              {unreadCount > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: -4,
                    right: -4,
                    background: "#ef4444",
                    color: "white",
                    fontSize: 10,
                    fontWeight: 700,
                    borderRadius: "50%",
                    minWidth: 18,
                    height: 18,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0 4px",
                    border: "2px solid white",
                  }}
                >
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {/* ═══ NOTIFICATIONS DROPDOWN ═══ */}
            {showNotifications && (
              <>
                {/* Backdrop to close dropdown when clicking outside */}
                <div
                  className="notifications-backdrop"
                  style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 998,
                  }}
                  onClick={closeNotifications}
                />

                {/* Dropdown panel */}
                <div
                  className="notifications-dropdown"
                  style={{
                    position: "fixed",
                    top: notificationsDropdownStyle.top ?? 80,
                    left: notificationsDropdownStyle.left ?? 12,
                    width: notificationsDropdownStyle.width ?? 340,
                    maxWidth: "calc(100vw - 24px)",
                    maxHeight: "70vh",
                    background: "white",
                    borderRadius: 16,
                    boxShadow: "0 10px 40px rgba(0, 0, 0, 0.2)",
                    zIndex: 10010,
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Dropdown Header */}
                  <div
                    style={{
                      padding: "16px 20px",
                      borderBottom: "1px solid #e2e8f0",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      background: "#f8fafc",
                    }}
                  >
                    <div>
                      <h3
                        style={{
                          margin: 0,
                          fontSize: 16,
                          fontWeight: 700,
                          color: "#1e293b",
                        }}
                      >
                        Notifications
                      </h3>
                      <p
                        style={{
                          margin: "4px 0 0",
                          fontSize: 12,
                          color: "#64748b",
                        }}
                      >
                        {unreadCount > 0
                          ? `${unreadCount} unread`
                          : "All caught up!"}
                      </p>
                    </div>

                    {/* Header actions */}
                    <div style={{ display: "flex", gap: 8 }}>
                      {unreadCount > 0 && (
                        <button
                          onClick={markAllNotificationsAsRead}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#2563eb",
                            fontSize: 12,
                            cursor: "pointer",
                            padding: "4px 8px",
                          }}
                          title="Mark all as read"
                        >
                          ✓ Mark all read
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Dropdown Content */}
                  <div
                    className="notifications-content"
                    style={{
                      flex: 1,
                      overflowY: "auto",
                      maxHeight: 360,
                    }}
                  >
                    {/* ─── UPCOMING REMINDERS SECTION ─── */}
                    {notifications.length > 0 && (
                      <div>
                        <div
                          style={{
                            padding: "12px 20px 8px",
                            fontSize: 11,
                            fontWeight: 600,
                            color: "#64748b",
                            textTransform: "uppercase",
                            letterSpacing: "0.5px",
                            background: "#f8fafc",
                          }}
                        >
                          📅 Upcoming Reminders
                        </div>

                        {notifications.slice(0, 5).map((reminder) => (
                          <div
                            key={reminder.id}
                            style={{
                              padding: "12px 20px",
                              borderBottom: "1px solid #f1f5f9",
                              display: "flex",
                              alignItems: "flex-start",
                              gap: 12,
                              transition: "background 0.2s",
                              cursor: "pointer",
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.background = "#f8fafc")
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.background = "white")
                            }
                          >
                            {/* Icon */}
                            <div
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: "50%",
                                background: "#dbeafe",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 18,
                                flexShrink: 0,
                              }}
                            >
                              {getNotificationIcon(reminder.type)}
                            </div>

                            {/* Content */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div
                                style={{
                                  fontSize: 14,
                                  fontWeight: 500,
                                  color: "#1e293b",
                                  marginBottom: 2,
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {reminder.title}
                              </div>
                              <div style={{ fontSize: 12, color: "#64748b" }}>
                                ⏰ {formatTime(reminder.time)} • Every day
                              </div>
                            </div>

                            {/* Status indicator */}
                            <div
                              style={{
                                background: reminder.enabled
                                  ? "#dcfce7"
                                  : "#f1f5f9",
                                color: reminder.enabled ? "#166534" : "#64748b",
                                fontSize: 10,
                                fontWeight: 600,
                                padding: "4px 8px",
                                borderRadius: 12,
                              }}
                            >
                              {reminder.enabled ? "Active" : "Paused"}
                            </div>
                          </div>
                        ))}

                        {notifications.length > 5 && (
                          <div
                            style={{
                              padding: "8px 20px",
                              fontSize: 12,
                              color: "#64748b",
                              textAlign: "center",
                              background: "#f8fafc",
                            }}
                          >
                            +{notifications.length - 5} more reminders
                          </div>
                        )}
                      </div>
                    )}

                    {/* ─── NOTIFICATION HISTORY SECTION ─── */}
                    {notificationHistory.length > 0 && (
                      <div>
                        <div
                          style={{
                            padding: "12px 20px 8px",
                            fontSize: 11,
                            fontWeight: 600,
                            color: "#64748b",
                            textTransform: "uppercase",
                            letterSpacing: "0.5px",
                            background: "#f8fafc",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <span>🕐 Recent Activity</span>
                          {notificationHistory.length > 0 && (
                            <button
                              onClick={clearAllNotifications}
                              style={{
                                background: "none",
                                border: "none",
                                color: "#ef4444",
                                fontSize: 11,
                                cursor: "pointer",
                                padding: 0,
                              }}
                            >
                              Clear all
                            </button>
                          )}
                        </div>

                        {notificationHistory
                          .slice(0, 10)
                          .map((notification) => (
                            <div
                              key={notification.id}
                              style={{
                                padding: "12px 20px",
                                borderBottom: "1px solid #f1f5f9",
                                display: "flex",
                                alignItems: "flex-start",
                                gap: 12,
                                background: notification.read
                                  ? "white"
                                  : "#eff6ff",
                                transition: "background 0.2s",
                                cursor: "pointer",
                              }}
                              onClick={() =>
                                markNotificationAsRead(notification.id)
                              }
                              onMouseEnter={(e) => {
                                if (notification.read) {
                                  e.currentTarget.style.background = "#f8fafc";
                                }
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background =
                                  notification.read ? "white" : "#eff6ff";
                              }}
                            >
                              {/* Icon */}
                              <div
                                style={{
                                  width: 36,
                                  height: 36,
                                  borderRadius: "50%",
                                  background: notification.read
                                    ? "#f1f5f9"
                                    : "#dbeafe",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: 18,
                                  flexShrink: 0,
                                }}
                              >
                                {getNotificationIcon(notification.type)}
                              </div>

                              {/* Content */}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div
                                  style={{
                                    fontSize: 14,
                                    fontWeight: notification.read ? 400 : 600,
                                    color: "#1e293b",
                                    marginBottom: 2,
                                  }}
                                >
                                  {notification.title}
                                </div>
                                <div style={{ fontSize: 12, color: "#64748b" }}>
                                  {formatNotificationDate(
                                    notification.triggeredAt,
                                  )}
                                </div>
                                {notification.message && (
                                  <div
                                    style={{
                                      fontSize: 12,
                                      color: "#64748b",
                                      marginTop: 4,
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                    }}
                                  >
                                    {notification.message}
                                  </div>
                                )}
                              </div>

                              {/* Unread indicator */}
                              {!notification.read && (
                                <div
                                  style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: "50%",
                                    background: "#2563eb",
                                    flexShrink: 0,
                                    marginTop: 6,
                                  }}
                                />
                              )}
                            </div>
                          ))}
                      </div>
                    )}

                    {/* ─── EMPTY STATE ─── */}
                    {notifications.length === 0 &&
                      notificationHistory.length === 0 && (
                        <div
                          style={{
                            padding: 40,
                            textAlign: "center",
                            color: "#64748b",
                          }}
                        >
                          <div style={{ fontSize: 48, marginBottom: 12 }}>
                            🔔
                          </div>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 500,
                              marginBottom: 4,
                            }}
                          >
                            No notifications yet
                          </div>
                          <div style={{ fontSize: 12 }}>
                            When you add medications, reminders will appear here
                          </div>
                        </div>
                      )}
                  </div>

                  {/* Dropdown Footer */}
                  <div
                    style={{
                      padding: "12px 20px",
                      borderTop: "1px solid #e2e8f0",
                      background: "#f8fafc",
                      textAlign: "center",
                    }}
                  >
                    <button
                      onClick={() => {
                        setActivePage("measurements-reminders");
                        closeNotifications();
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#2563eb",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                        padding: "4px 8px",
                      }}
                    >
                      View All Reminders →
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          <button className="logout-btn" onClick={() => signOut(auth)}>
            <span>↪</span> Logout
          </button>
        </div>
      </div>

      {/* WELCOME BANNER */}
      <div className="welcome-banner">
        <div>
          <h2>Welcome back, {displayName}!</h2>
          <p>Here's your health overview for today</p>
        </div>
      </div>
      {/* This banner appears when:
      The app is running on iOS (healthKitAvailable = true)
      The user hasn't connected Apple Health yet (healthKitAuthorized = false)
    
      It prompts the user to connect their Apple Health data */}
      {healthKitAvailable && !healthKitAuthorized && (
        <div
          style={{
            // Gradient background from pink to purple
            background: "linear-gradient(135deg, #ec4899, #8b5cf6)",
            borderRadius: 14,
            padding: "20px 24px",
            marginBottom: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            color: "white",
            flexWrap: "wrap", // Allow wrapping on small screens
            gap: 16,
          }}
        >
          {/* Left side: Icon and text */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontSize: 32 }}>❤️</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
                Connect Apple Health
              </div>
              <div style={{ fontSize: 13, opacity: 0.9 }}>
                Sync your steps, calories, and heart rate automatically
              </div>
            </div>
          </div>

          {/* Right side: Connect button */}
          <button
            onClick={requestHealthKitAuth} // Call the authorization function
            disabled={healthKitLoading} // Disable while loading
            style={{
              background: "white",
              color: "#8b5cf6",
              border: "none",
              borderRadius: 8,
              padding: "10px 20px",
              fontWeight: 600,
              cursor: healthKitLoading ? "not-allowed" : "pointer",
              opacity: healthKitLoading ? 0.7 : 1,
            }}
          >
            {healthKitLoading ? "Connecting..." : "Connect"}
          </button>
        </div>
      )}

      {/*    
    This banner appears when:
    Apple Health is successfully connected (healthKitAuthorized = true)
    It shows the user that their data is syncing and provides a refresh button */}
      {healthKitAuthorized && (
        <div
          style={{
            background: "#f0fdf4", // Light green background
            border: "2px solid #22c55e", // Green border
            borderRadius: 10,
            padding: "12px 16px",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          {/* Checkmark icon */}
          <span style={{ fontSize: 20 }}>✅</span>

          {/* Status text */}
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 600, color: "#166534" }}>
              Apple Health Connected
            </span>
            <span style={{ color: "#64748b", marginLeft: 8, fontSize: 13 }}>
              Steps & calories syncing automatically
            </span>
          </div>

          {/* Refresh button */}
          <button
            onClick={refreshHealthData} // Manually refresh data
            disabled={healthKitLoading} // Disable while loading
            style={{
              background: "#22c55e",
              color: "white",
              border: "none",
              borderRadius: 6,
              padding: "6px 12px",
              fontSize: 12,
              cursor: healthKitLoading ? "not-allowed" : "pointer",
              opacity: healthKitLoading ? 0.7 : 1,
            }}
          >
            {healthKitLoading ? "..." : "🔄 Refresh"}
          </button>
        </div>
      )}

      {/* NEXT MEDICATION TIMER */}
      {medications.length > 0 && nextMed && (
        <div className="next-med-banner">
          <div className="next-med-icon">⏰</div>
          <div className="next-med-content">
            <div className="next-med-label">NEXT MEDICATION</div>
            <div className="next-med-name">{nextMed.medication.name}</div>
            <div className="next-med-time">
              <span className="countdown">
                {formatTimeRemaining(nextMed.minutesUntil)}
              </span>
              <span className="scheduled-time">
                ({timeDisplay(nextMed.scheduledTime)})
              </span>
            </div>
          </div>
        </div>
      )}

      {medications.length > 0 && !nextMed && (
        <div className="next-med-banner all-done">
          <div className="next-med-icon">✅</div>
          <div className="next-med-content">
            <div className="next-med-label">ALL DONE!</div>
            <div className="next-med-message">
              No more medications scheduled for today
            </div>
          </div>
        </div>
      )}

      {/* STATS CARDS ROW */}
      <div className="stats-row">
        {[
          {
            icon: "💊",
            label: "Medications",
            value: medications.length,
            sub: "Active medications",
            color: "#eef2ff",
          },
          {
            icon: "🏋️",
            label: "Total Exercises",
            value: activities.length,
            sub: "This month",
            color: "#fff7ed",
          },
          {
            icon: "👟",
            label: "Steps Today",
            value: steps.toLocaleString() || "8,542",
            sub: healthData.isFromHealthKit
              ? "From Apple Health" // If using HealthKit data
              : "Goal: 10,000", // If using manual/Firebase data
            color: "#f0fdf4",
          },
          {
            icon: "✅",
            label: "Completion Rate",
            value: totalMeds > 0 ? `${Math.round(takenPercentage)}%` : "0%",
            sub: "Medication adherence",
            color: "#faf5ff",
          },
        ].map((stat, index) => (
          <div
            className="stat-card-dash"
            key={index}
            style={{ background: stat.color }}
          >
            <div className="stat-icon-circle">{stat.icon}</div>
            <div>
              <div className="stat-label-sm">{stat.label}</div>
              <div className="stat-value-lg">{stat.value}</div>
              <div className="stat-sub">{stat.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* WATER INTAKE TRACKER */}
      <div className="card-white">
        <h3 className="section-title">💧 Water Intake</h3>

        <div className="water-row">
          <span className="water-label">Today's Progress</span>
          <span className="water-amount">
            {waterMl}ml / {waterGoal}ml
          </span>
        </div>

        <div className="progress-bar-bg">
          <div
            className="progress-bar-fill"
            style={{ width: `${waterPct}%` }}
          ></div>
        </div>

        <div className="progress-pct">{waterPct}%</div>

        <div className="water-btns">
          {[250, 500, 750].map((ml) => (
            <button key={ml} className="water-btn" onClick={() => addWater(ml)}>
              + {ml}ml
            </button>
          ))}
        </div>
      </div>

      {/* CHARTS ROW (2 charts side by side) */}
      <div className="charts-row">
        {/* WEEKLY STEPS BAR CHART */}
        <div className="card-white chart-card">
          <h3 className="section-title">
            Weekly Steps
            {/* Show indicator if data is from Apple Health */}
            {healthData.isFromHealthKit && (
              <span
                style={{
                  fontSize: 11,
                  color: "#22c55e", // Green color
                  marginLeft: 8,
                  fontWeight: 500,
                }}
              >
                ● Apple Health
              </span>
            )}{" "}
          </h3>

          <div className="bar-chart">
            {chartSteps.map((stepCount, index) => (
              <div className="bar-col" key={index}>
                <div
                  className="bar-fill"
                  style={{ height: `${(stepCount / maxSteps) * 140}px` }}
                  title={`${stepCount.toLocaleString()} steps`}
                ></div>
                <div className="bar-label">{weekDays[index]}</div>
              </div>
            ))}
          </div>
        </div>
        {/* MEDICATION ADHERENCE DONUT CHART (SIMPLIFIED) */}
        <div className="card-white chart-card">
          <h3 className="section-title">Medication Adherence</h3>

          {/* SIMPLIFIED DONUT CHART */}
          <div
            className="donut-wrap"
            style={{ position: "relative" }}
            role="img"
            aria-label={`Medication adherence: ${takenCount} taken, ${pendingCount} pending out of ${totalMeds} total`}
          >
            <span className="sr-only">
              {takenCount} of {totalMeds} medications taken today (
              {Math.round(takenPercentage)}% complete)
            </span>
            <svg viewBox="0 0 100 100" className="donut-svg">
              {/* PENDING SEGMENT (ORANGE) - FULL BACKGROUND */}
              {/* This draws first as the background (full circle if all pending) */}
              <circle
                cx="50"
                cy="50"
                r="35"
                fill="none"
                stroke="#d97706"
                strokeWidth="12"
                onMouseEnter={() => setHoveredSegment("pending")}
                onMouseLeave={() => setHoveredSegment(null)}
                style={{
                  cursor: "pointer",
                  transition: "opacity 0.2s",
                  opacity: hoveredSegment === "pending" ? 0.8 : 1,
                }}
              />

              {/* TAKEN SEGMENT (GREEN) - OVERLAYS ON TOP */}
              {/* This draws on top, showing how much has been taken */}
              {/* Only shows if takenPercentage > 0 */}
              {takenPercentage > 0 && (
                <circle
                  cx="50"
                  cy="50"
                  r="35"
                  fill="none"
                  stroke="#0d9488"
                  strokeWidth="12"
                  strokeDasharray={`${(takenPercentage / 100) * 220} 220`}
                  strokeDashoffset="0"
                  transform="rotate(-90 50 50)"
                  onMouseEnter={() => setHoveredSegment("taken")}
                  onMouseLeave={() => setHoveredSegment(null)}
                  style={{
                    cursor: "pointer",
                    transition: "stroke-dasharray 0.3s ease, opacity 0.2s",
                    opacity: hoveredSegment === "taken" ? 0.8 : 1,
                  }}
                />
              )}
            </svg>

            {/* HOVER TOOLTIP */}
            {hoveredSegment && (
              <div className="donut-tooltip">
                {hoveredSegment === "taken" ? (
                  <>
                    <div className="tooltip-value">Taken: {takenCount}</div>
                  </>
                ) : (
                  <>
                    <div className="tooltip-value">Pending: {pendingCount}</div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* SIMPLIFIED LEGEND */}
          <div className="donut-legend">
            <span>
              <span className="legend-dot green"></span>
              Taken: {takenCount}
            </span>
            <span>
              <span className="legend-dot orange"></span>
              Pending: {pendingCount}
            </span>
          </div>
        </div>
        {/*
        A full orange circle represents all medications. A green overlay circle shows the portion taken,
        controlled by strokeDasharray and rotated −90° to start at the top. 
        The circle is always complete with no gaps: 0% = all orange, 50% = half green/orange,
        100% = all green. On hover, tooltips display taken or pending counts in the center.
        */}
      </div>

      {/* QUICK ACTIONS GRID */}
      <h3 className="section-title" style={{ marginTop: 24 }}>
        Quick Actions
      </h3>

      <div className="quick-actions">
        {[
          {
            icon: "💊",
            label: "My Medications",
            sub: "View and manage medications",
            page: "medications",
          },
          {
            icon: "📊",
            label: "Measurements",
            sub: "Track vital signs",
            page: "measurements",
          },
          {
            icon: "🏃",
            label: "Fitness Tracker",
            sub: "Track your exercises",
            page: "fitness",
          },
          {
            icon: "🤖",
            label: "Health Assistant",
            sub: "Get health advice",
            page: "chat",
          },
          {
            icon: "👤",
            label: "Health Profile",
            sub: "Your health information",
            page: "profile",
          },
          {
            icon: "🚨",
            label: "Emergency",
            sub: "Emergency contacts",
            page: "emergency",
          },
          {
            icon: "⚙️",
            label: "Settings",
            sub: "App preferences",
            page: "settings",
          },
        ].map((action, index) => (
          <button
            className="quick-action-card"
            key={index}
            onClick={() => setActivePage(action.page)}
          >
            <div className="qa-icon">{action.icon}</div>
            <div>
              <div className="qa-label">{action.label}</div>
              <div className="qa-sub">{action.sub}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// MEDICATIONS COMPONENT
// Page for viewing, adding, editing, and marking medications as taken
// Shows gradient cards for each medication with status tracking

function Medications({
  user,
  medications,
  setActivePage,
  voiceEnabled,
  setVoiceEnabled,
}) {
  // track current Time
  const [currentTime, setCurrentTime] = useState(new Date());

  // Modal visibility - controls whether the "Add Medication" modal is shown
  const [showModal, setShowModal] = useState(false);

  // Form fields for adding a new medication
  const [medName, setMedName] = useState(""); // e.g. "Aspirin"
  const [medDosage, setMedDosage] = useState(""); // e.g. "100mg"
  const [medFreq, setMedFreq] = useState("Once daily"); // How often to take it
  const [medTimeSlot, setMedTimeSlot] = useState("Morning"); // Morning/Afternoon/Evening/Night
  const [medTime, setMedTime] = useState("08:00"); // Specific time
  const [medNotes, setMedNotes] = useState(""); // Additional instructions

  // Track which medications have been marked as taken today
  // Structure: { medicationId: true/false }
  const [takenMeds, setTakenMeds] = useState({});

  // ID of medication currently being edited (null if none)
  const [editingId, setEditingId] = useState(null);

  // Get today's date for tracking which meds were taken
  const today = new Date().toISOString().split("T")[0];

  // Time Display Helper Function

  // Convert 24-hour time (e.g. "14:30") to 12-hour format (e.g. "2:30 PM")
  const timeDisplay = (time) => {
    // return empty if no time provided
    if (!time) return "";

    // Split time into hours and minutes
    const [hours, minutes] = time.split(":");
    const hour = parseInt(hours);

    // Convert to 12-hour format
    return `${hour > 12 ? hour - 12 : hour || 12}:${minutes} ${hour >= 12 ? "PM" : "AM"}`;
  };

  const getDoseTimes = (frequency) => {
    const freq = frequency?.toLowerCase() || "";

    if (freq.includes("three times")) {
      // Three times daily = Morning, Afternoon, Evening
      return ["morning", "afternoon", "evening"];
    } else if (freq.includes("twice")) {
      // Twice daily = Morning, Evening
      return ["morning", "evening"];
    } else if (freq.includes("once") || freq.includes("daily")) {
      // Once daily = Morning only
      // We use the time slot from the medication settings
      return ["single"];
    } else if (freq.includes("as needed")) {
      // As needed = Single button (user decides when to take)
      return ["asneeded"];
    }

    // Default: single dose
    return ["single"];
  };

  // Function to get display name for Time Slot

  const getTimeSlotLabel = (slot, medication) => {
    // Provide default if medication is undefined
    const defaultTimeSlot = medication?.timeSlot || "Morning";

    const labels = {
      morning: "Morning",
      afternoon: "Afternoon",
      evening: "Evening",
      night: "Night",
      asneeded: "As Needed",
      single: defaultTimeSlot,
    };

    // Return the label
    return labels[slot] || slot;
  };

  // Function to get time display for dose slot
  // Shows the scheduled time for each dose
  const getDoseTime = (slot, medication) => {
    if (!medication) {
      return "08:00 AM";
    }
    // For multi-dose medications, suggest default times
    const defaultTimes = {
      morning: "08:00 AM",
      afternoon: "02:00 PM",
      evening: "06:00 PM",
      night: "10:00 PM",
    };

    // For single-dose or as-needed, use the medication's stored time
    if (slot === "single" || slot === "asneeded") {
      // If a time doesn't exist, use a default
      if (!medication.time) {
        return "08:00 AM";
      }
      return timeDisplay(medication.time);
    }

    if (defaultTimes[slot]) {
      return defaultTimes[slot];
    }

    // Return suggested time for this slot
    return medication.time ? timeDisplay(medication.time) : "08:00 AM";
  };

  // Updates current time every minute
  useEffect(() => {
    // set up an interval that runs every 60 seconds
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    // clears interval
    return () => clearInterval(timer);
  }, []);

  // Load "Taken" Status Effect

  // Load which medications have been marked as taken today
  useEffect(() => {
    console.log("🔵 useEffect RUNNING - Loading takenMeds");
    console.log("User:", user);
    console.log("Today:", today); // ← What does this show?
    console.log("Expected path:", `users/${user?.uid}/takenMeds/${today}`);

    if (!user) {
      console.log("No user - existing");
      return;
    }

    // Reference to today's taken medications
    const takenRef = ref(database, `users/${user.uid}/takenMeds/${today}`);

    // Listen for changes
    const unsubscribe = onValue(takenRef, (snapshot) => {
      // If data exists, update our state
      if (snapshot.val()) {
        setTakenMeds(snapshot.val());
      } else {
        // No data for today yet - initialize empty object
        setTakenMeds({});
      }
    });

    return () => unsubscribe();
  }, [user, today]);

  // Add Medication Function

  // Function to add a new medication to Firebase
  const saveMedication = async () => {
    // Validate that required fields are filled in
    if (!medName || !medDosage) return;

    if (editingId) {
      // Update existing medication
      // Create reference to medications collection
      const medRef = ref(
        database,
        `users/${user.uid}/medications/${editingId}`,
      );
      // Update medication with all the form data
      await update(medRef, {
        name: medName,
        dosage: medDosage,
        frequency: medFreq,
        timeSlot: medTimeSlot,
        time: medTime,
        notes: medNotes,
        updatedAt: new Date().toISOString(), // tracks when last updated
      });

      speak(`${medName} has been updated successfully`, voiceEnabled);
    } else {
      // Create new medication
      const medsRef = ref(database, `users/${user.uid}/medications`);
      const newMedRef = await push(medsRef, {
        name: medName,
        dosage: medDosage,
        frequency: medFreq,
        timeSlot: medTimeSlot,
        time: medTime,
        notes: medNotes,
        createdAt: new Date().toISOString(),
      });

      // Auto-create reminders for this medication
      // Get the new medication's ID
      const newMedId = newMedRef.key;
      const remindersRef = ref(database, `users/${user.uid}/reminders`);

      const freq = medFreq.toLowerCase();
      let reminderTimes = [];

      if (freq.includes("three times")) {
        reminderTimes = [
          { label: "Morning", time: "08:00" },
          { label: "Afternoon", time: "14:00" },
          { label: "Evening", time: "18:00" },
        ];
      } else if (freq.includes("twice")) {
        // Twice daily: morning and evening
        reminderTimes = [
          { label: "Morning", time: "08:00" },
          { label: "Evening", time: "18:00" },
        ];
      } else if (freq.includes("as needed")) {
        // As needed: no automatic reminder (user decides when)
        reminderTimes = [];
      } else {
        // Once daily: use the time specified by user
        reminderTimes = [
          { label: medTimeSlot || "Daily", time: medTime || "08:00" },
        ];
      }

      // Create a reminder for each scheduled time
      for (const { label, time } of reminderTimes) {
        await push(remindersRef, {
          type: "medication",
          title: `Take ${medName} (${medDosage})`,
          time: time,
          days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], // Every day
          notes: medNotes || `${label} dose - ${medFreq}`,
          enabled: true,
          linkedMedicationId: newMedId, // Link to the medication for cleanup
          createdAt: new Date().toISOString(),
        });
      }

      speak(`${medName} has been added successfully`, voiceEnabled);
    }

    // reset form fields
    closeModal();
  };

  // Close modal and reset all form
  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setMedName("");
    setMedDosage("");
    setMedNotes("");
  };

  // Delete Medication Function

  // Function to delete a medication
  const deleteMed = async (id) => {
    // Remove from Firebase using the medication's unique ID
    await remove(ref(database, `users/${user.uid}/medications/${id}`));
    // Also delete linked reminders
    const remindersRef = ref(database, `users/${user.uid}/reminders`);
    const snapshot = await get(remindersRef);

    if (snapshot.val()) {
      const reminders = snapshot.val();
      for (const [reminderId, reminder] of Object.entries(reminders)) {
        if (reminder.linkedMedicationId === id) {
          await remove(
            ref(database, `users/${user.uid}/reminders/${reminderId}`),
          );
        }
      }
    }
  };

  // Mark as Taken Function

  // Function handles individual dose tracking for multi-dose medications
  // ═══ FUNCTION: Mark Medication Dose as Taken ═══
  // This function handles individual dose tracking for multi-dose medications
  // Parameters:
  //   - id: The medication's unique ID
  //   - timeSlot: Which dose (morning, afternoon, evening, single, or asneeded)
  const markTaken = async (id, timeSlot = "single") => {
    // STEP 1: Find the medication details
    // We need the medication object to get its name for voice announcement
    const medication = medications.find((m) => m.id === id);
    const medName = medication?.name || "Medication";

    // STEP 2: Create unique key for this specific dose
    // Format: medicationId_timeSlot (e.g., "abc123_morning")
    // This allows us to track each dose separately
    const doseKey = `${id}_${timeSlot}`;

    // STEP 3: Get current status and calculate new status
    // Check if this dose is currently marked as taken
    const currentlyTaken = takenMeds[doseKey] || false;
    // Toggle the status (true becomes false, false becomes true)
    const newStatus = !currentlyTaken;
    // STEP 4: Create updated taken meds object
    // We need to include ALL existing taken meds plus the new/updated one
    // Spread operator (...) copies all existing entries
    const newTakenMeds = {
      ...takenMeds, // Copy all existing taken medications
      [doseKey]: newStatus, // Add or update this specific dose
    };
    // Create firebase reference to Today's data
    const takenRef = ref(database, `users/${user.uid}/takenMeds/${today}`);

    try {
      // STEP 6: Write entire object to Firebase
      // Using set() instead of update() ensures the date path is created
      // Reference to today's taken medications in Firebase
      await set(takenRef, newTakenMeds);

      // STEP 7: Update local state immediately
      // This makes the UI update without waiting for Firebase callback
      setTakenMeds(newTakenMeds);

      // STEP 8: Voice announcement
      // Get the user-friendly label for this time slot
      const timeSlotName = getTimeSlotLabel(timeSlot, medication);

      if (newStatus) {
        // Medication was just marked as taken
        speak(
          `${medName} ${timeSlot !== "single" && timeSlot !== "asneeded" ? timeSlotName + " dose" : ""} has been marked as successfully taken`,
          voiceEnabled,
        );
      } else {
        // Medication was just unmarked
        speak(
          `${medName} ${timeSlot !== "single" && timeSlot !== "asneeded" ? timeSlotName + " dose" : ""} has been unmarked`,
          voiceEnabled,
        );
      }
    } catch (error) {
      // STEP 9: Error handling
      // If anything fails, show an alert to the user
      console.error("Error updating medication:", error);
      alert("Failed to update medication: " + error.message);
    }
  };

  // Read medication details aloud
  const readMedicationDetails = (med) => {
    if (!voiceEnabled) {
      alert("Voice is currently OFF. Please turn it ON.");
      return;
    }

    // Start with medication name
    let message = `${med.name}. `;

    if (med.dosage) {
      message += `Dosage: ${med.dosage}. `;
    }

    // Add frequency
    message += `Frequency: ${med.frequency || `Once daily`}. `;

    // Add time information
    if (med.time) {
      message += `Scheduled for ${timeDisplay(med.time)}. `;
    }

    // Add notes if available
    if (med.notes) {
      message += `Special instructions: ${med.notes}. `;
    }

    // Tell user if all doses have been taken today
    const doseTimes = getDoseTimes(med.frequency);
    const allDosesTaken = doseTimes.every((slot) => {
      const doseKey = `${med.id}_${slot}`;
      return takenMeds[doseKey];
    });

    if (allDosesTaken) {
      message += "All doses completed for today.";
    } else {
      // count how many are left
      const remainingDoses = doseTimes.filter((slot) => {
        const doseKey = `${med.id}_${slot}`;
        return !takenMeds[doseKey];
      }).length;

      message += `${remainingDoses} dose${remainingDoses > 1 ? "s" : ""} remaining for today.`;
    }

    speak(message, voiceEnabled);
  };

  const startEditing = (med) => {
    // fill all form fields with the medication's existing values
    setMedName(med.name || "");
    setMedDosage(med.dosage || "");
    setMedFreq(med.frequency || "Once daily");
    setMedTimeSlot(med.timeSlot || "Morning");
    setMedTime(med.time || "08:00");
    setMedNotes(med.notes || "");
    setEditingId(med.id);
    setShowModal(true);
  };

  // Find next upcoming medication dose
  const getNextMedication = () => {
    // get current time in minutes since midnight
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    console.log("Current time (minutes):", currentMinutes);
    console.log("Total medications:", medications.length);

    const upcomingDoses = [];
    // Loop through each medication
    medications.forEach((med) => {
      // get dose times for this med
      const doseTimes = getDoseTimes(med.frequency);

      // Loop through each dose time
      doseTimes.forEach((slot) => {
        // Create the unique key for this dose
        const doseKey = `${med.id}_${slot}`;

        // Skip if dose already taken
        if (takenMeds[doseKey]) {
          return; // move to next dose
        }

        // Get scheduled time for this dose
        let scheduledTime;

        if (slot === "single" || slot === "asneeded") {
          // Use medication's stored time
          scheduledTime = med.time || "08:00";
        } else {
          // Use default time for this slot
          const defaultTimes = {
            morning: "08:00",
            afternoon: "14:00",
            evening: "18:00",
            night: "22:00",
          };
          scheduledTime = defaultTimes[slot] || "08:00";
        }

        // convert to mins
        const [hours, minutes] = scheduledTime.split(":").map(Number);
        const scheduledMinutes = hours * 60 + minutes;

        console.log(` ${slot} at ${scheduledTime} (${scheduledMinutes} mins)`);

        // Only include doses that are in the future
        if (scheduledMinutes > currentMinutes) {
          upcomingDoses.push({
            medication: med,
            slot: slot,
            scheduledTime: scheduledTime,
            scheduledMinutes: scheduledMinutes,
            minutesUntil: scheduledMinutes - currentMinutes,
          });
        }
      });
    });
    // Sort by time (earliest first)
    upcomingDoses.sort((a, b) => a.minutesUntil - b.minutesUntil);

    // Return the next upcoming dose or null if none
    return upcomingDoses.length > 0 ? upcomingDoses[0] : null;
  };

  const formatTimeRemaining = (minutes) => {
    // Calculate hours and remaining minutes
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    // The display
    if (hours > 0 && mins > 0) {
      // Show both hours and minutes
      return `${hours}h ${mins}m`;
    } else if (hours > 0) {
      // Show only hours
      return `${hours}h`;
    } else {
      // Show just minutes
      return `${minutes}m`;
    }
  };

  // Calculate Progress Statistics

  // Calculate total number of doses required today
  let totalDosesRequired = 0;
  medications.forEach((med) => {
    const doseTimes = getDoseTimes(med.frequency);
    totalDosesRequired += doseTimes.length; // Add number of doses for this med to total
  });

  // Calculate how many doses have been taken
  let dosesTaken = 0;
  medications.forEach((med) => {
    const doseTimes = getDoseTimes(med.frequency);

    // Check each dose time for this medication
    doseTimes.forEach((slot) => {
      const doseKey = `${med.id}_${slot}`;
      if (takenMeds[doseKey]) {
        dosesTaken++; // Count this dose as taken
      }
    });
  });

  // Calculate percentage
  const pct =
    totalDosesRequired > 0
      ? Math.min(100, Math.round((dosesTaken / totalDosesRequired) * 100))
      : 0;

  // Gets next med info. Will be null if no upcoming doses, or an object with dose info
  const nextMed = getNextMedication();

  // Render Medications UI

  return (
    <div className="page">
      {/* PAGE HEADER */}
      <div className="page-header-bar">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Back button to return to dashboard */}
          <button
            className="back-btn"
            onClick={() => setActivePage("dashboard")}
          >
            ← Back to Dashboard
          </button>
          <div>
            <h1 className="page-title-main">💊 My Medications</h1>
          </div>
        </div>

        {/* Right side: Voice button, username, avatar */}
        <div className="header-right">
          {/*<button className="voice-btn">🔊 Voice ON</button>*/}
          {/* Voice Toggle Button - lets users turn voice on/off */}
          <button
            className="voice-btn"
            onClick={() => {
              // Toggle voice state
              const newVoiceState = !voiceEnabled;
              setVoiceEnabled(newVoiceState);

              // IMMEDIATELY STOP ANY PLAYING SPEECH
              if (!newVoiceState) {
                // If turning voice OFF, immediately stop all speech
                window.speechSynthesis.cancel();
              }

              // Announce the change (only if turning ON)
              if (newVoiceState) {
                speak("Voice assistance enabled", newVoiceState);
              }
            }}
          >
            🔊 Voice {voiceEnabled ? "ON" : "OFF"}
          </button>

          <span className="header-user">{user.email.split("@")[0]}</span>

          {/* Avatar circle with first letter of email */}
          <div className="avatar-circle">{user.email[0].toUpperCase()}</div>
        </div>
      </div>
      {/* PROGRESS BANNER showing today's medication adherence */}
      <div className="progress-banner">
        {/* Left side showing Progress bar */}
        <div>
          <h3>Today's Progress</h3>
          {/* Show doses taken vs total doses */}
          <p>
            {dosesTaken} of {totalDosesRequired} doses taken
          </p>

          {/* Progress bar */}
          <div className="banner-progress-bar">
            <div
              className="banner-progress-fill"
              style={{ width: `${pct}%` }}
            ></div>
          </div>
        </div>

        {/* Middle showing next medication timer*/}
        {medications.length > 0 && (
          <div className="next-med-timer">
            {/* Icon changes based on status */}
            <div className="timer-icon">
              {dosesTaken === totalDosesRequired ? "✅" : "⏰"}
            </div>

            {/* Timer content */}
            <div className="timer-content">
              {dosesTaken === totalDosesRequired ? (
                // ALL COMPLETE
                <>
                  <div className="timer-label">ALL DONE!</div>
                  <div className="timer-message">
                    All doses completed for today
                  </div>
                </>
              ) : (
                // PENDING DOSES
                <>
                  <div className="timer-label">PENDING DOSES</div>
                  <div className="timer-med-name">
                    {totalDosesRequired - dosesTaken} dose
                    {totalDosesRequired - dosesTaken > 1 ? "s" : ""} remaining
                  </div>

                  {/* SHOW NEXT MEDICATION IF AVAILABLE */}
                  {nextMed && (
                    <div className="timer-next-med">
                      <span className="next-med-label">Next:</span>
                      <span className="next-med-name">
                        {nextMed.medication.name}
                      </span>
                      <span className="next-med-time">
                        in {formatTimeRemaining(nextMed.minutesUntil)}
                      </span>
                      <span className="next-med-scheduled">
                        ({timeDisplay(nextMed.scheduledTime)})
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Right side shows percentage display */}
        <div className="banner-pct">
          {pct}%<br />
          <span>Complete</span>
        </div>
      </div>
      {/* MEDICATION SCHEDULE HEADER with Add button */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          margin: "24px 0 16px",
        }}
      >
        <h2 className="section-title-lg">Medication Schedule</h2>

        {/* Button to open the Add Medication modal */}
        <button className="add-med-btn" onClick={() => setShowModal(true)}>
          + Add Medication
        </button>
      </div>
      {/* MEDICATIONS LIST */}
      {medications.length === 0 ? (
        // Show empty state if no medications
        <div className="empty-state">
          <div style={{ fontSize: 56 }}>💊</div>
          <p>No medications yet. Add your first one!</p>
        </div>
      ) : (
        // Grid of medication cards
        <div className="med-cards-grid">
          {medications.map((med) => {
            // Get all dose times for this medication
            const doseTimes = getDoseTimes(med.frequency);

            // Check if all doses taken
            const allDosesTaken = doseTimes.every((slot) => {
              const doseKey = `${med.id}_${slot}`;
              return takenMeds[doseKey];
            });

            return (
              <div className="med-card" key={med.id}>
                {/* Card Header with gradient background */}
                <div className="med-card-header">
                  <span className="med-card-icon">💊</span>
                  <span className="med-card-name">{med.name}</span>
                </div>

                {/* Card Body with medication details */}
                <div className="med-card-body">
                  {/* Details row showing frequency, time, and status */}
                  <div className="med-detail-row">
                    {/* Frequency column */}
                    <div className="med-detail">
                      <span className="med-detail-label">FREQUENCY</span>
                      <span className="med-detail-value">
                        {med.frequency || "Once daily"}
                      </span>
                    </div>

                    {/* Doses per day */}
                    <div className="med-detail">
                      <span className="med-detail-label">DOSES</span>
                      <span className="med-detail-value blue">
                        {doseTimes.length}x
                      </span>
                    </div>

                    {/* Status column */}
                    <div className="med-detail">
                      <span className="med-detail-label">STATUS</span>
                      <span
                        className={`med-status ${allDosesTaken ? "taken" : "pending"}`}
                        role="status"
                        aria-label={
                          allDosesTaken ? "All doses taken" : "Doses pending"
                        }
                      >
                        {allDosesTaken ? "✓ Taken" : "⏳ Pending"}
                      </span>
                    </div>
                  </div>

                  {/* DOSE BUTTONS SECTION */}
                  {/* Show individual button for each dose time */}
                  <div className="dose-buttons-container">
                    {doseTimes.map((slot) => {
                      // Create unique key for this dose
                      const doseKey = `${med.id}_${slot}`;

                      // Check if this specific dose is taken
                      const doseTaken = takenMeds[doseKey];

                      console.log(
                        "Checking:",
                        doseKey,
                        "→",
                        doseTaken,
                        "in",
                        takenMeds,
                      );

                      return (
                        <div key={slot} className="dose-button-wrapper">
                          {/* TIME SLOT LABEL */}
                          {/* Only show label if multiple doses per day */}
                          {doseTimes.length > 1 && (
                            <div className="dose-time-label">
                              {getTimeSlotLabel(slot, med)}
                              <span className="dose-time-hint">
                                {getDoseTime(slot, med)}
                              </span>
                            </div>
                          )}

                          {/* MARK AS TAKEN BUTTON */}
                          <button
                            className={`mark-taken-btn ${doseTaken ? "already-taken" : ""} ${doseTimes.length > 1 ? "dose-btn" : ""}`}
                            onClick={() => markTaken(med.id, slot)}
                          >
                            {doseTaken ? "Taken" : "✓ Mark as Taken"}
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Action Buttons Row */}
                  <div
                    className="med-card-actions"
                    style={{
                      marginTop: 12,
                      borderTop: "1px solid #f1f5f9",
                      paddingTop: 12,
                    }}
                  >
                    {/* Voice, Edit, Delete buttons */}
                    <button
                      className="med-icon-btn purple"
                      onClick={() => readMedicationDetails(med)}
                      title="Read medication details aloud"
                    >
                      🔊
                    </button>
                    <button
                      className="med-icon-btn blue"
                      onClick={() => startEditing(med)}
                      title="Edit medication"
                    >
                      ✏️
                    </button>
                    <button
                      className="med-icon-btn red"
                      onClick={() => deleteMed(med.id)}
                      title="Delete medication"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {/* ADD MEDICATION MODAL */}
      {showModal && (
        // Modal overlay - clicking it closes the modal
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          {/* Modal content - stop propagation to prevent closing when clicking inside */}
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="modal-header">
              <div>
                {/* Show edit or add based on whether editing */}
                <h2>{editingId ? "Edit Medication" : "Add Medication"}</h2>
                <p className="modal-subtitle">
                  {editingId
                    ? "Update medication details"
                    : "Add a new medication to track"}
                </p>
              </div>
              {/* Close button */}
              <button
                className="modal-close"
                onClick={() => setShowModal(false)}
              >
                ✕
              </button>
            </div>

            {/* Modal Body with form fields */}
            <div className="modal-body">
              {/* Medication name input */}
              <label className="form-label">Medication Name *</label>
              <input
                className="form-input"
                placeholder="e.g., Aspirin"
                value={medName}
                onChange={(e) => setMedName(e.target.value)}
              />

              {/* Dosage and Frequency row */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Dosage *</label>
                  <input
                    className="form-input"
                    placeholder="e.g., 100mg"
                    value={medDosage}
                    onChange={(e) => setMedDosage(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Frequency</label>
                  <select
                    className="form-input"
                    value={medFreq}
                    onChange={(e) => setMedFreq(e.target.value)}
                  >
                    {[
                      "Once daily",
                      "Twice daily",
                      "Three times daily",
                      "As needed",
                    ].map((freq) => (
                      <option key={freq}>{freq}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Time Slot and Time row */}
              <div className="form-row">
                {/* Hide this field if frequency is more than once daily */}
                {!medFreq.toLowerCase().includes("twice") &&
                  !medFreq.toLowerCase().includes("three") && (
                    <div className="form-group">
                      <label className="form-label">Time Slot</label>
                      <select
                        className="form-input"
                        value={medTimeSlot}
                        onChange={(e) => setMedTimeSlot(e.target.value)}
                      >
                        {[
                          "🌅 Morning",
                          "☀️ Afternoon",
                          "🌙 Evening",
                          "🌛 Night",
                        ].map((slot) => (
                          <option key={slot}>{slot}</option>
                        ))}
                      </select>
                    </div>
                  )}

                {/* Time inputs */}
                {medFreq.toLowerCase().includes("twice") ? (
                  // 2 time inputs
                  <>
                    <div className="form-group">
                      <label className="form-label">Morning Time</label>
                      <input
                        type="time"
                        className="form-input"
                        defaultValue="08:00"
                        placeholder="e.g., 08:00"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Evening Time</label>
                      <input
                        type="time"
                        className="form-input"
                        defaultValue="18:00"
                        placeholder="e.g., 18:00"
                      />
                    </div>
                  </>
                ) : medFreq.toLowerCase().includes("three") ? (
                  // 3 time inputs
                  <>
                    <div className="form-group">
                      <label className="form-label">Morning Time</label>
                      <input
                        type="time"
                        className="form-input"
                        defaultValue="08:00"
                        placeholder="e.g., 08:00"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Afternoon Time</label>
                      <input
                        type="time"
                        className="form-input"
                        defaultValue="14:00"
                        placeholder="e.g., 14:00"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Evening Time</label>
                      <input
                        type="time"
                        className="form-input"
                        defaultValue="18:00"
                        placeholder="e.g., 18:00"
                      />
                    </div>
                  </>
                ) : (
                  <div className="form-group">
                    <label className="form-label">Time</label>
                    <input
                      type="time"
                      className="form-input"
                      value={medTime}
                      onChange={(e) => setMedTime(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {/* Notes textarea */}
              <label className="form-label">Notes</label>
              <textarea
                className="form-input form-textarea"
                placeholder="Additional instructions..."
                value={medNotes}
                onChange={(e) => setMedNotes(e.target.value)}
              />
            </div>

            {/* Modal Footer with buttons */}
            <div className="modal-footer">
              <button className="modal-cancel" onClick={closeModal}>
                Cancel
              </button>
              <button className="modal-submit" onClick={saveMedication}>
                {" "}
                {editingId ? "Update Medication" : "Add Medication"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// FITNESS TRACKER COMPONENT
// Page for tracking exercises and viewing fitness statistics
// Shows workout cards, summary stats, and step counter

function FitnessPage({ user, userProfile, setActivePage, voiceEnabled }) {
  // fitness - stores today's fitness data
  const [fitness, setFitness] = useState({
    steps: 0,
    water: 0,
    activities: [],
  });

  // Controls whether the "Add Exercise" form is visible for custom exercises
  const [showAddExercise, setShowAddExercise] = useState(false);

  // Controls whether the exercise template modal is visible
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  // Currently selected exercise category (e.g., "chair", "bed")
  const [selectedCategory, setSelectedCategory] = useState(null);

  // Currently selected exercise for viewing details before logging
  const [selectedExercise, setSelectedExercise] = useState(null);

  // Form fields for adding a new workout
  const [workoutType, setWorkoutType] = useState("");
  const [workoutCalories, setWorkoutCalories] = useState("");
  const [workoutIntensity, setWorkoutIntensity] = useState("moderate");
  const [workoutNotes, setWorkoutNotes] = useState("");
  const [workoutName, setWorkoutName] = useState("");
  const [workoutCount, setWorkoutCount] = useState(""); // Number of reps/steps
  const [workoutDuration, setWorkoutDuration] = useState(""); // Minutes

  // Get display name (add this near the top of the function)
  const getUserDisplayName = () => {
    if (userProfile && userProfile.fullName) {
      const firstName = userProfile.fullName.split(" ")[0];
      return (
        firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase()
      );
    }
    if (user && user.email) {
      const emailPrefix = user.email.split("@")[0];
      return emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
    }
    return "User";
  };

  const displayName = getUserDisplayName(user, userProfile);

  // Speak function uses browser's speech synthesis to read text aloud
  const speak = (text, enabled = true) => {
    // Only speak if voice is enabled and speech synthesis is available
    if (!enabled || !window.speechSynthesis) return;

    // Cancel any currently speaking text
    window.speechSynthesis.cancel();

    // Create new utterance
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9; // Slightly slower for clarity
    utterance.pitch = 1.0;
    utterance.lang = "en-GB";

    // Speak the text
    window.speechSynthesis.speak(utterance);
  };

  // Get today's date
  const today = new Date().toISOString().split("T")[0];

  // Get username for display
  const userName = user.email.split("@")[0];

  // EXERCISE TEMPLATES DATA
  // Accessibility-focused exercises organized by category
  const exerciseCategories = [
    {
      // ─── CHAIR EXERCISES ───
      // For users who sit most of the day or have limited mobility
      id: "chair",
      name: "Chair Exercises",
      icon: "🪑",
      description: "For users who sit most of the day or have limited mobility",
      color: "#dbeafe",
      exercises: [
        {
          id: "seated-arm-raises",
          name: "Seated Arm Raises",
          duration: "1–2 minutes",
          durationMins: 2,
          benefits: "Shoulder mobility, circulation",
          instructions:
            "Sit comfortably. Slowly raise both arms forward or overhead. Lower them gently. Repeat at your own pace.",
          accessibilityNotes: [
            "One arm option available",
            "No weights required",
          ],
          icon: "🙆",
        },
        {
          id: "seated-leg-lifts",
          name: "Seated Leg Lifts",
          duration: "1–2 minutes",
          durationMins: 2,
          benefits: "Leg strength, blood flow",
          instructions:
            "While seated, lift one foot slightly off the floor. Hold for a moment, then lower. Switch legs.",
          accessibilityNotes: [
            "Can be done one leg at a time",
            "Adjust height to comfort",
          ],
          icon: "🦵",
        },
        {
          id: "seated-torso-twist",
          name: "Seated Torso Twist",
          duration: "1 minute",
          durationMins: 1,
          benefits: "Spine mobility",
          instructions:
            "Sit tall. Gently turn your upper body to one side. Return to center. Switch sides.",
          accessibilityNotes: [
            "Keep movements slow and controlled",
            "Stop if any discomfort",
          ],
          icon: "🔄",
        },
        {
          id: "chair-marching",
          name: "Chair Marching",
          duration: "2 minutes",
          durationMins: 2,
          benefits: "Light cardio, circulation",
          instructions:
            "While seated, lift one knee at a time as if marching slowly.",
          accessibilityNotes: [
            "Adjust pace to comfort",
            "Hold armrests for support",
          ],
          icon: "🚶",
        },
      ],
    },
    {
      // ─── BED EXERCISES ───
      // Perfect for mornings, evenings, or fatigue days
      id: "bed",
      name: "Bed Exercises",
      icon: "🛏️",
      description: "Perfect for mornings, evenings, or fatigue days",
      color: "#fae8ff",
      exercises: [
        {
          id: "ankle-pumps",
          name: "Ankle Pumps",
          duration: "1 minute",
          durationMins: 1,
          benefits: "Circulation, swelling prevention",
          instructions: "While lying down, gently flex your feet up and down.",
          accessibilityNotes: [
            "Great for preventing blood clots",
            "Can be done any time",
          ],
          icon: "🦶",
        },
        {
          id: "knee-bends",
          name: "Knee Bends",
          duration: "2 minutes",
          durationMins: 2,
          benefits: "Joint mobility",
          instructions:
            "Slide one heel toward your body, bending the knee. Slide it back. Switch legs.",
          accessibilityNotes: ["Move slowly", "Keep back flat on bed"],
          icon: "🦿",
        },
        {
          id: "arm-stretch-lying",
          name: "Arm Stretch (Lying Down)",
          duration: "1 minute",
          durationMins: 1,
          benefits: "Shoulder comfort",
          instructions:
            "Raise one arm toward the ceiling and gently stretch. Switch arms.",
          accessibilityNotes: ["One arm at a time", "No need to fully extend"],
          icon: "💪",
        },
      ],
    },
    {
      // ─── LIGHT STANDING EXERCISES ───
      // For users who can stand with or without support
      id: "standing",
      name: "Light Standing Exercises",
      icon: "🚶",
      description: "For users who can stand with or without support",
      color: "#dcfce7",
      exercises: [
        {
          id: "marching-in-place",
          name: "Marching in Place",
          duration: "2–3 minutes",
          durationMins: 3,
          benefits: "Cardio, balance",
          instructions:
            "Stand tall and gently lift one knee at a time. Hold onto a chair if needed.",
          accessibilityNotes: [
            "Use chair for support",
            "Adjust pace as needed",
          ],
          icon: "🏃",
        },
        {
          id: "calf-raises",
          name: "Calf Raises",
          duration: "1–2 minutes",
          durationMins: 2,
          benefits: "Lower-leg strength",
          instructions:
            "Hold onto something sturdy. Slowly rise onto your toes, then lower.",
          accessibilityNotes: [
            "Always hold support",
            "Small movements are fine",
          ],
          icon: "🦶",
        },
        {
          id: "side-leg-raises",
          name: "Side Leg Raises",
          duration: "2 minutes",
          durationMins: 2,
          benefits: "Hip strength, balance",
          instructions:
            "Stand holding support. Lift one leg slightly to the side. Lower and switch.",
          accessibilityNotes: [
            "Hold chair or wall",
            "Small lifts are effective",
          ],
          icon: "🦵",
        },
      ],
    },
    {
      // ─── BALANCE & STABILITY ───
      // Fall-prevention focused exercises
      id: "balance",
      name: "Balance & Stability",
      icon: "🧍",
      description: "Fall-prevention focused exercises",
      color: "#fef3c7",
      exercises: [
        {
          id: "single-leg-balance",
          name: "Single-Leg Balance (Supported)",
          duration: "30–60 seconds per side",
          durationMins: 2,
          benefits: "Balance confidence",
          instructions:
            "Hold a chair. Lift one foot slightly off the ground. Switch.",
          accessibilityNotes: ["Always use support", "Even small lifts help"],
          icon: "🦩",
        },
        {
          id: "heel-to-toe-stand",
          name: "Heel-to-Toe Stand",
          duration: "1 minute",
          durationMins: 1,
          benefits: "Stability",
          instructions:
            "Place one foot directly in front of the other. Hold. Switch feet.",
          accessibilityNotes: [
            "Stand near wall for safety",
            "Focus on a fixed point",
          ],
          icon: "👣",
        },
      ],
    },
    {
      // ─── STRETCHING & RELAXATION ───
      // Great after medication reminders or before sleep
      id: "stretching",
      name: "Stretching & Relaxation",
      icon: "🧘",
      description: "Great after medication reminders or before sleep",
      color: "#e0e7ff",
      exercises: [
        {
          id: "neck-stretch",
          name: "Neck Stretch",
          duration: "1 minute",
          durationMins: 1,
          benefits: "Tension relief",
          instructions:
            "Gently tilt your head to one side. Hold briefly. Switch.",
          accessibilityNotes: [
            "Very gentle movements",
            "Never force the stretch",
          ],
          icon: "🙆",
        },
        {
          id: "shoulder-rolls",
          name: "Shoulder Rolls",
          duration: "1 minute",
          durationMins: 1,
          benefits: "Upper-body relaxation",
          instructions: "Slowly roll your shoulders forward, then backward.",
          accessibilityNotes: [
            "Can be done seated or standing",
            "Great for desk breaks",
          ],
          icon: "🔄",
        },
        {
          id: "guided-breathing",
          name: "Guided Breathing",
          duration: "2 minutes",
          durationMins: 2,
          benefits: "Stress reduction",
          instructions:
            "Breathe in slowly through your nose. Breathe out gently through your mouth.",
          accessibilityNotes: [
            "Can be done anywhere",
            "Focus on slow, steady breaths",
          ],
          icon: "🌬️",
        },
      ],
    },
  ];

  // Load Fitness Data Effect

  // Load today's fitness data from Firebase when component mounts
  useEffect(() => {
    if (!user) return;

    // Reference to today's fitness data
    const fitnessRef = ref(database, `users/${user.uid}/fitness/${today}`);

    // Listen for changes and update state
    const unsubscribe = onValue(fitnessRef, (snapshot) => {
      if (snapshot.val()) setFitness(snapshot.val());
    });
    return () => unsubscribe();
  }, [user, today]);

  // Calculate Statistics

  // Get activities array, default to empty if not available
  const activities = fitness.activities || [];

  // Get steps count
  const steps = fitness.steps || 0;

  // Calculate total minutes of all activities
  const totalMins = activities.reduce(
    (sum, activity) => sum + (activity.duration || 0),
    0,
  );

  // Calculate total steps from activities + manual step count
  const totalSteps =
    activities.reduce((sum, activity) => sum + (activity.count || 0), 0) +
    steps;

  // Estimate calories burned (5.5 cal per minute is approximate)
  const calories = Math.round(totalMins * 5.5);

  // Add Workout Function

  // Function to add a new workout/activity
  const addWorkout = async () => {
    // Validate that workout name is provided
    if (!workoutType.trim() || !workoutDuration) {
      alert("Please enter exercise type and duration");
      return;
    }
    let calculatedCalories = workoutCalories;

    if (!workoutCalories || workoutCalories === "") {
      const duration = parseInt(workoutDuration) || 0;
      const calorieRates = {
        light: 3,
        moderate: 5.5,
        vigorous: 9,
      };
      const rate = calorieRates[workoutIntensity] || 5.5;
      calculatedCalories = Math.round(duration * rate);
    }

    // Create the exercise object
    const newActivity = {
      type: workoutType.trim(),
      duration: parseInt(workoutDuration) || 0,
      calories: parseInt(calculatedCalories) || 0,
      intensity: workoutIntensity,
      notes: workoutNotes.trim(),
      timestamp: new Date().toISOString(),
      isCustom: true,
    };

    try {
      const today = new Date().toISOString().split("T")[0];
      // Reference to today's fitness data
      const fitnessRef = ref(database, `users/${user.uid}/fitness/${today}`);
      // Get current activities
      const snapshot = await get(fitnessRef);
      const currentData = snapshot.val() || {};
      const currentActivities = currentData.activities || [];

      // Add new activity to the array
      await update(fitnessRef, {
        activities: [...currentActivities, newActivity],
      });

      // Voice announcement
      speak(
        `${workoutType} logged. ${calculatedCalories} calories burned.`,
        voiceEnabled,
      );

      // Reset form fields
      setWorkoutType("");
      setWorkoutDuration("");
      setWorkoutCalories("");
      setWorkoutIntensity("moderate");
      setWorkoutNotes("");
      setShowAddExercise(false); // Close the form after adding
    } catch (error) {
      console.error("Error adding exercise:", error);
      alert("Failed to add exercise. Please try again.");
    }
  };

  // ADD TEMPLATE EXERCISE FUNCTION
  // For when users select an exercise from the templates

  const addTemplateExercise = async (exercise, category) => {
    // Reference to today's fitness data
    const fitnessRef = ref(database, `users/${user.uid}/fitness/${today}`);

    // Create new activity object from the template
    const newActivity = {
      type: exercise.name,
      category: category.name,
      categoryIcon: category.icon,
      exerciseIcon: exercise.icon,
      count: 0, // Templates don't have a count
      duration: exercise.durationMins,
      benefits: exercise.benefits,
      timestamp: new Date().toISOString(),
      isTemplate: true, // Flag to indicate this came from a template
    };

    // Add to existing activities array
    const newActivities = [...activities, newActivity];

    // Update Firebase
    await update(fitnessRef, { activities: newActivities });

    // Voice announcement
    if (voiceEnabled) {
      speak(`${exercise.name} has been logged. Great job!`, true);
    }

    // Close all modals
    setSelectedExercise(null);
    setSelectedCategory(null);
    setShowTemplateModal(false);
  };

  // Delete Workout Function

  // Function to delete a workout by its array index
  const deleteWorkout = async (index) => {
    // Reference to today's fitness data
    const fitnessRef = ref(database, `users/${user.uid}/fitness/${today}`);

    // Filter out the workout at the given index
    const newActivities = activities.filter((_, i) => i !== index);

    // Update Firebase
    await update(fitnessRef, { activities: newActivities });

    // Voice announcement
    if (voiceEnabled) {
      speak("Workout removed", true);
    }
  };

  // SPEAK INSTRUCTIONS FUNCTION
  // Reads the exercise instructions aloud using text-to-speech

  const speakInstructions = (exercise) => {
    // Check if speech synthesis is supported
    if (!window.speechSynthesis) {
      alert("Speech not supported in this browser");
      return;
    }

    // Cancel any current speech
    window.speechSynthesis.cancel();

    // Build the message to speak
    const message = `${exercise.name}. ${exercise.instructions}`;

    // Create speech utterance
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = 0.85; // Slightly slower for clarity
    utterance.pitch = 1.0;
    utterance.lang = "en-GB";

    // Speak the message
    window.speechSynthesis.speak(utterance);
  };

  // Get Workout Icon Helper Function

  // Function to determine which emoji icon to show based on workout name
  const getIcon = (activity) => {
    // If its a template exercise then use stored icon
    if (activity.exerciseIcon) return activity.exerciseIcon;
    if (activity.categoryIcon) return activity.categoryIcon;

    // For custom exercises, match keywords to appropriate icons
    const lowerName = (activity.type || "").toLowerCase();
    if (lowerName.includes("run")) return "🏃";
    if (lowerName.includes("walk")) return "🚶";
    if (lowerName.includes("jump")) return "⬆️";
    if (lowerName.includes("squat")) return "🏋️";
    if (lowerName.includes("yoga")) return "🧘";
    if (lowerName.includes("stretch")) return "🙆";
    if (lowerName.includes("breath")) return "🌬️";

    // Default icon for unrecognized exercises
    return "💪";
  };

  // Render Fitness UI

  return (
    <div className="page">
      {/* PAGE HEADER */}
      <div className="page-header-bar">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Back button */}
          <button
            className="back-btn"
            onClick={() => setActivePage("dashboard")}
          >
            ←
          </button>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "#22c55e", fontSize: 20 }}>📈</span>
              <h1 className="page-title-main">Fitness Tracker</h1>
            </div>
            <p className="page-subtitle">Track your daily exercises</p>
          </div>
        </div>
        <span className="header-user">{displayName}</span>
      </div>

      {/* Stats Banner */}
      <div className="steps-banner">
        <div>
          <div className="steps-label">EXERCISES TODAY</div>
          <div className="steps-value">{activities.length}</div>
          <div className="steps-sub">Exercises completed</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div className="steps-label">TOTAL TIME</div>
          <div className="steps-value">{totalMins}</div>
          <div className="steps-sub">Minutes</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="steps-label">CALORIES</div>
          <div className="steps-value">{calories}</div>
          <div className="steps-sub">Burned</div>
        </div>
      </div>

      {/* Decorative shoe icon */}
      <div className="steps-icon">👟</div>

      {/* EXERCISE CATEGORIES */}
      <div className="card-white" style={{ marginTop: 20 }}>
        <h3 className="section-title">🏋️ Choose an Exercise</h3>
        <p style={{ color: "#64748b", fontSize: 14, marginBottom: 16 }}>
          Select a category that suits your needs today
        </p>

        {/* Category grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 12,
          }}
        >
          {exerciseCategories.map((category) => (
            <button
              key={category.id}
              type="button"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "16px 12px",
                background: category.color,
                border: "2px solid #e2e8f0",
                borderRadius: 12,
                cursor: "pointer",
              }}
              onClick={() => {
                setSelectedCategory(category);
                setShowTemplateModal(true);
              }}
            >
              <span style={{ fontSize: 28, marginBottom: 8 }}>
                {category.icon}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>
                {category.name}
              </span>
              <span style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                {category.exercises.length} exercises
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Custom Exercise Section */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          margin: "24px 0 16px",
        }}
      >
        <h2 className="section-title-lg">Your Exercises</h2>
        <button
          className="add-med-btn"
          onClick={() => setShowAddExercise(!showAddExercise)}
          style={{ background: "#475569" }}
        >
          + Custom Exercise
        </button>
      </div>

      {/* ═══ ADD CUSTOM EXERCISE FORM ═══ */}
      {showAddExercise && (
        <div className="card-white" style={{ marginBottom: 20 }}>
          <h3 className="section-title">Add Custom Exercise</h3>
          <p style={{ color: "#64748b", fontSize: 14, marginBottom: 16 }}>
            Log any exercise that doesn't fit the templates above
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              addWorkout();
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Exercise type */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#374151",
                    marginBottom: 6,
                  }}
                >
                  Exercise Type *
                </label>
                <input
                  type="text"
                  placeholder="e.g., Walking, Swimming, Yoga"
                  value={workoutType}
                  onChange={(e) => setWorkoutType(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    border: "2px solid #e2e8f0",
                    borderRadius: 8,
                    fontSize: 15,
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Duration and Calories Row */}
              <div style={{ display: "flex", gap: 12 }}>
                {/* Duration */}
                <div style={{ flex: 1 }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#374151",
                      marginBottom: 6,
                    }}
                  >
                    Duration (minutes) *
                  </label>
                  <input
                    type="number"
                    placeholder="e.g., 30"
                    value={workoutDuration}
                    onChange={(e) => setWorkoutDuration(e.target.value)}
                    required
                    min="1"
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      border: "2px solid #e2e8f0",
                      borderRadius: 8,
                      fontSize: 15,
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                {/* Calories Burned */}
                <div style={{ flex: 1 }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#374151",
                      marginBottom: 6,
                    }}
                  >
                    Calories Burned
                  </label>
                  <input
                    type="number"
                    placeholder="e.g., 150"
                    value={workoutCalories}
                    onChange={(e) => setWorkoutCalories(e.target.value)}
                    min="0"
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      border: "2px solid #e2e8f0",
                      borderRadius: 8,
                      fontSize: 15,
                      boxSizing: "border-box",
                    }}
                  />
                  <p
                    style={{
                      fontSize: 11,
                      color: "#94a3b8",
                      marginTop: 4,
                      marginBottom: 0,
                    }}
                  >
                    💡 Leave blank to auto-estimate
                  </p>
                </div>
              </div>

              {/* Intensity Level */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#374151",
                    marginBottom: 6,
                  }}
                >
                  Intensity Level
                </label>
                <select
                  value={workoutIntensity}
                  onChange={(e) => setWorkoutIntensity(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    border: "2px solid #e2e8f0",
                    borderRadius: 8,
                    fontSize: 15,
                    boxSizing: "border-box",
                    background: "white",
                  }}
                >
                  <option value="light">
                    🟢 Light (stretching, slow walk)
                  </option>
                  <option value="moderate">
                    🟡 Moderate (brisk walk, cycling)
                  </option>
                  <option value="vigorous">🔴 Vigorous (running, HIIT)</option>
                </select>
              </div>

              {/* Notes (Optional) */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#374151",
                    marginBottom: 6,
                  }}
                >
                  Notes (Optional)
                </label>
                <textarea
                  placeholder="Any additional notes about this workout..."
                  value={workoutNotes}
                  onChange={(e) => setWorkoutNotes(e.target.value)}
                  rows={2}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    border: "2px solid #e2e8f0",
                    borderRadius: 8,
                    fontSize: 15,
                    boxSizing: "border-box",
                    resize: "vertical",
                  }}
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                style={{
                  width: "100%",
                  padding: "14px",
                  background: "#2563eb",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: "pointer",
                  marginTop: 8,
                }}
              >
                ✓ Log Exercise
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Exercises List */}
      {activities.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: 56 }}>🏃</div>
          <p>No exercises logged today</p>
          <p style={{ fontSize: 14, marginTop: 8, color: "#94a3b8" }}>
            Choose an exercise category above to get started
          </p>
        </div>
      ) : (
        <div className="workout-cards-grid">
          {activities.map((activity, index) => (
            <div className="workout-card" key={index}>
              <div className="workout-card-top">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 26 }}>{getIcon(activity)}</span>
                  <div>
                    <div className="workout-name">{activity.type}</div>
                    <div className="editable-tag">
                      {activity.category || "Custom"}
                    </div>
                  </div>
                </div>
              </div>

              {activity.benefits && (
                <div
                  style={{
                    fontSize: 12,
                    color: "#64748b",
                    marginBottom: 12,
                    padding: "8px 10px",
                    background: "#f8fafc",
                    borderRadius: 6,
                  }}
                >
                  💪 {activity.benefits}
                </div>
              )}

              <div className="workout-stats">
                {activity.count > 0 && (
                  <div className="workout-stat blue-bg">
                    <div className="workout-stat-label">COUNT</div>
                    <div className="workout-stat-value blue">
                      {activity.count}
                    </div>
                  </div>
                )}
                <div className="workout-stat green-bg">
                  <div className="workout-stat-label">DURATION</div>
                  <div className="workout-stat-value green">
                    {activity.duration} min
                  </div>
                </div>
              </div>

              <div className="workout-last-updated">
                Completed at{" "}
                {new Date(activity.timestamp).toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>

              <div className="workout-actions">
                <button
                  className="workout-delete-btn"
                  onClick={() => deleteWorkout(index)}
                >
                  🗑️ Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ SUMMARY ═══ */}
      <h2 className="section-title-lg" style={{ marginTop: 32 }}>
        Today's Summary
      </h2>
      <div className="summary-grid">
        {[
          {
            icon: "🏋️",
            value: activities.length,
            label: "Exercises",
            color: "#f97316",
          },
          { icon: "⏱️", value: totalMins, label: "Minutes", color: "#3b82f6" },
          { icon: "🔥", value: calories, label: "Calories", color: "#ef4444" },
          {
            icon: "👟",
            value: totalSteps.toLocaleString(),
            label: "Steps",
            color: "#22c55e",
          },
        ].map((stat, index) => (
          <div className="summary-card" key={index}>
            <div style={{ fontSize: 28, color: stat.color }}>{stat.icon}</div>
            <div className="summary-value">{stat.value}</div>
            <div className="summary-label">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* MODAL - THIS IS THE IMPORTANT PART THAT WAS MISSING */}
      {showTemplateModal && (
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
            zIndex: 9999,
          }}
          onClick={() => {
            setShowTemplateModal(false);
            setSelectedCategory(null);
            setSelectedExercise(null);
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: 16,
              width: "90%",
              maxWidth: 600,
              maxHeight: "90vh",
              overflow: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: "24px 24px 0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                borderBottom: "1px solid #e2e8f0",
                paddingBottom: 16,
              }}
            >
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
                  {selectedExercise
                    ? selectedExercise.name
                    : selectedCategory
                      ? `${selectedCategory.icon} ${selectedCategory.name}`
                      : "Choose Category"}
                </h2>
                <p
                  style={{
                    fontSize: 13,
                    color: "#64748b",
                    marginTop: 4,
                    margin: "4px 0 0 0",
                  }}
                >
                  {selectedExercise
                    ? selectedExercise.benefits
                    : selectedCategory
                      ? selectedCategory.description
                      : "Select an exercise category"}
                </p>
              </div>
              <button
                style={{
                  background: "#f1f5f9",
                  border: "none",
                  fontSize: 14,
                  cursor: "pointer",
                  color: "#475569",
                  padding: "8px 12px",
                  borderRadius: 6,
                  fontWeight: 500,
                }}
                onClick={() => {
                  if (selectedExercise) {
                    setSelectedExercise(null);
                  } else if (selectedCategory) {
                    setSelectedCategory(null);
                  } else {
                    setShowTemplateModal(false);
                  }
                }}
              >
                {selectedExercise || selectedCategory ? "← Back" : "✕ Close"}
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: 24 }}>
              {/* ─── EXERCISE DETAIL VIEW ─── */}
              {selectedExercise && (
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 64, marginBottom: 16 }}>
                    {selectedExercise.icon}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      gap: 12,
                      marginBottom: 20,
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        background: "#f1f5f9",
                        padding: "8px 16px",
                        borderRadius: 20,
                        fontSize: 13,
                      }}
                    >
                      ⏱️ {selectedExercise.duration}
                    </span>
                    <span
                      style={{
                        background: "#f1f5f9",
                        padding: "8px 16px",
                        borderRadius: 20,
                        fontSize: 13,
                      }}
                    >
                      💪 {selectedExercise.benefits}
                    </span>
                  </div>

                  <div
                    style={{
                      background: "#f0fdf4",
                      border: "2px solid #0d9488",
                      borderRadius: 12,
                      padding: 20,
                      marginBottom: 16,
                      textAlign: "left",
                    }}
                  >
                    <h4
                      style={{
                        color: "#115e59",
                        marginBottom: 10,
                        fontSize: 14,
                        margin: "0 0 10px 0",
                      }}
                    >
                      📋 Instructions
                    </h4>
                    <p
                      style={{
                        color: "#374151",
                        lineHeight: 1.6,
                        margin: "0 0 16px 0",
                      }}
                    >
                      {selectedExercise.instructions}
                    </p>
                    <button
                      onClick={() => speakInstructions(selectedExercise)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "10px 20px",
                        background: "#0d9488",
                        color: "white",
                        border: "none",
                        borderRadius: 8,
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      🔊 Listen to Instructions
                    </button>
                  </div>

                  {selectedExercise.accessibilityNotes && (
                    <div
                      style={{
                        background: "#eff6ff",
                        border: "2px solid #0284c7",
                        borderRadius: 12,
                        padding: 20,
                        textAlign: "left",
                        marginBottom: 20,
                      }}
                    >
                      <h4
                        style={{
                          color: "#075985",
                          fontSize: 14,
                          margin: "0 0 10px 0",
                        }}
                      >
                        ♿ Accessibility Notes
                      </h4>
                      <ul style={{ margin: 0, paddingLeft: 20 }}>
                        {selectedExercise.accessibilityNotes.map((note, i) => (
                          <li
                            key={i}
                            style={{
                              color: "#374151",
                              padding: "4px 0",
                              fontSize: 14,
                            }}
                          >
                            {note}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <button
                    onClick={() =>
                      addTemplateExercise(selectedExercise, selectedCategory)
                    }
                    style={{
                      padding: "14px 32px",
                      background: "#2563eb",
                      color: "white",
                      border: "none",
                      borderRadius: 8,
                      fontSize: 16,
                      fontWeight: 600,
                      cursor: "pointer",
                      width: "100%",
                    }}
                  >
                    ✓ Log This Exercise
                  </button>
                </div>
              )}

              {/* ─── EXERCISE LIST ─── */}
              {selectedCategory && !selectedExercise && (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  {selectedCategory.exercises.map((exercise) => (
                    <button
                      key={exercise.id}
                      type="button"
                      onClick={() => setSelectedExercise(exercise)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                        padding: "14px 16px",
                        background: "#f8fafc",
                        border: "2px solid #e2e8f0",
                        borderRadius: 10,
                        cursor: "pointer",
                        textAlign: "left",
                        width: "100%",
                      }}
                    >
                      <span style={{ fontSize: 28 }}>{exercise.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontWeight: 600,
                            color: "#1e293b",
                            marginBottom: 2,
                          }}
                        >
                          {exercise.name}
                        </div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>
                          {exercise.duration} • {exercise.benefits}
                        </div>
                      </div>
                      <span style={{ color: "#94a3b8", fontSize: 18 }}>→</span>
                    </button>
                  ))}
                </div>
              )}

              {/* ─── CATEGORY SELECTION ─── */}
              {!selectedCategory && !selectedExercise && (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 12 }}
                >
                  {exerciseCategories.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => setSelectedCategory(category)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 16,
                        padding: "16px 20px",
                        background: category.color,
                        border: "2px solid #e2e8f0",
                        borderRadius: 12,
                        cursor: "pointer",
                        textAlign: "left",
                        width: "100%",
                      }}
                    >
                      <span style={{ fontSize: 36 }}>{category.icon}</span>
                      <div>
                        <div
                          style={{
                            fontWeight: 700,
                            color: "#1e293b",
                            marginBottom: 4,
                          }}
                        >
                          {category.name}
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: "#64748b",
                            marginBottom: 4,
                          }}
                        >
                          {category.description}
                        </div>
                        <div style={{ fontSize: 12, color: "#94a3b8" }}>
                          {category.exercises.length} exercises
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// HEALTH PROFILE COMPONENT
// User profile page showing personal info, medical data, and account settings

function HealthProfile({ user, medications, setActivePage, voiceEnabled }) {
  // Profile data object containing all user information
  const [profile, setProfile] = useState({
    fullName: "",
    phone: "",
    dob: "",
    emergencyContact: "",
    emergencyContactPhone: "",
    doctorName: "",
    doctorPhone: "",
    surgeryName: "",
    surgeryPhone: "",
    allergies: "",
    accessibilityNeeds: "",
  });

  // Whether user is currently editing their profile
  const [editing, setEditing] = useState(false);

  // Extract username from email
  const userName = user.email.split("@")[0];

  // Read Profile Aloud Function
  const readProfileAloud = () => {
    if (!window.speechSynthesis) {
      alert("Speech synthesis not supported in this browser");
      return;
    }

    // Cancel any currently speaking text
    window.speechSynthesis.cancel();

    // Build the message
    let message = `Health Profile for ${profile.fullName || userName}. `;

    // Personal Information
    message += `Email: ${user.email}. `;

    if (profile.phone) {
      message += `Phone: ${profile.phone}. `;
    }

    if (profile.dob) {
      const dobDate = new Date(profile.dob).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      message += `Date of Birth: ${dobDate}. `;
    }

    // Medical Information
    if (profile.emergencyContact) {
      message += `Emergency Contact: ${profile.emergencyContact}. `;
      if (profile.emergencyContactPhone) {
        message += `Emergency Contact Phone: ${profile.emergencyContactPhone}. `;
      }
    }

    if (medications.length > 0) {
      message += `Current Medications: ${medications.map((med) => med.name).join(", ")}. `;
    } else {
      message += `No current medications. `;
    }

    if (profile.allergies) {
      message += `Allergies: ${profile.allergies}. `;
    } else {
      message += `No allergies reported. `;
    }

    // Accessibility needs
    if (profile.accessibilityNeeds) {
      message += `Accessibility Needs: ${profile.accessibilityNeeds}. `;
    } else {
      message += `No accessibility needs specified. `;
    }

    // Preferences
    message += `Preferred Language: ${profile.language || "English"}. `;

    // Account info
    message += `Account created: ${createdMonth}. `;
    message += `Total medications tracked: ${medications.length}. `;

    // Create and speak the utterance
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = 0.9; // Slightly slower for clarity
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    utterance.lang = "en-GB";

    utterance.onerror = (event) => {
      console.error("Speech synthesis error:", event);
    };

    window.speechSynthesis.speak(utterance);
  };

  // Load Profile Data Effect

  // Save Profile Function

  // Function to save profile changes to Firebase
  const saveProfile = async () => {
    // Update Firebase with current profile state
    await update(ref(database, `users/${user.uid}/profile`), profile);

    // Exit editing mode
    setEditing(false);
  };

  // Delete Account Function

  // Function to permanently delete user account and all data
  const deleteAccount = async () => {
    // Confirm with user before proceeding (dangerous action!)
    if (window.confirm("Are you sure? This cannot be undone.")) {
      // Delete all user data from Firebase
      await remove(ref(database, `users/${user.uid}`));

      // Delete Firebase authentication account
      await deleteUser(auth.currentUser);
    }
  };

  // Calculate Account Creation Date

  // Format account creation date as "Feb 2026"
  const createdMonth = new Date(
    user.metadata?.creationTime || Date.now(),
  ).toLocaleDateString("en-GB", { month: "short", year: "numeric" });

  // Render Profile UI

  return (
    <div className="page">
      {/* PAGE HEADER */}
      <div className="page-header-bar">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            className="back-btn"
            onClick={() => setActivePage("dashboard")}
          >
            ←
          </button>
          <h1 className="page-title-main">Health Profile</h1>
        </div>

        {/* Right side buttons */}
        <div className="header-right">
          {/* Read aloud button */}
          <button
            className="voice-outline-btn"
            onClick={readProfileAloud}
            title="Read profile information aloud"
          >
            🔊 Read
          </button>

          {/* Edit/Save button - toggles based on editing state */}
          <button
            className="edit-dark-btn"
            onClick={() => (editing ? saveProfile() : setEditing(true))}
          >
            ✏️ {editing ? "Save" : "Edit"}
          </button>
        </div>
      </div>

      {/* PROFILE PAGE CONTENT */}
      <div className="profile-page">
        {/* ─── AVATAR CARD ─── */}
        <div className="profile-card">
          {/* Avatar icon */}
          <div className="profile-avatar">👤</div>
          <div>
            {/* Display full name or fallback to username */}
            <div className="profile-name">{profile.fullName || userName}</div>
            <div className="profile-handle">@{userName}</div>
          </div>
        </div>

        {/* PERSONAL INFORMATION CARD */}
        <div className="profile-card">
          <h3 className="profile-section-title">Personal Information</h3>

          {/* Grid of personal info fields */}
          <div className="profile-grid">
            {/* Full Name field - editable when in edit mode */}
            <div className="profile-field">
              <div className="profile-field-label">Full Name</div>
              {editing ? (
                <input
                  className="form-input"
                  value={profile.fullName}
                  onChange={(e) =>
                    setProfile({ ...profile, fullName: e.target.value })
                  }
                />
              ) : (
                <div className="profile-field-value">
                  {profile.fullName || userName}
                </div>
              )}
            </div>

            {/* Email field - not editable (comes from auth) */}
            <div className="profile-field">
              <div className="profile-field-label">Email</div>
              <div className="profile-field-value">{user.email}</div>
            </div>

            {/* Phone field */}
            <div className="profile-field">
              <div className="profile-field-label">Phone</div>
              {editing ? (
                <input
                  className="form-input"
                  value={profile.phone}
                  onChange={(e) =>
                    setProfile({ ...profile, phone: e.target.value })
                  }
                  placeholder="+44 7700 900000"
                />
              ) : (
                <div className="profile-field-value">
                  {profile.phone || "Not set"}
                </div>
              )}
            </div>

            {/* Date of Birth field */}
            <div className="profile-field">
              <div className="profile-field-label">Date of Birth</div>
              {editing ? (
                <input
                  type="date"
                  className="form-input"
                  value={profile.dob}
                  onChange={(e) =>
                    setProfile({ ...profile, dob: e.target.value })
                  }
                />
              ) : (
                <div className="profile-field-value">
                  {profile.dob
                    ? new Date(profile.dob).toDateString()
                    : "Not set"}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* MEDICAL INFORMATION CARD */}
        <div className="profile-card">
          <h3 className="profile-section-title">Medical Information</h3>

          <div className="profile-grid">
            {/* Emergency Contact */}
            <div className="profile-field">
              <div className="profile-field-label">Emergency Contact</div>
              {editing ? (
                <input
                  className="form-input"
                  value={profile.emergencyContact}
                  onChange={(e) =>
                    setProfile({ ...profile, emergencyContact: e.target.value })
                  }
                  placeholder="e.g., John Smith (Father)"
                />
              ) : (
                <div className="profile-field-value">
                  {profile.emergencyContact || "Not set"}
                </div>
              )}
            </div>

            {/* Emergency Contact Phone */}
            <div className="profile-field">
              <div className="profile-field-label">Emergency Contact Phone</div>
              {editing ? (
                <input
                  className="form-input"
                  type="tel"
                  value={profile.emergencyContactPhone}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      emergencyContactPhone: e.target.value,
                    })
                  }
                  placeholder="e.g., +44 7711 223344"
                />
              ) : (
                <div className="profile-field-value">
                  {profile.emergencyContactPhone || "Not set"}
                </div>
              )}
            </div>

            {/* Current Medications - auto-populated from medications list */}
            <div className="profile-field">
              <div className="profile-field-label">Current Medications</div>
              <ul className="profile-list">
                {medications.map((med) => (
                  <li key={med.id}>{med.name}</li>
                ))}
              </ul>
            </div>

            {/* Allergies */}
            <div className="profile-field">
              <div className="profile-field-label">Allergies</div>
              {editing ? (
                <input
                  className="form-input"
                  value={profile.allergies}
                  onChange={(e) =>
                    setProfile({ ...profile, allergies: e.target.value })
                  }
                  placeholder="e.g. Penicillin"
                />
              ) : (
                <div className="profile-field-value">
                  {profile.allergies || "None reported"}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ACCESSIBILITY & PREFERENCES CARD */}
        <div className="profile-card">
          <h3 className="profile-section-title">Accessibility & Preferences</h3>

          <div className="profile-grid">
            {/* Accessibility Needs */}
            <div className="profile-field">
              <div className="profile-field-label">Accessibility Needs</div>
              {editing ? (
                <textarea
                  className="form-input form-textarea"
                  value={profile.accessibilityNeeds}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      accessibilityNeeds: e.target.value,
                    })
                  }
                  placeholder="e.g., Large text, screen reader, high contrast..."
                  style={{ minHeight: "60px" }}
                />
              ) : (
                <div className="profile-field-value">
                  {profile.accessibilityNeeds || "None specified"}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* STATISTICS ROW */}
        <div className="profile-stats-row">
          {/* Three stat cards showing account info */}
          {[
            {
              icon: "📅",
              value: createdMonth,
              label: "Account Created",
              color: "#3b82f6",
            },
            {
              icon: "💊",
              value: medications.length,
              label: "Medications Tracked",
              color: "#22c55e",
            },
            { icon: "📈", value: "0", label: "Days Active", color: "#8b5cf6" },
          ].map((stat, index) => (
            <div className="profile-stat-card" key={index}>
              <div style={{ fontSize: 24, color: stat.color }}>{stat.icon}</div>
              <div className="profile-stat-value">{stat.value}</div>
              <div className="profile-stat-label">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Delete Account */}
        <div className="delete-account">
          <h3 className="delete-title">Delete Account</h3>
          <p className="delete-desc">
            Permanently delete your account, including all health profiles,
            medications, fitness data, and assistant chats. This action cannot
            be undone.
          </p>

          {/* Delete Account button - triggers deleteAccount function */}
          <button className="delete-account-btn" onClick={deleteAccount}>
            🗑️ Delete Account
          </button>
        </div>
      </div>
    </div>
  );
}

// EMERGENCY CONTACTS COMPONENT
// Page displaying emergency numbers and personal medical contacts

function Emergency({ user, medications, setActivePage, userProfile }) {
  // Emergency contacts object (in production, this would come from Firebase)
  const [contacts] = useState({
    gp: { name: "Dr. Smith", phone: "+44 20 1234 5678" },
    pharmacy: { name: "Local Pharmacy", phone: "+44 20 8765 4321" },
  });

  // Get emergency contact from user profile
  const emergencyContact = {
    name: userProfile?.emergencyContact || "Not set",
    phone: userProfile?.emergencyContactPhone || "",
  };

  const doctorContact = {
    name: userProfile?.doctorName || "Not set",
    phone: userProfile?.doctorPhone || "",
    surgery: userProfile?.surgeryName || "",
    surgeryPhone: userProfile?.surgeryPhone || "",
  };

  // User profile data for allergies/medical info
  const [profile, setProfile] = useState({});

  // Load Profile Data Effect

  // Load user profile to display medical information
  useEffect(() => {
    if (!user) return;

    const profileRef = ref(database, `users/${user.uid}/profile`);
    onValue(profileRef, (snapshot) => {
      if (snapshot.val()) setProfile(snapshot.val());
    });
  }, [user]);

  // Render Emergency UI

  return (
    <div className="page">
      {/* PAGE HEADER */}
      <div className="page-header-bar">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            className="back-btn"
            onClick={() => setActivePage("dashboard")}
          >
            ←
          </button>
          <h1 className="page-title-main">Emergency Contacts</h1>
        </div>
        <button className="voice-outline-btn">🔊 Read</button>
      </div>

      {/* EMERGENCY PAGE CONTENT */}
      <div className="emergency-page">
        {/* EMERGENCY SERVICES SECTION */}
        <h3 className="section-title-lg">Emergency Services</h3>

        {/* Row with 999 and 111 cards */}
        <div className="emergency-services-row">
          {[
            {
              icon: "🚨",
              label: "Emergency Services",
              number: "999",
              color: "#ef4444",
              bg: "#fef2f2",
            },
            {
              icon: "📋",
              label: "NHS Non-Emergency",
              number: "111",
              color: "#1e293b",
              bg: "#f8fafc",
            },
          ].map((service, index) => (
            // Clickable link that dials the number when tapped (on mobile)
            <a
              href={`tel:${service.number}`}
              className="emergency-service-card"
              key={index}
              style={{ background: service.bg }}
            >
              {/* Icon circle */}
              <div
                className="emergency-icon-circle"
                style={{
                  background: service.bg,
                  border: `2px solid ${service.color}20`,
                }}
              >
                <span style={{ fontSize: 28 }}>{service.icon}</span>
              </div>

              {/* Service details */}
              <div className="emergency-service-label">{service.label}</div>
              <div
                className="emergency-number"
                style={{ color: service.color }}
              >
                {service.number}
              </div>
              <div className="emergency-tap">Tap to Call</div>
            </a>
          ))}
        </div>

        {/* PERSONAL CONTACTS SECTION */}
        <h3 className="section-title-lg" style={{ marginTop: 28 }}>
          Personal Contacts
        </h3>

        {/* Grid of personal emergency contacts */}
        <div className="personal-contacts-grid">
          {[
            {
              type: "Emergency Contact",
              icon: "🆘",
              name: emergencyContact.name,
              phone: emergencyContact.phone,
              hasPhone: !!emergencyContact.phone,
            },
            {
              type: "DOCTOR / GP",
              icon: "🩺",
              name: doctorContact.name,
              phone: doctorContact.phone,
              hasPhone: !!doctorContact.phone,
            },
            {
              type: "SURGERY / CLINIC",
              icon: "🏥",
              name: doctorContact.surgery || "Not set",
              phone: doctorContact.surgeryPhone,
              hasPhone: !!doctorContact.surgeryPhone,
            },
          ].map((contact, index) => (
            <div className="personal-contact-card" key={index}>
              {/* Contact avatar */}
              <div className="contact-avatar">{contact.icon}</div>

              {/* Contact info */}
              <div className="contact-info">
                <div className="contact-type">{contact.type}</div>
                <div className="contact-name">{contact.name}</div>
                <div className="contact-phone">
                  {contact.phone || "No number set"}
                </div>
              </div>

              {/* Call button (only works on mobile and if number exists) */}
              {contact.hasPhone && contact.phone ? (
                <a href={`tel:${contact.phone}`} className="contact-call-btn">
                  📞
                </a>
              ) : (
                <span className="contact-call-btn disabled">📞</span>
              )}
            </div>
          ))}
        </div>

        {/* MEDICAL INFORMATION CARD */}
        <div className="card-white" style={{ marginTop: 24 }}>
          <h3 className="section-title">🛡️ Medical Information</h3>

          {/* Grid showing allergies and current medications */}
          <div className="med-info-grid">
            {/* Allergies */}
            <div>
              <div className="med-info-label">ALLERGIES</div>
              <div className="med-info-value">
                {profile.allergies || "None reported"}
              </div>
            </div>

            {/* Current Medications */}
            <div>
              <div className="med-info-label">CURRENT MEDICATIONS</div>
              <ul className="profile-list">
                {medications.map((med) => (
                  <li key={med.id}>{med.name}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// SETTINGS COMPONENT
// App settings page with toggles and account management options

function Settings({
  user,
  setActivePage,
  largeTextEnabled,
  setLargeTextEnabled,
  highContrastEnabled,
  setHighContrastEnabled,
}) {
  // State Variables

  // Settings object containing all toggle states
  const [settings, setSettings] = useState({
    pushNotifications: true,
    soundAlerts: true,
    medReminders: true,
    fitnessReminders: true,
    voiceCommands: true,
  });

  // Toggle Function

  // Function to toggle a setting on/off
  // key parameter is the setting name (e.g. 'pushNotifications')
  const toggle = (key) => {
    // Handle largeText
    if (key === "largeText") {
      setLargeTextEnabled(!largeTextEnabled);
    } else if (key === "highContrast") {
      setHighContrastEnabled(!highContrastEnabled);
    } else {
      setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
    }
  };

  // get setting value
  const getSettingValue = (key) => {
    if (key === "largeText") {
      return largeTextEnabled;
    }
    if (key === "highContrast") {
      return highContrastEnabled;
    }
    return settings[key];
  };

  // Toggle Switch Component

  // Reusable component for the toggle switch UI
  // on: whether toggle is on or off
  // onToggle: function to call when clicked
  const ToggleSwitch = ({ on, onToggle, label }) => (
    <div
      className={`toggle-switch ${on ? "on" : ""}`}
      onClick={onToggle}
      role="switch"
      aria-checked={on}
      aria-label={label}
      tabIndex="0"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      <div className="toggle-thumb"></div>
    </div>
  );

  // Settings Configuration Array

  // Array defining all settings sections and their items
  const settingsList = [
    {
      section: "Notifications & Alerts",
      items: [
        {
          key: "pushNotifications",
          icon: "🔔",
          label: "Push Notifications",
          desc: "Receive notifications for medication reminders",
        },
        {
          key: "soundAlerts",
          icon: "🔊",
          label: "Sound Alerts",
          desc: "Play sound for important reminders",
        },
        {
          key: "medReminders",
          icon: "💊",
          label: "Medication Reminders",
          desc: "Get reminded to take your medications",
        },
        {
          key: "fitnessReminders",
          icon: "🏋️",
          label: "Fitness Reminders",
          desc: "Get reminded about daily exercise goals",
        },
      ],
    },
    {
      section: "Accessibility",
      items: [
        {
          key: "voiceCommands",
          icon: "🎤",
          label: "Voice Commands",
          desc: "Enable voice control for hands-free operation",
        },
        {
          key: "largeText",
          icon: "T",
          label: "Large Text",
          desc: "Increase text size throughout the app",
        },
        {
          key: "highContrast",
          icon: "◐",
          label: "High Contrast",
          desc: "Increase color contrast for better visibility",
        },
      ],
    },
  ];

  // Render Settings UI

  return (
    <div className="page">
      {/* ═══ PAGE HEADER ═══ */}
      <div className="page-header-bar">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            className="back-btn"
            onClick={() => setActivePage("dashboard")}
          >
            ←
          </button>
          <h1 className="page-title-main">⚙️ Settings</h1>
        </div>
      </div>

      {/* SETTINGS PAGE CONTENT */}
      <div className="settings-page">
        {/* Loop through each settings section */}
        {settingsList.map((group, groupIndex) => (
          <div className="settings-card" key={groupIndex}>
            {/* Section title */}
            <h3 className="settings-section-title">{group.section}</h3>

            {/* Loop through each item in this section */}
            {group.items.map((item, itemIndex) => (
              <div className="settings-item" key={itemIndex}>
                {/* Left side: icon and labels */}
                <div className="settings-item-left">
                  <div className="settings-icon">{item.icon}</div>
                  <div>
                    <div className="settings-label">{item.label}</div>
                    <div className="settings-desc">{item.desc}</div>
                  </div>
                </div>

                {/* Right side: toggle switch */}
                <ToggleSwitch
                  on={getSettingValue(item.key)}
                  onToggle={() => toggle(item.key)}
                  label={item.label}
                />
              </div>
            ))}
          </div>
        ))}

        {/* ACCOUNT SECTION */}
        <div className="settings-card">
          <h3 className="settings-section-title">Account</h3>

          {/* Account action buttons */}
          <button
            className="settings-account-btn dark"
            onClick={() => setActivePage("profile")}
          >
            👤 Update Profile
          </button>

          <button className="settings-account-btn green-outline">
            📷 Update Picture
          </button>

          <button
            className="settings-account-btn green-outline"
            onClick={() => setActivePage("medications")}
          >
            💊 Manage Medicines
          </button>

          <button
            className="settings-account-btn green-outline"
            onClick={async () => {
              console.log("test button clicked");
              console.log("Current permission", Notification.permission);

              if (Notification.permission !== "granted") {
                console.log("❌ No permission, requesting...");
                const granted = await requestNotificationPermission();
                if (!granted) {
                  alert("Please enable notifications in your browser settings");
                  return;
                }
              }

              console.log("✅ Showing test notification");
              const notification = showNotification("Test Notification 🧪", {
                body: "This is a test notification from your Health App! If you see this, notifications are working! 🎉",
                tag: "test",
              });

              if (notification) {
                console.log("✅ Notification shown successfully");
                alert(
                  "Notification sent! Check your browser for the notification.",
                );
              } else {
                console.log("❌ Failed to show notification");
                alert("Failed to show notification. Check console for errors.");
              }
            }}
          >
            🔔 Test Notification
          </button>

          {/* Sign Out button */}
          <button
            className="settings-account-btn red"
            onClick={() => signOut(auth)}
          >
            🗑️ Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

function NotificationManager({ user, medications, reminders }) {
  // tracks whether user has granted notification permission
  // starts with current permission state from browser
  const [notificationPermission, setNotificationPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "defined",
  );

  // stores all active notification timers so we can cancel them later
  const [scheduledNotifications, setScheduledNotifications] = useState([]);

  // runs once when component first loads
  // asks user for notification permission
  useEffect(() => {
    const requestPermission = async () => {
      const granted = await requestNotificationPermission();
      setNotificationPermission(granted ? "granted" : Notification.permission);
    };
    requestPermission();
  }, []);

  useEffect(() => {
    console.log("Permission changed to:", notificationPermission);
  }, [notificationPermission]);

  // schedules notifications for all medications
  // runs whenever medications change or permission is granted
  useEffect(() => {
    // only run if we have permission and medications exist
    if (notificationPermission !== "granted" || !medications.length) return;

    // cancel all existing scheduled notifications first
    // prevents duplicate notifications
    scheduledNotifications.forEach((timeout) => clearTimeout(timeout));
    const newScheduled = [];

    // loop through each medication
    medications.forEach((med) => {
      const frequency = med.frequency?.toLowerCase() || "";
      let times = [];

      // determine how many times per day based on frequency
      if (frequency.includes("three times")) {
        // three times = morning, afternoon, evening
        times = [
          { slot: "morning", time: "08:00" },
          { slot: "afternoon", time: "14:00" },
          { slot: "evening", time: "18:00" },
        ];
      } else if (frequency.includes("twice")) {
        // twice daily = morning and evening
        times = [
          { slot: "morning", time: "08:00" },
          { slot: "evening", time: "18:00" },
        ];
      } else {
        // once daily = use the time set by user
        times = [{ slot: "single", time: med.time || "08:00" }];
      }

      // schedule a notification for each dose time
      times.forEach(({ time }) => {
        const timeout = scheduleNotification(
          `💊 Medication Reminder`,
          `Time to take ${med.name} (${med.dosage})`,
          time,
        );
        newScheduled.push(timeout);
      });
    });

    // save all the new timers
    setScheduledNotifications(newScheduled);

    // cleanup function: cancel all timers when component unmounts
    // or when medications change
    return () => {
      newScheduled.forEach((timeout) => clearTimeout(timeout));
    };
  }, [medications, notificationPermission]);

  // schedules notifications for custom reminders
  // runs whenever reminders change or permission is granted
  useEffect(() => {
    if (notificationPermission !== "granted" || !reminders.length) return;

    const newScheduled = [];

    // figure out what day of week it is
    const today = new Date().getDay(); // 0=Sunday, 1=Monday, etc.
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const todayName = dayNames[today];

    // loop through all reminders
    reminders.forEach((reminder) => {
      // skip if reminder is turned off
      if (!reminder.enabled) return;

      // skip if reminder is not scheduled for today
      if (!reminder.days.includes(todayName)) return;

      // choose icon based on reminder type
      const icon = reminder.type === "measurement" ? "📊" : "💊";

      // schedule the notification
      const timeout = scheduleNotification(
        `${icon} ${reminder.type === "measurement" ? "Measurement" : "Medication"} Reminder`,
        reminder.title,
        reminder.time,
      );
      newScheduled.push(timeout);
    });

    // add these new timers to the existing ones
    setScheduledNotifications((prev) => [...prev, ...newScheduled]);

    // cleanup function
    return () => {
      newScheduled.forEach((timeout) => clearTimeout(timeout));
    };
  }, [reminders, notificationPermission]);

  // if user hasn't granted or denied permission yet, show banner
  if (notificationPermission === "default") {
    return (
      <div className="notification-permission-banner">
        <div className="permission-content">
          <span className="permission-icon">🔔</span>
          <div>
            <div className="permission-title">Enable Notifications</div>
            <div className="permission-subtitle">
              Get reminders for your medications and measurements
            </div>
          </div>
        </div>
        <button
          className="permission-btn"
          onClick={async () => {
            // when user clicks, request permission
            const granted = await requestNotificationPermission();
            setNotificationPermission(
              granted ? "granted" : Notification.permission,
            );

            if (granted) {
              // show a test notification
              setTimeout(() => {
                showNotification("Notifications Enabled! 🎉", {
                  body: "You'll now receive medication reminders",
                  tag: "welcome",
                });
              }, 500);
            }
          }}
        >
          Enable
        </button>
      </div>
    );
  }

  // if permission is granted or denied, don't show anything
  return null;
}

// ══════════════════════════════════════════════════════════════════════════════
// ONBOARDING COMPONENT
// Collects essential health information from new users
// ══════════════════════════════════════════════════════════════════════════════

function Onboarding({ user, onComplete }) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  // Controls medication modal visibility
  const [showMedModal, setShowMedModal] = useState(false);
  // Index of medication being edited (-1 for new medication)
  const [editingMedIndex, setEditingMedIndex] = useState(-1);

  // Form state
  const [formData, setFormData] = useState({
    // Personal Info
    fullName: "",
    phone: "",
    dob: "",

    // Emergency Contact
    emergencyContact: "",
    emergencyContactPhone: "",

    // Doctor/Surgery
    doctorName: "",
    doctorPhone: "",
    surgeryName: "",
    surgeryPhone: "",

    // Medical Info
    medications: "",
    allergies: "",

    // Accessibility
    accessibilityNeeds: "",
  });

  // These fields are used for the medication add/edit modal
  // They mirror the fields in the Medications page

  const [medName, setMedName] = useState(""); // Medication name)
  const [medDosage, setMedDosage] = useState(""); // Dosage
  const [medFreq, setMedFreq] = useState("Once daily"); // How often to take it
  const [medTimeSlot, setMedTimeSlot] = useState("Morning"); // Time of day
  const [medTime, setMedTime] = useState("08:00"); // Specific time
  const [medNotes, setMedNotes] = useState(""); // Additional instructions

  // For medications with multiple doses per day
  const [medMorningTime, setMedMorningTime] = useState("08:00");
  const [medAfternoonTime, setMedAfternoonTime] = useState("14:00");
  const [medEveningTime, setMedEveningTime] = useState("18:00");

  const totalSteps = 4;

  // HELPER FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * updateField
   *
   * Updates a single field in the formData state.
   * Uses the spread operator to keep all other fields unchanged.
   *
   * @param {string} field - The field name to update
   * @param {any} value - The new value for the field
   */
  const updateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  /**
   * resetMedForm
   *
   * Resets all medication form fields to their default values.
   * Called after adding/editing a medication or closing the modal.
   */
  const resetMedForm = () => {
    setMedName("");
    setMedDosage("");
    setMedFreq("Once daily");
    setMedTimeSlot("Morning");
    setMedTime("08:00");
    setMedNotes("");
    setMedMorningTime("08:00");
    setMedAfternoonTime("14:00");
    setMedEveningTime("18:00");
    setEditingMedIndex(-1);
  };

  /**
   * openAddMedModal
   *
   * Opens the medication modal in "add" mode.
   * Resets the form to default values.
   */
  const openAddMedModal = () => {
    resetMedForm();
    setShowMedModal(true);
  };

  /**
   * openEditMedModal
   *
   * Opens the medication modal in "edit" mode.
   * Populates the form with the existing medication's data.
   *
   * @param {number} index - The index of the medication in the array
   */
  const openEditMedModal = (index) => {
    const med = formData.medications[index];

    // Populate form fields with existing medication data
    setMedName(med.name || "");
    setMedDosage(med.dosage || "");
    setMedFreq(med.frequency || "Once daily");
    setMedTimeSlot(med.timeSlot || "Morning");
    setMedTime(med.time || "08:00");
    setMedNotes(med.notes || "");
    setMedMorningTime(med.morningTime || "08:00");
    setMedAfternoonTime(med.afternoonTime || "14:00");
    setMedEveningTime(med.eveningTime || "18:00");

    setEditingMedIndex(index);
    setShowMedModal(true);
  };

  /**
   * closeMedModal
   *
   * Closes the medication modal and resets the form.
   */
  const closeMedModal = () => {
    setShowMedModal(false);
    resetMedForm();
  };

  /**
   * saveMedication
   *
   * Saves the medication from the form to the medications array.
   * If editing, updates the existing medication.
   * If adding, appends to the array.
   */
  const saveMedication = () => {
    // Validate required fields
    if (!medName.trim() || !medDosage.trim()) {
      alert("Please enter medication name and dosage.");
      return;
    }

    // Create the medication object
    const newMed = {
      name: medName.trim(),
      dosage: medDosage.trim(),
      frequency: medFreq,
      timeSlot: medTimeSlot,
      time: medTime,
      notes: medNotes.trim(),
      // Store times for multi-dose medications
      morningTime: medMorningTime,
      afternoonTime: medAfternoonTime,
      eveningTime: medEveningTime,
    };

    // Update the medications array
    const updatedMeds = [...formData.medications];

    if (editingMedIndex >= 0) {
      // Editing existing medication - replace at index
      updatedMeds[editingMedIndex] = newMed;
    } else {
      // Adding new medication - append to array
      updatedMeds.push(newMed);
    }

    // Update formData with new medications array
    updateField("medications", updatedMeds);

    // Close the modal
    closeMedModal();
  };

  /**
   * deleteMedication
   *
   * Removes a medication from the array by index.
   *
   * @param {number} index - The index of the medication to delete
   */
  const deleteMedication = (index) => {
    const updatedMeds = formData.medications.filter((_, i) => i !== index);
    updateField("medications", updatedMeds);
  };

  /**
   * getFrequencyLabel
   *
   * Returns a short label for the frequency (for display in medication list).
   *
   * @param {string} frequency - The frequency string
   * @returns {string} - A short display label
   */
  const getFrequencyLabel = (frequency) => {
    const freq = frequency?.toLowerCase() || "";
    if (freq.includes("three")) return "3x daily";
    if (freq.includes("twice")) return "2x daily";
    if (freq.includes("as needed")) return "As needed";
    return "1x daily";
  };

  // Handle form submission
  const handleSubmit = async () => {
    setSaving(true);

    try {
      // Save profile to Firebase
      const profileRef = ref(database, `users/${user.uid}/profile`);

      const profileData = {
        fullName: formData.fullName,
        phone: formData.phone,
        dob: formData.dob,
        emergencyContact: formData.emergencyContact,
        emergencyContactPhone: formData.emergencyContactPhone,
        doctorName: formData.doctorName,
        doctorPhone: formData.doctorPhone,
        surgeryName: formData.surgeryName,
        surgeryPhone: formData.surgeryPhone,
        allergies: formData.allergies,
        accessibilityNeeds: formData.accessibilityNeeds,
        onboardingComplete: true,
        createdAt: new Date().toISOString(),
      };

      await set(profileRef, profileData);

      // If user entered medications, save them separately
      if (formData.medications.length > 0) {
        // Reference to user's medications collection
        const medsRef = ref(database, `users/${user.uid}/medications`);

        // Reference to user's reminders collection
        const remindersRef = ref(database, `users/${user.uid}/reminders`);

        // Loop through each medication and save it
        for (const med of formData.medications) {
          // ─── Save the medication ───
          const newMedRef = await push(medsRef, {
            name: med.name,
            dosage: med.dosage,
            frequency: med.frequency,
            timeSlot: med.timeSlot,
            time: med.time,
            notes: med.notes,
            createdAt: new Date().toISOString(),
          });

          // Get the new medication's unique ID (needed for linking reminders)
          const newMedId = newMedRef.key;
          console.log(`✅ Medication "${med.name}" saved with ID: ${newMedId}`);

          // ─── Create Reminders Based on Frequency ───
          // Determine reminder times based on the medication's frequency
          const freq = med.frequency.toLowerCase();
          let reminderTimes = [];

          if (freq.includes("three times")) {
            // Three times daily: morning, afternoon, evening
            reminderTimes = [
              { label: "Morning", time: med.morningTime || "08:00" },
              { label: "Afternoon", time: med.afternoonTime || "14:00" },
              { label: "Evening", time: med.eveningTime || "18:00" },
            ];
          } else if (freq.includes("twice")) {
            // Twice daily: morning and evening
            reminderTimes = [
              { label: "Morning", time: med.morningTime || "08:00" },
              { label: "Evening", time: med.eveningTime || "18:00" },
            ];
          } else if (freq.includes("as needed")) {
            // As needed: no automatic reminders (user decides when to take)
            reminderTimes = [];
          } else {
            // Once daily: use the specific time and slot from the form
            reminderTimes = [
              { label: med.timeSlot || "Daily", time: med.time || "08:00" },
            ];
          }

          // Create a reminder for each scheduled time
          for (const { label, time } of reminderTimes) {
            await push(remindersRef, {
              type: "medication",
              title: `Take ${med.name} (${med.dosage})`,
              time: time,
              days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], // Every day
              notes: med.notes || `${label} dose - ${med.frequency}`,
              enabled: true,
              linkedMedicationId: newMedId, // Link to medication for future cleanup
              createdAt: new Date().toISOString(),
            });
            console.log(
              `  ✅ Reminder created for ${med.name} at ${time} (${label})`,
            );
          }
        }

        console.log(
          `✅ All ${formData.medications.length} medications and reminders saved`,
        );
      }
      // Call the onComplete callback to move to the next step
      onComplete();
    } catch (error) {
      // Handle any errors that occur during saving
      console.error("Error saving onboarding data:", error);
      alert("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Navigation
  const nextStep = () => {
    if (step < totalSteps) setStep(step + 1);
  };

  const prevStep = () => {
    if (step > 1) setStep(step - 1);
  };

  // Check if current step is valid
  const isStepValid = () => {
    switch (step) {
      case 1:
        return formData.fullName.trim() !== "";
      case 2:
        return (
          formData.emergencyContact.trim() !== "" &&
          formData.emergencyContactPhone.trim() !== ""
        );
      case 3:
        return true; // Medical info is optional
      case 4:
        return true; // Accessibility is optional
      default:
        return true;
    }
  };

  return (
    <div className="onboarding-page">
      <div className="onboarding-card">
        {/* Header */}
        <div className="onboarding-header">
          <div className="onboarding-logo">🏥</div>
          <h1 className="onboarding-title">Welcome to MedFit Health</h1>
          <p className="onboarding-subtitle">
            Let's set up your health profile to get you started
          </p>
        </div>

        {/* Progress Bar */}
        <div className="onboarding-progress">
          <div className="progress-steps">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`progress-step ${s === step ? "active" : ""} ${s < step ? "completed" : ""}`}
              >
                {s < step ? "✓" : s}
              </div>
            ))}
          </div>
          <div className="progress-bar-bg">
            <div
              className="progress-bar-fill"
              style={{ width: `${((step - 1) / (totalSteps - 1)) * 100}%` }}
            ></div>
          </div>
          <div className="progress-labels">
            <span className={step === 1 ? "active" : ""}>Personal</span>
            <span className={step === 2 ? "active" : ""}>Emergency</span>
            <span className={step === 3 ? "active" : ""}>Medical</span>
            <span className={step === 4 ? "active" : ""}>Accessibility</span>
          </div>
        </div>

        {/* Step Content */}
        <div className="onboarding-content">
          {/* Step 1: Personal Information */}
          {step === 1 && (
            <div className="onboarding-step">
              <h2 className="step-title">👤 Personal Information</h2>
              <p className="step-description">Tell us a bit about yourself</p>
              {/* Full Name (Required) */}
              <div className="form-field">
                <label className="form-label">Full Name *</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="e.g., John Smith"
                  value={formData.fullName}
                  onChange={(e) => updateField("fullName", e.target.value)}
                />
              </div>
              {/* Phone Number (Optional) */}
              <div className="form-field">
                <label className="form-label">Phone Number</label>
                <input
                  className="form-input"
                  type="tel"
                  placeholder="e.g., +44 7700 900000"
                  value={formData.phone}
                  onChange={(e) => updateField("phone", e.target.value)}
                />
              </div>
              {/* Date of Birth (Optional) */}
              <div className="form-field">
                <label className="form-label">Date of Birth</label>
                <input
                  className="form-input"
                  type="date"
                  value={formData.dob}
                  onChange={(e) => updateField("dob", e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Step 2: Emergency Contact */}
          {step === 2 && (
            <div className="onboarding-step">
              <h2 className="step-title">🆘 Emergency Contact</h2>
              <p className="step-description">
                Who should we contact in case of an emergency?
              </p>
              {/* Emergency Contact Name (Required) */}
              <div className="form-field">
                <label className="form-label">Emergency Contact Name *</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="e.g., Jane Smith (Mother)"
                  value={formData.emergencyContact}
                  onChange={(e) =>
                    updateField("emergencyContact", e.target.value)
                  }
                />
              </div>
              {/* Emergency Contact Phone number (Required) */}
              <div className="form-field">
                <label className="form-label">Emergency Contact Phone *</label>
                <input
                  className="form-input"
                  type="tel"
                  placeholder="e.g., +44 7700 900001"
                  value={formData.emergencyContactPhone}
                  onChange={(e) =>
                    updateField("emergencyContactPhone", e.target.value)
                  }
                />
              </div>

              <div className="form-divider"></div>

              <h3 className="subsection-title">🩺 Doctor / Surgery Details</h3>

              <div className="form-row">
                <div className="form-field">
                  <label className="form-label">Doctor's Name</label>
                  <input
                    className="form-input"
                    type="text"
                    placeholder="e.g., Dr. Sarah Johnson"
                    value={formData.doctorName}
                    onChange={(e) => updateField("doctorName", e.target.value)}
                  />
                </div>

                <div className="form-field">
                  <label className="form-label">Doctor's Phone</label>
                  <input
                    className="form-input"
                    type="tel"
                    placeholder="e.g., +44 20 1234 5678"
                    value={formData.doctorPhone}
                    onChange={(e) => updateField("doctorPhone", e.target.value)}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-field">
                  <label className="form-label">Surgery/Clinic Name</label>
                  <input
                    className="form-input"
                    type="text"
                    placeholder="e.g., City Health Centre"
                    value={formData.surgeryName}
                    onChange={(e) => updateField("surgeryName", e.target.value)}
                  />
                </div>

                <div className="form-field">
                  <label className="form-label">Surgery Phone</label>
                  <input
                    className="form-input"
                    type="tel"
                    placeholder="e.g., +44 20 8765 4321"
                    value={formData.surgeryPhone}
                    onChange={(e) =>
                      updateField("surgeryPhone", e.target.value)
                    }
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Medical Information */}
          {step === 3 && (
            <div className="onboarding-step">
              <h2 className="step-title">💊 Medical Information</h2>
              <p className="step-description">
                Add your current medications (you can always update this later)
              </p>

              {/* ─── MEDICATIONS SECTION ─── */}
              <div className="form-field">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 12,
                  }}
                >
                  <label className="form-label" style={{ marginBottom: 0 }}>
                    Current Medications
                  </label>
                  <button
                    type="button"
                    onClick={openAddMedModal}
                    style={{
                      background: "#2563eb",
                      color: "white",
                      border: "none",
                      borderRadius: 8,
                      padding: "8px 16px",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    + Add Medication
                  </button>
                </div>

                {/* ─── MEDICATIONS LIST ─── */}
                {formData.medications.length === 0 ? (
                  // Empty state
                  <div
                    style={{
                      background: "#f8fafc",
                      border: "2px dashed #e2e8f0",
                      borderRadius: 12,
                      padding: 24,
                      textAlign: "center",
                      color: "#64748b",
                    }}
                  >
                    <div style={{ fontSize: 32, marginBottom: 8 }}>💊</div>
                    <p style={{ margin: 0 }}>No medications added yet</p>
                    <p style={{ margin: "8px 0 0", fontSize: 13 }}>
                      Click "Add Medication" to add your first medication
                    </p>
                  </div>
                ) : (
                  // Medications list
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 8 }}
                  >
                    {formData.medications.map((med, index) => (
                      <div
                        key={index}
                        style={{
                          background: "#f8fafc",
                          border: "2px solid #e2e8f0",
                          borderRadius: 10,
                          padding: "12px 16px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        {/* Medication info */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                          }}
                        >
                          <span style={{ fontSize: 24 }}>💊</span>
                          <div>
                            <div style={{ fontWeight: 600, color: "#1e293b" }}>
                              {med.name}
                            </div>
                            <div style={{ fontSize: 12, color: "#64748b" }}>
                              {med.dosage} • {getFrequencyLabel(med.frequency)}
                            </div>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div style={{ display: "flex", gap: 8 }}>
                          {/* Edit button */}
                          <button
                            type="button"
                            onClick={() => openEditMedModal(index)}
                            style={{
                              background: "#eff6ff",
                              border: "none",
                              borderRadius: 6,
                              padding: "6px 10px",
                              cursor: "pointer",
                              fontSize: 14,
                            }}
                            title="Edit medication"
                          >
                            ✏️
                          </button>
                          {/* Delete button */}
                          <button
                            type="button"
                            onClick={() => deleteMedication(index)}
                            style={{
                              background: "#fef2f2",
                              border: "none",
                              borderRadius: 6,
                              padding: "6px 10px",
                              cursor: "pointer",
                              fontSize: 14,
                            }}
                            title="Delete medication"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <p className="form-hint" style={{ marginTop: 12 }}>
                  💡 Reminders will be automatically created for each medication
                </p>
              </div>

              <div className="form-field">
                <label className="form-label">Allergies</label>
                <textarea
                  className="form-input form-textarea"
                  placeholder="List any allergies&#10;e.g., Penicillin, Peanuts, Latex"
                  value={formData.allergies}
                  onChange={(e) => updateField("allergies", e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}

          {/* Step 4: Accessibility */}
          {step === 4 && (
            <div className="onboarding-step">
              <h2 className="step-title">♿ Accessibility & Preferences</h2>
              <p className="step-description">
                Let us know how we can make the app work better for you
              </p>

              <div className="form-field">
                <label className="form-label">Accessibility Needs</label>
                <textarea
                  className="form-input form-textarea"
                  placeholder="Describe any accessibility requirements&#10;e.g., Large text, screen reader, high contrast, voice assistance"
                  value={formData.accessibilityNeeds}
                  onChange={(e) =>
                    updateField("accessibilityNeeds", e.target.value)
                  }
                  rows={4}
                />
              </div>

              <div className="onboarding-summary">
                <h3>✅ You're all set!</h3>
                <p>
                  Click "Complete Setup" to start using MedFit Health. You can
                  always update this information later in your Health Profile.
                </p>
                {formData.medications.length > 0 && (
                  <p style={{ color: "#166534", marginTop: 8 }}>
                    📋 {formData.medications.length} medication
                    {formData.medications.length > 1 ? "s" : ""} will be added
                    with reminders
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="onboarding-footer">
          {step > 1 && (
            <button className="onboarding-btn secondary" onClick={prevStep}>
              ← Back
            </button>
          )}

          <div className="step-indicator">
            Step {step} of {totalSteps}
          </div>

          {step < totalSteps ? (
            <button
              className="onboarding-btn primary"
              onClick={nextStep}
              disabled={!isStepValid()}
            >
              Next →
            </button>
          ) : (
            <button
              className="onboarding-btn primary"
              onClick={handleSubmit}
              disabled={saving}
            >
              {saving ? "Saving..." : "Complete Setup ✓"}
            </button>
          )}
        </div>
      </div>

      {/*ADD/EDIT MEDICATION MODAL */}
      {showMedModal && (
        <div
          className="modal-overlay"
          onClick={closeMedModal}
          style={{ zIndex: 10000 }}
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 500 }}
          >
            {/* Modal Header */}
            <div className="modal-header">
              <div>
                <h2>
                  {editingMedIndex >= 0 ? "Edit Medication" : "Add Medication"}
                </h2>
                <p className="modal-subtitle">
                  {editingMedIndex >= 0
                    ? "Update medication details"
                    : "Add a new medication to track"}
                </p>
              </div>
              <button className="modal-close" onClick={closeMedModal}>
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="modal-body">
              {/* Medication Name (Required) */}
              <label className="form-label">Medication Name *</label>
              <input
                className="form-input"
                placeholder="e.g., Aspirin"
                value={medName}
                onChange={(e) => setMedName(e.target.value)}
              />

              {/* Dosage and Frequency Row */}
              <div className="form-row" style={{ marginTop: 16 }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Dosage *</label>
                  <input
                    className="form-input"
                    placeholder="e.g., 100mg"
                    value={medDosage}
                    onChange={(e) => setMedDosage(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Frequency</label>
                  <select
                    className="form-input"
                    value={medFreq}
                    onChange={(e) => setMedFreq(e.target.value)}
                  >
                    <option value="Once daily">Once daily</option>
                    <option value="Twice daily">Twice daily</option>
                    <option value="Three times daily">Three times daily</option>
                    <option value="As needed">As needed</option>
                  </select>
                </div>
              </div>

              {/* Time Settings - changes based on frequency */}
              <div className="form-row" style={{ marginTop: 16 }}>
                {/* Once daily: show time slot and single time */}
                {!medFreq.toLowerCase().includes("twice") &&
                  !medFreq.toLowerCase().includes("three") && (
                    <>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label className="form-label">Time Slot</label>
                        <select
                          className="form-input"
                          value={medTimeSlot}
                          onChange={(e) => setMedTimeSlot(e.target.value)}
                        >
                          <option value="Morning">🌅 Morning</option>
                          <option value="Afternoon">☀️ Afternoon</option>
                          <option value="Evening">🌙 Evening</option>
                          <option value="Night">🌛 Night</option>
                        </select>
                      </div>

                      <div className="form-group" style={{ flex: 1 }}>
                        <label className="form-label">Time</label>
                        <input
                          type="time"
                          className="form-input"
                          value={medTime}
                          onChange={(e) => setMedTime(e.target.value)}
                        />
                      </div>
                    </>
                  )}

                {/* Twice daily: show morning and evening times */}
                {medFreq.toLowerCase().includes("twice") && (
                  <>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Morning Time</label>
                      <input
                        type="time"
                        className="form-input"
                        value={medMorningTime}
                        onChange={(e) => setMedMorningTime(e.target.value)}
                      />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Evening Time</label>
                      <input
                        type="time"
                        className="form-input"
                        value={medEveningTime}
                        onChange={(e) => setMedEveningTime(e.target.value)}
                      />
                    </div>
                  </>
                )}

                {/* Three times daily: show morning, afternoon, evening times */}
                {medFreq.toLowerCase().includes("three") && (
                  <>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Morning</label>
                      <input
                        type="time"
                        className="form-input"
                        value={medMorningTime}
                        onChange={(e) => setMedMorningTime(e.target.value)}
                      />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Afternoon</label>
                      <input
                        type="time"
                        className="form-input"
                        value={medAfternoonTime}
                        onChange={(e) => setMedAfternoonTime(e.target.value)}
                      />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Evening</label>
                      <input
                        type="time"
                        className="form-input"
                        value={medEveningTime}
                        onChange={(e) => setMedEveningTime(e.target.value)}
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Notes */}
              <div style={{ marginTop: 16 }}>
                <label className="form-label">Notes (Optional)</label>
                <textarea
                  className="form-input form-textarea"
                  placeholder="Additional instructions (e.g., take with food)"
                  value={medNotes}
                  onChange={(e) => setMedNotes(e.target.value)}
                  rows={2}
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="modal-footer">
              <button className="modal-cancel" onClick={closeMedModal}>
                Cancel
              </button>
              <button className="modal-submit" onClick={saveMedication}>
                {editingMedIndex >= 0 ? "Update Medication" : "Add Medication"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// MAIN APP COMPONENT
// Root component that manages authentication and routing between pages

export default function App() {
  // user - the currently logged-in user (null if not logged in)
  const [user, setUser] = useState(null);

  // loading - whether we're checking authentication status
  const [loading, setLoading] = useState(true);

  // medications - array of all medications for the current user
  const [medications, setMedications] = useState([]);

  const [reminders, setReminders] = useState([]);

  // User profile data (for emergency contact)
  const [userProfile, setUserProfile] = useState({});

  // Onboarding state - tracks if new user needs to complete setup
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);

  // activePage - which page to show (dashboard, medications, fitness, etc.)
  const [activePage, setActivePage] = useState("dashboard");

  // Voice enabled state - controls whether voice announcements are on/off
  // true = voice ON, false = voice OFF
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  // Large text mode for accessibility
  const [largeTextEnabled, setLargeTextEnabled] = useState(false);

  // High contrast mode for accessibility
  const [highContrastEnabled, setHighContrastEnabled] = useState(false);

  // Authentication Listener Effect

  // Listen for authentication state changes (login/logout)
  // This effect runs once when the app starts
  useEffect(() => {
    // onAuthStateChanged listens for login/logout events
    // It returns an unsubscribe function to clean up the listener
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      // Update user state with current logged-in user (or null)
      setUser(currentUser);

      // We're done checking auth status
      setLoading(false);
    });

    // Cleanup function - stops listening when component unmounts
    return () => unsubscribe();
  }, []); // Empty dependency array = run once on mount

  // Load user profile from Firebase when component mounts
  useEffect(() => {
    if (!user) {
      setUserProfile(null);
      return;
    }

    // Reference to user's profile data
    const profileRef = ref(database, `users/${user.uid}/profile`);

    // Listen for changes
    onValue(profileRef, (snapshot) => {
      // If profile exists, update state
      if (snapshot.val()) {
        setUserProfile(snapshot.val());
        setShowOnboarding(!snapshot.val().onboardingComplete);
      } else {
        setUserProfile({});
        setShowOnboarding(true);
      }
      setCheckingOnboarding(false);
    });
  }, [user]);

  // Load Medications Effect

  // Load all medications for the current user
  useEffect(() => {
    // If no user is logged in, clear medications
    if (!user) {
      setMedications([]);
      return;
    }

    // Create reference to user's medications in Firebase
    const medsRef = ref(database, `users/${user.uid}/medications`);

    // Listen for changes to medications in real-time
    onValue(medsRef, (snapshot) => {
      const data = snapshot.val();

      if (data) {
        // Convert Firebase object to array
        // Firebase stores data as: { id1: {name, time}, id2: {name, time} }
        // We convert to: [{ id: id1, name, time }, { id: id2, name, time }]
        const medsArray = Object.keys(data).map((key) => ({
          id: key,
          ...data[key],
        }));

        setMedications(medsArray);
      } else {
        // No medications found
        setMedications([]);
      }
    });
  }, [user]); // Re-run when user changes (login/logout)

  // ADD THIS ENTIRE useEffect: loads reminders from firebase
  useEffect(() => {
    // only run if user is logged in
    if (!user) {
      setReminders([]);
      return;
    }

    // reference to user's reminders in firebase
    const remindersRef = ref(database, `users/${user.uid}/reminders`);

    // listen for changes in real-time
    onValue(remindersRef, (snapshot) => {
      if (snapshot.val()) {
        // convert firebase object to array
        const data = Object.entries(snapshot.val()).map(([id, reminder]) => ({
          id,
          ...reminder,
        }));
        setReminders(data);
      } else {
        setReminders([]);
      }
    });
  }, [user]);

  // Load user profile from Firebase
  useEffect(() => {
    if (!user) {
      setUserProfile({});
      setShowOnboarding(false);
      setCheckingOnboarding(false);
      return;
    }

    setCheckingOnboarding(true);

    const profileRef = ref(database, `users/${user.uid}/profile`);

    /* onValue(profileRef, (snapshot) => {
      if (snapshot.val()) {
        setUserProfile(snapshot.val());
      } else {
        setUserProfile({});
      }
    }); */

    // IMPORTANT: capture unsubscribe so we don't leak listeners
    const unsubscribe = onValue(
      profileRef,
      (snapshot) => {
        const profile = snapshot.val();

        if (profile) {
          setUserProfile(profile);
          setShowOnboarding(!profile.onboardingComplete);
        } else {
          setUserProfile({});
          setShowOnboarding(true);
        }

        setCheckingOnboarding(false);
      },
      (error) => {
        console.log("Profile listener error:", error);
        setUserProfile({});
        setShowOnboarding(true);
        setCheckingOnboarding(false);
      },
    );

    return () => unsubscribe();
  }, [user]);

  // Loading State

  // While checking authentication, show loading message
  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          fontFamily: "sans-serif",
          color: "#64748b",
        }}
      >
        Loading...
      </div>
    );
  }

  if (user && checkingOnboarding) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          fontFamily: "sans-serif",
          color: "#64748b",
        }}
      >
        Loading...
      </div>
    );
  }

  // Not Logged In State

  // If no user is logged in, show the login/signup page
  if (!user) {
    return <Auth user={user} setUser={setUser} />;
  }

  // ─── Onboarding State ───────────────────────────────────────────────────────

  // If new user needs to complete onboarding
  if (showOnboarding) {
    return (
      <Onboarding user={user} onComplete={() => setShowOnboarding(false)} />
    );
  }

  // define pages object
  const pages = {
    dashboard: (
      <Dashboard
        user={user}
        userProfile={userProfile}
        medications={medications}
        setActivePage={setActivePage}
      />
    ),
    medications: (
      <Medications
        user={user}
        userProfile={userProfile}
        medications={medications}
        setActivePage={setActivePage}
        voiceEnabled={voiceEnabled}
        setVoiceEnabled={setVoiceEnabled}
      />
    ),
    fitness: <FitnessPage user={user} setActivePage={setActivePage} />,
    chat: (
      <Chat
        user={user}
        userProfile={userProfile}
        setActivePage={setActivePage}
        voiceEnabled={voiceEnabled}
        setVoiceEnabled={setVoiceEnabled}
      />
    ),
    profile: (
      <HealthProfile
        user={user}
        medications={medications}
        setActivePage={setActivePage}
        voiceEnabled={voiceEnabled}
      />
    ),
    emergency: (
      <Emergency
        user={user}
        medications={medications}
        setActivePage={setActivePage}
        userProfile={userProfile}
      />
    ),
    settings: (
      <Settings
        user={user}
        userProfile={userProfile}
        setActivePage={setActivePage}
        largeTextEnabled={largeTextEnabled}
        setLargeTextEnabled={setLargeTextEnabled}
        highContrastEnabled={highContrastEnabled}
        setHighContrastEnabled={setHighContrastEnabled}
      />
    ),
    measurements: (
      <Measurements
        user={user}
        userProfile={userProfile}
        setActivePage={setActivePage}
      />
    ),
    "measurements-reminders": (
      <Measurements
        user={user}
        userProfile={userProfile}
        setActivePage={setActivePage}
        initialTab="reminders"
      />
    ),
  };

  return (
    <div
      className={`app-root ${largeTextEnabled ? "large-text" : ""} ${highContrastEnabled ? "high-contrast" : ""}`}
    >
      {/* ADD THIS: notification manager component */}
      {/* passes user, medications, and reminders as props */}
      <NotificationManager
        user={user}
        medications={medications}
        reminders={reminders}
      />

      {/* your existing page routing */}
      {pages[activePage] || pages.dashboard}
    </div>
  );
}
