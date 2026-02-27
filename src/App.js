import React, { useState, useEffect } from "react";

import "./App.css";

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

// Our custom components
import Auth from "./Auth"; // Login/signup page
import Chat from "./Chat"; // AI chat assistant
import {
  requestNotificationPermission,
  showNotification,
  scheduleNotification,
} from "./Notifications";

// Voice Assistant Function
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

  // Create a new speech utterance (the text to be spoken)
  const utterance = new SpeechSynthesisUtterance(text);

  // Configure speech properties
  utterance.rate = 1.0; // Speed: 1.0 = normal, 0.5 = slow, 2.0 = fast
  utterance.pitch = 1.0; // Pitch: 1.0 = normal, 0.5 = low, 2.0 = high
  utterance.volume = 1.0; // Volume: 0.0 to 1.0 (max)
  utterance.lang = "en-GB"; // British English accent

  // Error handling
  utterance.onerror = (event) => {
    console.error("Speech synthesis error:", event);
  };

  // Speak the text!
  window.speechSynthesis.speak(utterance);
};

// Function for Measurements page
function Measurements({ user, setActivePage }) {
  const [activeTab, setActiveTab] = useState("log");
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

function Dashboard({ user, medications, setActivePage }) {
  // fitness - stores today's fitness data (steps, water, activities)
  const [fitness, setFitness] = useState(null);

  // Track which medications have been taken today
  const [takenMeds, setTakenMeds] = useState({});

  // Hover state for donut chart tooltip 
  const [hoveredSegment, setHoveredSegment] = useState(null); // 'taken', 'pending', or null

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
  const steps = fitness?.steps || 0;
  const water = fitness?.water || 0;
  const waterMl = water * 250;
  const waterGoal = 2000;
  const waterPct = Math.min(100, Math.round((waterMl / waterGoal) * 100));
  const activities = fitness?.activities || [];
  const totalMins = activities.reduce(
    (sum, activity) => sum + (activity.duration || 0),
    0,
  );
  const calories = Math.round(totalMins * 5.5);

  // Calculate real medication adherence statistics

  // Get today's date
  const today = new Date().toISOString().split("T")[0];

  // Count how many medications have been marked as taken
  const takenCount = Object.values(takenMeds).filter(Boolean).length;

  // Total number of medications
  const totalMeds = medications.length;

  // Count pending (not taken yet)
  const pendingCount = totalMeds - takenCount;

  // Calculate percentages for the donut chart
  // If no medications, show 0% taken
  const takenPercentage = totalMeds > 0 ? (takenCount / totalMeds) * 100 : 0;
  const pendingPercentage =
    totalMeds > 0 ? (pendingCount / totalMeds) * 100 : 100;

  // ─── Load Fitness Data Effect ───────────────────────────────────────────────

  useEffect(() => {
    if (!user) return;

    const today = new Date().toISOString().split("T")[0];
    const fitnessRef = ref(database, `users/${user.uid}/fitness/${today}`);

    onValue(fitnessRef, (snapshot) => {
      setFitness(snapshot.val());
    });
  }, [user]);

  // Load which medications have been marked as taken today
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

}

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

}

export default function App() {

  // user - the currently logged-in user (null if not logged in)
  const [user, setUser] = useState(null);

  // checking authentication status
  const [loading, setLoading] = useState(true);

  // array of all medications for the current user
  const [medications, setMedications] = useState([]);

  const [reminders, setReminders] = useState([]);

  // chooses which page to show (dashboard, medications, ...)
  const [activePage, setActivePage] = useState("dashboard");

  // controls whether voice announcements are on/off
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
}
