// Chat bot component
// This component provides a chatbot interface where users can ask health questions
// It uses pattern matching to provide relevant health information

import React, { useState, useEffect, useRef } from "react";

// Import Firebase for database operations
import { database } from "./firebase";
import { ref, push, onValue } from "firebase/database";

// Import speak function from parent App component
// We'll pass it via props instead

const speak = (text, isEnabled) => {
  if (!isEnabled) return;
  if (!window.speechSynthesis) {
    console.warn("Speech synthesis not supported");
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;
  utterance.lang = "en-GB";
  utterance.onerror = (e) => console.error("Speech error:", e);
  window.speechSynthesis.speak(utterance);
};

// ──────────────────────────────────────────────────────────────────────────────
// Chat Component Function
// Props:
//   - user: currently logged-in user object
//   - setActivePage: function to navigate to other pages
// ──────────────────────────────────────────────────────────────────────────────

function Chat({ user, setActivePage, voiceEnabled, setVoiceEnabled }) {
  // messages - array of all chat messages (user and assistant)
  // Starts with a welcome message from the assistant
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Hello! I'm your Smart Health Assistant. I can help you with general health questions, medication information, fitness advice, and more. How can I help you today?\n\n**Important:** I provide general health information only. Always consult a healthcare professional for medical advice.",
      timestamp: new Date().toISOString(),
    },
  ]);

  // input - stores what the user is currently typing
  const [input, setInput] = useState("");

  // loading - whether the bot is currently generating a response
  const [loading, setLoading] = useState(false);

  // userMedications - array of user's medications (for personalized responses)
  const [userMedications, setUserMedications] = useState([]);

  // userFitness - user's fitness data for today (for personalized responses)
  const [userFitness, setUserFitness] = useState(null);

  // messagesEndRef - reference to a div at the bottom of the chat
  // Used for auto-scrolling to newest messages
  const messagesEndRef = useRef(null);

  // Quick questions Array

  // Pre-defined questions users can click to ask quickly
  const quickQuestions = [
    { icon: "💊", text: "What are common side effects of paracetamol?" },
    { icon: "🏋️", text: "How much exercise should I do daily?" },
    { icon: "🍎", text: "What foods help lower blood pressure?" },
    { icon: "🌙", text: "How can I improve my sleep quality?" },
    { icon: "🩺", text: "When should I see a doctor for a headache?" },
  ];

  // Whenever messages change, scroll to the bottom to show newest message
  useEffect(() => {
    // scrollIntoView is a browser API that scrolls an element into view
    // behavior: 'smooth' creates an animated scroll
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]); // Re-run whenever messages array changes

  // Load user's medications from Firebase
  // This allows the chatbot to give personalized medication advice
  useEffect(() => {
    if (!user) return;

    // Reference to user's medications in Firebase
    const medsRef = ref(database, `users/${user.uid}/medications`);

    // Listen for changes in real-time
    onValue(medsRef, (snapshot) => {
      const data = snapshot.val();

      if (data) {
        // Convert Firebase object to array
        // We only need the medication data
        setUserMedications(Object.keys(data).map((key) => data[key]));
      }
    });
  }, [user]);

  // Load user's fitness data for today
  // This allows the chatbot to give personalized fitness feedback
  useEffect(() => {
    if (!user) return;

    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split("T")[0];

    // Reference to today's fitness data
    const fitnessRef = ref(database, `users/${user.uid}/fitness/${today}`);

    // Listen for changes
    onValue(fitnessRef, (snapshot) => {
      setUserFitness(snapshot.val());
    });
  }, [user]);

  // Function to generate response

  // This function takes user input and generates an appropriate response
  // It uses pattern matching to detect what the user is asking about
  const generateResponse = (userInput) => {
    // Convert input to lowercase for easier matching
    const input = userInput.toLowerCase();

    // Check for specific medications

    // Get array of medication names the user has
    const userMedNames = userMedications.map((m) => m.name.toLowerCase());

    // Check if user mentioned any of their medications
    const mentionedMed = userMedNames.find((medName) =>
      input.includes(medName),
    );

    if (mentionedMed) {
      // Find the full medication object
      const med = userMedications.find(
        (m) => m.name.toLowerCase() === mentionedMed,
      );

      // Return personalized advice about this specific medication
      return `You have ${med.name} scheduled at ${med.time}.\n\nGeneral tips for taking ${med.name}:\n• Take it at the same time every day\n• Set a phone alarm if you often forget\n• Don't skip doses without consulting your doctor\n• Store in a cool, dry place\n\n⚠️ Always follow your doctor's specific instructions.`;
    }

    // Paracetamol

    if (input.includes("paracetamol") || input.includes("side effect")) {
      return "Common side effects of paracetamol include:\n\n• Nausea or upset stomach (rare at normal doses)\n• Allergic reactions (rash, swelling) - rare\n• Liver damage if taken in excess\n\n✅ At recommended doses (max 4g/day for adults), paracetamol is very well tolerated.\n\n⚠️ Never exceed the recommended dose. Avoid alcohol while taking it. Consult your doctor if you're unsure.";
    }

    // Exercise/fitness

    if (
      input.includes("exercise") ||
      input.includes("workout") ||
      input.includes("fitness")
    ) {
      // Build response with WHO recommendations + user's personal stats
      let response =
        "For adults, WHO recommends:\n\n🏃 **Cardio:** 150-300 minutes of moderate activity per week (e.g. brisk walking) OR 75-150 minutes vigorous activity (e.g. running)\n\n💪 **Strength training:** At least 2 days per week\n\n📈 Your stats today:\n";

      // Add user's actual fitness data if available
      if (userFitness) {
        response += `• Steps: ${userFitness.steps || 0}\n• Activities: ${(userFitness.activities || []).length}`;
      } else {
        response += "• No activity logged yet";
      }

      response +=
        "\n\n⚠️ Always consult your doctor before starting a new exercise regime.";
      return response;
    }

    // Blood pressure

    if (input.includes("blood pressure") || input.includes("foods")) {
      return "Foods that help lower blood pressure:\n\n🥬 **Potassium-rich foods:** Bananas, sweet potatoes, spinach\n🐟 **Omega-3s:** Salmon, mackerel, sardines\n🫐 **Berries:** Blueberries, strawberries (flavonoids)\n🥛 **Low-fat dairy:** Source of calcium\n🌰 **Nuts:** Especially almonds and walnuts\n🧄 **Garlic:** Natural vasodilator\n\n❌ **Reduce:** Salt, processed foods, alcohol, caffeine\n\n⚠️ If you have hypertension, follow your doctor's dietary advice.";
    }

    // Sleep

    if (input.includes("sleep")) {
      return "Tips to improve sleep quality:\n\n😴 **Sleep hygiene:**\n• Keep a consistent sleep schedule\n• Aim for 7-9 hours per night\n• Avoid screens 1 hour before bed\n• Keep bedroom cool and dark\n\n☕ **Avoid:** Caffeine after 2pm, heavy meals before bed, alcohol\n\n🧘 **Wind-down routine:** Reading, gentle stretching, meditation\n\n💊 If on medications, check if they affect sleep - ask your pharmacist.\n\n⚠️ If you have persistent insomnia, consult your GP.";
    }

    // Headache

    if (input.includes("headache")) {
      return "When to see a doctor for a headache:\n\n🚨 **Go to A&E immediately if:**\n• Sudden severe 'thunderclap' headache\n• Headache with stiff neck, fever, rash\n• After a head injury\n• With confusion or vision loss\n\n📞 **See your GP if:**\n• Headaches are frequent or worsening\n• Don't respond to painkillers\n• Affect daily life regularly\n\n✅ **Self-care for mild headaches:**\n• Stay hydrated, rest, paracetamol/ibuprofen as directed\n\n⚠️ Always seek urgent help for sudden severe headache.";
    }

    // General medication questions

    if (
      input.includes("medication") ||
      input.includes("medicine") ||
      input.includes("meds")
    ) {
      if (userMedications.length > 0) {
        // Show user's personal medication list
        return `💊 Your current medications:\n${userMedications.map((m) => `• ${m.name} at ${m.time}`).join("\n")}\n\nRemember to take them on time and consult your doctor with any concerns.`;
      }

      // No medications added yet
      return "You haven't added any medications yet. Go to the 💊 Medications tab to add them!";
    }

    // Water/hydration

    if (input.includes("water") || input.includes("hydration")) {
      // Get user's water intake for today
      const glasses = userFitness?.water || 0;

      return `💧 You've had ${glasses} glasses of water today.\n\nAim for 8 glasses (2 litres) per day. Staying hydrated improves energy, focus, and helps medications work effectively.`;
    }

    // Health Summary

    if (
      input.includes("how am i") ||
      input.includes("summary") ||
      input.includes("progress")
    ) {
      let response = "📊 Your health summary today:\n\n";

      // Add medications count
      if (userMedications.length > 0) {
        response += `💊 Medications: ${userMedications.length} tracked\n`;
      }

      // Add fitness stats if available
      if (userFitness) {
        response += `👟 Steps: ${userFitness.steps || 0}\n💧 Water: ${userFitness.water || 0} glasses\n`;
      }

      response +=
        "\nKeep up the great work! ⚠️ Always consult healthcare professionals for personalised advice.";
      return response;
    }

    // Greetings

    if (input.match(/^(hi|hello|hey|sup)\b/)) {
      return "Hello! 👋 I'm your Smart Health Assistant. Ask me about:\n• Your medication schedule\n• Fitness and exercise tips\n• Nutrition and diet\n• Sleep and stress management\n• When to see a doctor\n\nWhat would you like to know?";
    }

    // Default response (when nothing matches)

    return "That's a great question! I can help with:\n\n💊 Medications & side effects\n🏃 Fitness & exercise\n🥗 Nutrition & diet\n😴 Sleep improvement\n💧 Hydration\n🩺 When to see a doctor\n\nCould you rephrase your question? Type 'help' to see everything I can do.\n\n⚠️ I provide general information only. Always consult healthcare professionals for medical advice.";
  };

  // This function is called when user sends a message
  // text parameter: the message to send (can come from input or quick question)
  const sendMessage = async (text) => {
    // Use provided text or fall back to current input value
    const msgText = text || input;

    // Don't send empty messages or if already loading
    if (!msgText.trim() || loading) return;

    // Add user message to chat

    // Create user message object
    const userMsg = {
      role: "user",
      content: msgText,
      timestamp: new Date().toISOString(),
    };

    // Add to messages array
    setMessages((prev) => [...prev, userMsg]);

    // Clear input field
    setInput("");

    // Set loading state (shows "Thinking..." message)
    setLoading(true);

    // Generate AI response
    setTimeout(() => {
      // Generate response based on user's message
      const aiContent = generateResponse(msgText);

      // Create assistant message object
      const aiMsg = {
        role: "assistant",
        content: aiContent,
        timestamp: new Date().toISOString(),
      };

      // Add to messages array
      setMessages((prev) => [...prev, aiMsg]);

      // Voice (read response aloud)
      // Clean up the text for better speech
      const cleanText = aiContent
        .replace(/\*\*/g, "") // Remove markdown bold
        .replace(/\n\n/g, ". ") // Convert double newlines to periods
        .replace(/\n/g, ", ") // Convert single newlines to commas
        .replace(/•/g, ""); // Remove bullet points

      // Speak the response
      speak(cleanText, voiceEnabled);

      // Clear loading state
      setLoading(false);
    }, 800); // 800ms delay to make it feel more natural
  };

  // keyboard handler

  // This function handles keyboard events in the input field
  // Allows user to press Enter to send message (without Shift)
  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      // newline
      e.preventDefault();
      // Send the message
      sendMessage();
    }
    // If Shift+Enter newline is allowed
  };

  // Render chat UI

  return (
    <div className="page">
      <div className="page-header-bar">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Back button to dashboard */}
          <button
            className="back-btn"
            onClick={() => setActivePage("dashboard")}
          >
            ←
          </button>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 20 }}>🤖</span>
              <h1 className="page-title-main">Health Assistant</h1>
            </div>
            <p className="page-subtitle">Your Personal Healthcare Companion</p>
          </div>
        </div>
      </div>

      {/* Voice toggle button */}
      <button
        className="voice-btn"
        onClick={() => {
          // Toggle voice state
          const newVoiceState = !voiceEnabled;
          setVoiceEnabled(newVoiceState);
          // Stop playing any speech
          if (!newVoiceState) {
            // If turning voice OFF stop all speech
            window.speechSynthesis.cancel();
          }

          // Announce the change only if turning ON
          if (newVoiceState) {
            speak("Voice assistance enabled", newVoiceState);
          }
        }}
      >
        🔊 Voice {voiceEnabled ? "ON" : "OFF"}
      </button>

      {/* Chat layout (Sidebar + Main chat) */}
      <div className="chat-page">
        {/* Left sidebar with quick questions */}
        <div className="chat-sidebar">
          <div className="chat-sidebar-title">Quick Questions</div>

          {/* Map over quick questions array to create buttons */}
          {quickQuestions.map((question, index) => (
            <button
              key={index}
              className="quick-q-btn"
              onClick={() => sendMessage(question.text)} // Send this question when clicked
            >
              <span>{question.icon}</span>
              <span>{question.text}</span>
            </button>
          ))}
        </div>

        {/* Main Chat */}
        <div className="chat-main">
          {/* Chat title */}
          <div className="chat-main-title">Smart Health Chat</div>

          {/* Messages container */}
          <div className="chat-messages">
            {/* display all messages */}
            {messages.map((msg, index) => (
              <div key={index} className={`chat-msg ${msg.role}`}>
                {/* Different bubble styles for user vs assistant */}
                {msg.role === "user" ? (
                  // User message bubble (right-aligned, blue)
                  <div className="chat-bubble-user">{msg.content}</div>
                ) : (
                  // Assistant message bubble (left-aligned, grey)
                  // whiteSpace: 'pre-wrap' preserves line breaks in the text
                  <div
                    className="chat-bubble-ai"
                    style={{ whiteSpace: "pre-wrap" }}
                  >
                    {msg.content}
                  </div>
                )}
              </div>
            ))}

            {/* Show "Thinking..." message while loading */}
            {loading && (
              <div className="chat-msg">
                <div className="chat-bubble-ai">
                  <em>Thinking...</em>
                </div>
              </div>
            )}

            {/* Invisible div at the bottom for auto-scrolling */}
            <div ref={messagesEndRef} />
          </div>

          {/* Input row */}
          <div className="chat-input-row">
            {/* Text input field */}
            <input
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)} // Update state
              onKeyPress={handleKey} // Handle Enter key
              placeholder="Type your health question..."
              disabled={loading} // Disable while its responding
            />

            {/* Send button */}
            <button
              className="chat-send-btn"
              onClick={() => sendMessage()} // Send message on click
              disabled={loading} // Disable while loading
            >
              ➤
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Chat;

