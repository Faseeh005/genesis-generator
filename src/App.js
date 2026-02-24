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
