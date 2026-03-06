import React from "react";
import { createRoot } from "react-dom/client";
import App from "../Individual-Project---Health-and-Fitness-with-Medication-Reminders-App-main/src/App.jsx";
import "../Individual-Project---Health-and-Fitness-with-Medication-Reminders-App-main/src/App.css";
import "../Individual-Project---Health-and-Fitness-with-Medication-Reminders-App-main/src/index.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