// ══════════════════════════════════════════════════════════════════════════════
// HOW THIS COMPONENT WORKS - STEP BY STEP
// ══════════════════════════════════════════════════════════════════════════════
//
// 1. COMPONENT INITIALIZATION
//    - Component loads with welcome message already in messages array
//    - Loads user's medications and fitness data from Firebase
//    - Displays sidebar with quick questions
//
// 2. USER TYPES A MESSAGE
//    - Input value updates as they type (controlled component)
//    - User presses Enter or clicks Send button
//    - sendMessage function is called
//
// 3. MESSAGE PROCESSING
//    - User message is added to messages array (shows in chat immediately)
//    - Input field is cleared
//    - Loading state is set to true (shows "Thinking...")
//
// 4. AI RESPONSE GENERATION
//    - generateResponse function analyzes user input
//    - Uses pattern matching (if/else) to determine topic
//    - Checks user's personal data (medications, fitness) for personalization
//    - Returns appropriate response text
//
// 5. DISPLAYING RESPONSE
//    - After 800ms delay, AI message is added to messages array
//    - Loading state set to false (removes "Thinking...")
//    - Auto-scroll effect runs to show new message
//
// 6. QUICK QUESTIONS
//    - User can click any quick question button
//    - Sends that question text directly (same as typing it)
//
// ══════════════════════════════════════════════════════════════════════════════
