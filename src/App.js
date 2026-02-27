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

// Dashboard Component
// This is the main home page users see when they log in
// Shows overview of health stats, water intake, charts, and quick action buttons

function Dashboard({ user, medications, setActivePage }) {
  // State Variables

  // fitness - stores today's fitness data (steps, water, activities)
  const [fitness, setFitness] = useState(null);

  // Track which medications have been taken today
  // This is the same state we use in the Medications page
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

  // Calculate REAL medication adherence statistics

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

  // Mock Data for Weekly Steps Chart

  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const mockSteps = [0, 0, 0, 0, 0, 0, steps || 0];
  const maxSteps = Math.max(...mockSteps, 1);

  // Calculate donut chart values

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
          <span className="header-user">Logged in as {userName}</span>
          <button className="bell-btn" title="Notifications">
            🔔
          </button>
          <button className="logout-btn" onClick={() => signOut(auth)}>
            <span>↪</span> Logout
          </button>
        </div>
      </div>

      {/* WELCOME BANNER */}
      <div className="welcome-banner">
        <div>
          <h2>
            Welcome back, {userName.charAt(0).toUpperCase() + userName.slice(1)}
            !
          </h2>
          <p>Here's your health overview for today</p>
        </div>
      </div>

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
            label: "Total Workouts",
            value: activities.length,
            sub: "This month",
            color: "#fff7ed",
          },
          {
            icon: "👟",
            label: "Steps Today",
            value: steps.toLocaleString() || "8,542",
            sub: "Goal: 10,000",
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
        {/* ─── WEEKLY STEPS BAR CHART ─── */}
        <div className="card-white chart-card">
          <h3 className="section-title">Weekly Steps</h3>

          <div className="bar-chart">
            {mockSteps.map((stepCount, index) => (
              <div className="bar-col" key={index}>
                <div
                  className="bar-fill"
                  style={{ height: `${(stepCount / maxSteps) * 140}px` }}
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
            sub: "Track your workouts",
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

function Medications({
  user,
  medications,
  setActivePage,
  voiceEnabled,
  setVoiceEnabled,
}) {
  // State Variables

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

  // Clean up takenMeds when medications change
  // This effect runs whenever the medications array changes
  // It removes any takenMeds entries for medications that no longer exist
  /*useEffect(() => {
    if (!user || !medications.length || !Object.keys(takenMeds).length) return;

    // Build a set of all valid dose keys
    const validDoseKeys = new Set();

    medications.forEach((med) => {
      const doseTimes = getDoseTimes(med.frequency);
      doseTimes.forEach((slot) => {
        const doseKey = `${med.id}_${slot}`;
        validDoseKeys.add(doseKey);
      });
    });

    // Find dose keys that don't match any current medication
    const takenKeys = Object.keys(takenMeds);
    const orphanedKeys = takenKeys.filter((key) => {
      if (key === "_initialized") return false;
      return !validDoseKeys.has(key);
    });

    // Clean up
    if (orphanedKeys.length > 0) {
      console.log(
        "Cleaning up deleted medications from takenMeds:",
        orphanedKeys,
      );

      const takenRef = ref(database, `users/${user.uid}/takenMeds/${today}`);
      const updates = {};
      orphanedKeys.forEach((key) => {
        updates[key] = null;
      });

      update(takenRef, updates);

      setTakenMeds((prev) => {
        const newTakenMeds = { ...prev };
        orphanedKeys.forEach((key) => {
          delete newTakenMeds[key];
        });
        return newTakenMeds;
      });
    }
  }, [medications, user, today]); */

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
  // FUNCTION: Mark Medication Dose as Taken
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
      // ═══ STEP 8: Error handling ═══
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

  // ─── Calculate Progress Statistics

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
            {/* ─── Modal Header ─── */}
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

// Page for tracking workouts and viewing fitness statistics
// Shows workout cards, summary stats, and step counter
function FitnessPage({ user, setActivePage }) {

  // fitness - stores today's fitness data
  const [fitness, setFitness] = useState({
    steps: 0,
    water: 0,
    activities: [],
  });

  // Controls whether the "Add Workout" form is visible
  const [showAddWorkout, setShowAddWorkout] = useState(false);

  // Form fields for adding a new workout
  const [workoutName, setWorkoutName] = useState("");
  const [workoutCount, setWorkoutCount] = useState(""); // Number of reps/steps
  const [workoutDuration, setWorkoutDuration] = useState(""); // Minutes

  // Get today's date
  const today = new Date().toISOString().split("T")[0];

  // Get username for display
  const userName = user.email.split("@")[0];

  // Load Fitness Data Effect

  // Load today's fitness data from Firebase when component mounts
  useEffect(() => {
    if (!user) return;

    // Reference to today's fitness data
    const fitnessRef = ref(database, `users/${user.uid}/fitness/${today}`);

    // Listen for changes and update state
    onValue(fitnessRef, (snapshot) => {
      if (snapshot.val()) setFitness(snapshot.val());
    });
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
    if (!workoutName) return;

    // Reference to today's fitness data
    const fitnessRef = ref(database, `users/${user.uid}/fitness/${today}`);

    // Create new activity object
    const newActivity = {
      type: workoutName,
      count: parseInt(workoutCount) || 0,
      duration: parseInt(workoutDuration) || 0,
      timestamp: new Date().toISOString(),
    };

    // Add to existing activities array
    const newActivities = [...activities, newActivity];

    // Update Firebase
    await update(fitnessRef, { activities: newActivities });

    // Reset form and hide it
    setShowAddWorkout(false);
    setWorkoutName("");
    setWorkoutCount("");
    setWorkoutDuration("");
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
  };

  // Get Workout Icon Helper Function

  // Function to determine which emoji icon to show based on workout name
  const getIcon = (name) => {
    const lowerName = name.toLowerCase();

    // Match keywords to appropriate icons
    if (lowerName.includes("run")) return "📈";
    if (lowerName.includes("walk")) return "👟";
    if (lowerName.includes("jump")) return "🏃";
    if (lowerName.includes("squat")) return "🏋️";
    if (lowerName.includes("yoga")) return "🧘";

    // Default icon for unrecognized workouts
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
            <p className="page-subtitle">Track your daily workouts</p>
          </div>
        </div>
        <span className="header-user">{userName}</span>
      </div>

      {/* STEPS BANNER with gradient background */}
      <div className="steps-banner">
        <div>
          <div className="steps-label">TOTAL STEPS TODAY</div>
          {/* Display total steps with comma separator for readability */}
          <div className="steps-value">{totalSteps.toLocaleString()}</div>
          <div className="steps-sub">
            {activities.length} of {activities.length} workouts completed
          </div>
        </div>

        {/* Decorative shoe icon */}
        <div className="steps-icon">👟</div>
      </div>

      {/* WORKOUTS SECTION HEADER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          margin: "24px 0 16px",
        }}
      >
        <h2 className="section-title-lg">Your Workouts</h2>

        {/* Button to toggle the add workout form */}
        <button
          className="add-med-btn"
          onClick={() => setShowAddWorkout(!showAddWorkout)}
        >
          + Create Template
        </button>
      </div>

      {/* ADD WORKOUT FORM (conditionally shown) */}
      {showAddWorkout && (
        <div className="card-white" style={{ marginBottom: 16 }}>
          <h3 className="section-title">Add Workout</h3>

          {/* Form row with inputs */}
          <div className="form-row">
            <input
              className="form-input"
              placeholder="Workout name (e.g. Morning Walk)"
              value={workoutName}
              onChange={(e) => setWorkoutName(e.target.value)}
            />
            <input
              className="form-input"
              type="number"
              placeholder="Count (steps/reps)"
              value={workoutCount}
              onChange={(e) => setWorkoutCount(e.target.value)}
            />
            <input
              className="form-input"
              type="number"
              placeholder="Duration (mins)"
              value={workoutDuration}
              onChange={(e) => setWorkoutDuration(e.target.value)}
            />
            <button className="add-med-btn" onClick={addWorkout}>
              Add
            </button>
          </div>
        </div>
      )}

      {/* WORKOUTS LIST */}
      {activities.length === 0 ? (
        // Empty state if no workouts
        <div className="empty-state">
          <div style={{ fontSize: 56 }}>🏃</div>
          <p>No workouts yet. Add your first workout!</p>
        </div>
      ) : (
        // Grid of workout cards
        <div className="workout-cards-grid">
          {activities.map((activity, index) => (
            <div className="workout-card" key={index}>
              {/* Workout Card Header */}
              <div className="workout-card-top">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {/* Icon based on workout type */}
                  <span style={{ fontSize: 22 }}>{getIcon(activity.type)}</span>
                  <div>
                    <div className="workout-name">{activity.type}</div>
                    <div className="editable-tag">Editable</div>
                  </div>
                </div>
              </div>

              {/* Workout Stats (Count and Duration) */}
              <div className="workout-stats">
                {/* Count stat with blue background */}
                <div className="workout-stat blue-bg">
                  <div className="workout-stat-label">COUNT</div>
                  <div className="workout-stat-value blue">
                    {activity.count || 0}
                  </div>
                </div>

                {/* Duration stat with green background */}
                <div className="workout-stat green-bg">
                  <div className="workout-stat-label">DURATION</div>
                  <div className="workout-stat-value green">
                    {activity.duration || 0} min
                  </div>
                </div>
              </div>

              {/* Last Updated */}
              <div className="workout-last-updated">Last updated: Today</div>

              {/* Action Buttons */}
              <div className="workout-actions">
                <button className="workout-action-btn flex-1">✏️ Edit</button>
                <button className="workout-action-btn">🕐 History</button>
                <button
                  className="workout-delete-btn"
                  onClick={() => deleteWorkout(index)}
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SUMMARY STATISTICS */}
      <h2 className="section-title-lg" style={{ marginTop: 32 }}>
        Summary
      </h2>

      {/* Grid of 4 summary cards */}
      <div className="summary-grid">
        {[
          {
            icon: "🏋️",
            value: activities.length,
            label: "Workouts",
            color: "#f97316",
          },
          {
            icon: "👟",
            value: totalSteps.toLocaleString(),
            label: "Total Steps",
            color: "#3b82f6",
          },
          {
            icon: "⏱️",
            value: totalMins,
            label: "Total Minutes",
            color: "#22c55e",
          },
          { icon: "🔥", value: calories, label: "Calories", color: "#ef4444" },
        ].map((stat, index) => (
          <div className="summary-card" key={index}>
            <div style={{ fontSize: 28, color: stat.color }}>{stat.icon}</div>
            <div className="summary-value">{stat.value}</div>
            <div className="summary-label">{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
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
