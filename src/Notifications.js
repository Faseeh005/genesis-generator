// asks the user for permission to show notifications
// returns true if granted, false if denied
export const requestNotificationPermission = async () => {
  console.log("Requesting notification permission...");
  // check if browser supports notifications at all
  if (!("Notification" in window)) {
    console.log("This browser does not support notifications");
    alert("Your browser doesn't support notifications");
    return false;
  }

  console.log("Current permission:", Notification.permission);

  // if user already gave permission, return true
  if (Notification.permission === "granted") {
    console.log("Permission already granted");
    return true;
  }

  // if user hasn't decided yet, ask them
  if (Notification.permission !== "denied") {
    console.log("Asking user for permission...");
    const permission = await Notification.requestPermission();
    console.log("User response:", permission);
    return permission === "granted";
  }

  // user previously blocked notifications
  console.log("Permission denied");
  alert("Notifications are blocked. Please enable them.");
  return false;
};

// displays a notification with title and options
// title = main text shown (e.g., "Medication Reminder")
// options = additional settings like body text, icon, etc.
export const showNotification = (title, options = {}) => {
  console.log("🔔 Attempting to show notification:", title);
  console.log("Permission status:", Notification.permission);

  if (Notification.permission !== "granted") {
    console.log("❌ No permission to show notification");
    alert("Please enable notifications first!");
    return null;
  }
  // create the notification
  try {
    const notification = new Notification(title, {
      icon: "/logo192.png", // app icon
      badge: "/logo192.png", // small icon on Android
      vibrate: [200, 100, 200], // vibration pattern: vibrate 200ms, pause 100ms, vibrate 200ms
      requireInteraction: false,
      ...options, // merge in any custom options
    });

    console.log("Notification created successfully");

    // when user clicks notification, focus the app window
    notification.onclick = () => {
      console.log("Notification clicked");
      window.focus();
      notification.close();
    };

    notification.onerror = (error) => {
      console.error("Notification error:", error);
    };

    return notification;
  } catch (error) {
    console.error("Error creating notification:", error);
    alert("Error showing notification: " + error.message);
    return null;
  }
};

// schedules a notification to show at a specific time
// title = notification title
// body = notification message
// scheduledTime = time in "HH:MM" format (e.g., "14:30")
export const scheduleNotification = (title, body, scheduledTime) => {
  console.log(`📅 Scheduling notification: "${title}" for ${scheduledTime}`);

  const now = new Date();
  const scheduled = new Date();

  // parse the time string into hours and minutes
  const [hours, minutes] = scheduledTime.split(":");
  scheduled.setHours(parseInt(hours), parseInt(minutes), 0, 0);

  console.log("Current time:", now.toLocaleTimeString());
  console.log("Scheduled time:", scheduled.toLocaleTimeString());

  // if the time already passed today, schedule for tomorrow
  if (scheduled <= now) {
    console.log("⏭️ Time already passed, scheduling for tomorrow");
    scheduled.setDate(scheduled.getDate() + 1);
  }

  // calculate milliseconds until notification should show
  const timeUntil = scheduled - now;
  const minutesUntil = Math.floor(timeUntil / 60000);

  console.log(`⏰ Will show in ${minutesUntil} minutes (${timeUntil}ms)`);

  // set a timer to show notification at the right time
  const timeoutId = setTimeout(() => {
    console.log(`🔔 Showing scheduled notification: "${title}"`);
    showNotification(title, {
      body: body,
      tag: `reminder-${Date.now()}`, // unique ID for this notification
    });
  }, timeUntil);

  return timeoutId;
};
