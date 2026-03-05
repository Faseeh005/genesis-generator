import React, { useState, useEffect, useRef } from "react";

// Import Firebase for database operations
import { database } from "./firebase";
import { ref, onValue } from "firebase/database";

// Speech is provided by App.jsx through props to keep one stable implementation

// ──────────────────────────────────────────────────────────────────────────────
// Chat Component Function
// Props:
//   - user: currently logged-in user object
//   - setActivePage: function to navigate to other pages
// ──────────────────────────────────────────────────────────────────────────────

function Chat({ user, setActivePage, voiceEnabled, setVoiceEnabled, onSpeak, onStopSpeech }) {
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

    // Medications (NHS advice)

    // Paracetamol

    if (input.includes("paracetamol") && input.includes("side effect")) {
      return "Common side effects of paracetamol include:\n\n• Nausea or upset stomach (rare at normal doses)\n• Allergic reactions (rash, swelling) - rare\n• Liver damage if taken in excess\n\n✅ At recommended doses (max 4g/day for adults), paracetamol is very well tolerated.\n\n⚠️ Never exceed the recommended dose. Avoid alcohol while taking it. Consult your doctor if you're unsure.";
    }

    if (input.match(/paracetamol|acetaminophen/)) {
      return `💊 **Paracetamol** (NHS)\n\n✅ For: Pain, fever\n💊 Adults: 1-2 tablets (500mg-1g) every 4-6 hours\n⚠️ Max: 4g (8 tablets) in 24 hours\n\n**Don't:** Exceed dose, mix with other paracetamol products, drink too much alcohol\n\n🔗 nhs.uk/medicines/paracetamol-for-adults`;
    }

    if (input.match(/ibuprofen|nurofen|advil/)) {
      return `💊 **Ibuprofen** (NHS)\n\n✅ For: Pain, inflammation, fever\n💊 Adults: 200-400mg every 4-6 hours\n⚠️ Max: 1200mg in 24 hours\n\n**Take with food.** Avoid if: stomach ulcers, asthma, heart problems, late pregnancy.\n\n🔗 nhs.uk/medicines/ibuprofen-for-adults`;
    }

    if (input.match(/aspirin/)) {
      return `💊 **Aspirin** (NHS)\n\n✅ For: Pain, fever, preventing blood clots\n💊 Pain: 300-600mg every 4-6 hours (max 4g/day)\n💊 Heart: 75mg daily (prescribed only)\n\n⚠️ Not for under 16s. Take with food.\n\n🔗 nhs.uk/medicines/aspirin-for-pain-relief`;
    }

    if (input.match(/codeine|co-codamol/)) {
      return `💊 **Codeine** (NHS)\n\n✅ For: Moderate pain, dry cough\n⚠️ Causes: Constipation, drowsiness\n⚠️ Don't drive or drink alcohol\n⚠️ Use max 3 days - can be addictive\n\n🔗 nhs.uk/medicines/codeine`;
    }

    if (input.match(/amoxicillin|antibiotic/)) {
      return `💊 **Amoxicillin** (NHS)\n\n✅ For: Bacterial infections\n💊 Complete the full course\n⚠️ May cause: Diarrhoea, thrush\n⚠️ Tell doctor if allergic to penicillin\n\nAntibiotics don't work for colds/flu.\n\n🔗 nhs.uk/medicines/amoxicillin`;
    }

    if (input.match(/metformin/)) {
      return `💊 **Metformin** (NHS)\n\n✅ For: Type 2 diabetes\n💊 Take with meals to reduce sickness\n⚠️ May cause: Stomach upset, diarrhoea (usually settles)\n⚠️ Don't drink lots of alcohol\n\n🔗 nhs.uk/medicines/metformin`;
    }

    if (input.match(/lisinopril|ramipril|ace inhibitor/)) {
      return `💊 **ACE Inhibitors** (NHS)\n\n✅ For: High blood pressure, heart failure\n⚠️ Common: Dry cough\n⚠️ May cause: Dizziness when standing\n⚠️ Don't take if pregnant\n\n🔗 nhs.uk/medicines/lisinopril`;
    }

    if (input.match(/amlodipine/)) {
      return `💊 **Amlodipine** (NHS)\n\n✅ For: High blood pressure, angina\n⚠️ May cause: Swollen ankles, flushing, headaches\n⚠️ Don't drink grapefruit juice\n\n🔗 nhs.uk/medicines/amlodipine`;
    }

    if (input.match(/omeprazole|lansoprazole/)) {
      return `💊 **Omeprazole** (NHS)\n\n✅ For: Acid reflux, heartburn, stomach ulcers\n💊 Take 30-60 mins before food\n💊 Swallow whole with water\n⚠️ Not usually for long-term use\n\n🔗 nhs.uk/medicines/omeprazole`;
    }

    if (input.match(/statin|atorvastatin|simvastatin/)) {
      return `💊 **Statins** (NHS)\n\n✅ For: High cholesterol, preventing heart disease\n💊 Usually taken at night\n⚠️ Report unexplained muscle pain\n⚠️ Avoid grapefruit juice (some statins)\n\n🔗 nhs.uk/medicines/atorvastatin`;
    }

    if (input.match(/levothyroxine|thyroxine/)) {
      return `💊 **Levothyroxine** (NHS)\n\n✅ For: Underactive thyroid\n💊 Take before breakfast on empty stomach\n⚠️ Don't take with calcium/iron (4hr gap)\n⚠️ Regular blood tests needed\n\n🔗 nhs.uk/medicines/levothyroxine`;
    }

    if (input.match(/inhaler|salbutamol|ventolin/)) {
      return `💊 **Salbutamol Inhaler** (NHS)\n\n✅ For: Asthma relief\n🔵 Blue = Reliever (when needed)\n🟤 Brown = Preventer (daily)\n\n⚠️ If using blue inhaler 3+ times/week, see GP\n\n🔗 nhs.uk/medicines/salbutamol-inhaler`;
    }

    if (input.match(/antihistamine|cetirizine|loratadine|piriton|hayfever/)) {
      return `💊 **Antihistamines** (NHS)\n\n✅ For: Allergies, hay fever, itching\n💊 Non-drowsy: Cetirizine, loratadine (daytime)\n💊 Drowsy: Chlorphenamine/Piriton (can help sleep)\n\n🔗 nhs.uk/medicines/cetirizine`;
    }

    if (input.match(/antidepressant|sertraline|citalopram|fluoxetine/)) {
      return `💊 **Antidepressants** (NHS)\n\n✅ For: Depression, anxiety\n⚠️ Takes 2-4 weeks to work\n⚠️ Don't stop suddenly\n⚠️ May feel worse before better\n\n🔗 nhs.uk/medicines/sertraline`;
    }

    if (input.match(/sleeping tablet|zopiclone/)) {
      return `💊 **Zopiclone** (NHS)\n\n✅ For: Short-term insomnia (2-4 weeks)\n⚠️ Causes drowsiness - don't drive\n⚠️ Can be addictive\n⚠️ No alcohol\n\n🔗 nhs.uk/medicines/zopiclone`;
    }

    if (input.match(/can i take|taking together|drug interaction/)) {
      return `💊 **Taking medicines together** (NHS)\n\n✅ Paracetamol + Ibuprofen: OK\n❌ Ibuprofen + Aspirin: Avoid\n\nAlways check with pharmacist. Read leaflets.\n\n🔗 nhs.uk/common-health-questions/medicines`;
    }

    if (input.match(/side effect/)) {
      return `💊 **Side effects** (NHS)\n\nMost side effects are mild and temporary.\n\n**See doctor if:** Severe, won't go away, or allergic reaction (rash, swelling, breathing problems)\n\n🔗 nhs.uk/conditions/side-effects-of-medicines`;
    }

    if (input.match(/medication|medicine|my meds|my tablets/)) {
      if (userMedications.length > 0) {
        let response = `💊 **Your Medications:**\n\n`;
        userMedications.forEach((m) => {
          response += `• ${m.name} - ${m.time || "time not set"}\n`;
        });
        response += `\n🔗 nhs.uk/medicines for info on each`;
        return response;
      }
      return `💊 No medications added yet.\n\nAdd them in **Medications** page.\n\n🔗 nhs.uk/medicines`;
    }

    // ═══ HEALTH CONDITIONS (NHS Conditions A-Z) ═══

    if (input.match(/diabetes|diabetic|blood sugar/)) {
      return `🩺 **Diabetes** (NHS)\n\n**Symptoms:** Thirsty, peeing more, tired, blurred vision, losing weight\n\n**Manage it:**\n• Healthy diet\n• Regular exercise\n• Take prescribed meds\n• Regular check-ups\n\n🔗 nhs.uk/conditions/diabetes`;
    }

    if (input.match(/blood pressure|hypertension/)) {
      return `🩺 **High Blood Pressure** (NHS)\n\n**Healthy:** Below 120/80\n**High:** 140/90 or more\n\n**Lower it:** Less salt, more fruit & veg, exercise, healthy weight, less alcohol\n\n🔗 nhs.uk/conditions/high-blood-pressure-hypertension`;
    }

    if (input.match(/asthma|wheezing/)) {
      return `🩺 **Asthma** (NHS)\n\n**Symptoms:** Wheezing, breathlessness, tight chest, coughing\n\n**Manage it:**\n• Use preventer inhaler daily\n• Carry reliever always\n• Know your triggers\n\n🚨 999 if can't speak, blue lips, reliever not helping\n\n🔗 nhs.uk/conditions/asthma`;
    }

    if (input.match(/anxiety|anxious|panic|worried/)) {
      return `💙 **Anxiety** (NHS)\n\n**Symptoms:** Worry, restlessness, fast heartbeat, sleep problems\n\n**Helps:** Exercise, breathing exercises, less caffeine, talking therapies\n\n📞 NHS anxiety support: 111\n\n🔗 nhs.uk/mental-health/conditions/generalised-anxiety-disorder`;
    }

    if (input.match(/depression|depressed|low mood/)) {
      return `💙 **Depression** (NHS)\n\n**Symptoms:** Low mood, no interest, tired, sleep problems, hopelessness\n\n**Helps:** Stay active, connect with people, talk to GP, talking therapies\n\n📞 Samaritans: 116 123\n\n🔗 nhs.uk/mental-health/conditions/depression-in-adults`;
    }

    if (input.match(/headache|migraine/)) {
      return `🤕 **Headaches** (NHS)\n\n**Self-care:** Rest, drink water, paracetamol/ibuprofen\n\n🚨 **999 if:** Sudden severe, with stiff neck/fever/rash, after head injury, confusion\n\n📅 **GP if:** Frequent or worsening\n\n🔗 nhs.uk/conditions/headaches`;
    }

    if (input.match(/arthritis|joint pain/)) {
      return `🩺 **Arthritis** (NHS)\n\n**Types:** Osteoarthritis (wear & tear), Rheumatoid (autoimmune)\n\n**Helps:** Keep active, healthy weight, paracetamol, hot/cold packs, physio\n\n🔗 nhs.uk/conditions/arthritis`;
    }

    if (input.match(/cold|flu|sore throat|runny nose|cough/)) {
      return `🤧 **Cold & Flu** (NHS)\n\n**Self-care:** Rest, fluids, paracetamol for aches, honey for cough (not under 1)\n\n**See GP if:** Lasts 3+ weeks, high fever won't drop, breathing problems\n\n🔗 nhs.uk/conditions/common-cold`;
    }

    if (input.match(/back pain|backache/)) {
      return `🩺 **Back Pain** (NHS)\n\n**Self-care:** Keep moving (bed rest makes it worse), paracetamol/ibuprofen, hot/cold packs\n\n🚨 **999 if:** Numbness in groin, bladder problems, leg weakness\n\n🔗 nhs.uk/conditions/back-pain`;
    }

    if (input.match(/eczema|dry skin|itchy skin/)) {
      return `🩺 **Eczema** (NHS)\n\n**Self-care:**\n• Moisturise often (emollients)\n• Avoid triggers\n• Don't scratch\n• Steroid creams if needed\n\n🔗 nhs.uk/conditions/atopic-eczema`;
    }

    if (input.match(/hay fever|pollen|allergies/)) {
      return `🤧 **Hay Fever** (NHS)\n\n**Self-care:**\n• Antihistamines\n• Steroid nasal spray\n• Vaseline around nostrils\n• Sunglasses outside\n• Shower after being outside\n\n🔗 nhs.uk/conditions/hay-fever`;
    }

    if (input.match(/constipation|can't poo|hard stool/)) {
      return `🩺 **Constipation** (NHS)\n\n**Self-care:**\n• Drink plenty of fluids\n• Eat more fibre (fruit, veg, wholegrain)\n• Exercise regularly\n• Don't ignore the urge\n\nTry laxatives from pharmacy if needed.\n\n🔗 nhs.uk/conditions/constipation`;
    }

    if (input.match(/diarrhoea|diarrhea|loose stool|runny poo/)) {
      return `🩺 **Diarrhoea** (NHS)\n\n**Self-care:**\n• Drink lots of fluids\n• Eat when able\n• Rest\n\n**See GP if:** Blood in poo, lasts 7+ days, severe pain, signs of dehydration\n\n🔗 nhs.uk/conditions/diarrhoea`;
    }

    if (input.match(/uti|urine infection|cystitis|burning pee/)) {
      return `🩺 **UTI/Cystitis** (NHS)\n\n**Symptoms:** Pain when peeing, needing to pee often, cloudy urine\n\n**Self-care:** Drink plenty of water, paracetamol for pain\n\n**See GP if:** Symptoms don't improve in 3 days, blood in urine, pregnant\n\n🔗 nhs.uk/conditions/urinary-tract-infections-utis`;
    }

    if (input.match(/heartburn|acid reflux|indigestion|gerd/)) {
      return `🩺 **Heartburn** (NHS)\n\n**Self-care:**\n• Smaller meals\n• Don't eat late at night\n• Raise head of bed\n• Avoid triggers (spicy, fatty)\n• Antacids from pharmacy\n\n🔗 nhs.uk/conditions/heartburn-and-acid-reflux`;
    }

    if (input.match(/dizziness|dizzy|vertigo|lightheaded/)) {
      return `🩺 **Dizziness** (NHS)\n\n**Self-care:** Lie down, move slowly, stay hydrated, avoid caffeine/alcohol\n\n🚨 **999 if:** Chest pain, face drooping, arm weakness, fainting\n\n📅 **GP if:** Keeps happening or affects daily life\n\n🔗 nhs.uk/conditions/dizziness`;
    }

    if (input.match(/tiredness|fatigue|always tired|no energy/)) {
      return `🩺 **Tiredness** (NHS)\n\n**Common causes:** Poor sleep, stress, not enough exercise, poor diet, illness\n\n**Try:** Better sleep routine, regular exercise, balanced diet, less alcohol\n\n📅 **GP if:** Lasts 4+ weeks despite changes\n\n🔗 nhs.uk/conditions/tiredness-and-fatigue`;
    }

    // ═══ NUTRITION (NHS Eat Well) ═══

    if (input.match(/food.*blood pressure|lower.*pressure.*food|dash diet/)) {
      return `🥗 **Foods for Blood Pressure** (NHS)\n\n✅ **Eat more:** Fruit, veg, whole grains, fish, nuts\n❌ **Eat less:** Salt (max 6g/day), processed food, alcohol\n\n🔗 nhs.uk/conditions/high-blood-pressure-hypertension/prevention`;
    }

    if (input.match(/healthy eating|balanced diet|nutrition|eat well/)) {
      return `🥗 **Healthy Eating** (NHS Eatwell Guide)\n\n• 5+ fruit & veg daily\n• Base meals on starchy carbs (wholegrain)\n• Some protein (beans, fish, eggs, meat)\n• Some dairy\n• 6-8 glasses of fluid\n• Less saturated fat, sugar, salt\n\n🔗 nhs.uk/live-well/eat-well`;
    }

    if (input.match(/lose weight|weight loss|diet|calories/)) {
      return `⚖️ **Weight Loss** (NHS)\n\n• Safe loss: 0.5-1kg per week\n• Eat less, move more\n• Smaller portions\n• Less sugary/fatty foods\n• Check portion sizes\n\n🔗 nhs.uk/live-well/healthy-weight`;
    }

    if (input.match(/vitamin d/)) {
      return `💊 **Vitamin D** (NHS)\n\n✅ Needed for: Bones, teeth, muscles\n☀️ Source: Sunlight (Mar-Sept UK)\n💊 Consider 10mcg supplement Oct-March\n\n🔗 nhs.uk/conditions/vitamins-and-minerals/vitamin-d`;
    }

    if (input.match(/vitamin|supplement/)) {
      return `💊 **Vitamins** (NHS)\n\nMost people get enough from varied diet.\n\n**Consider:**\n• Vitamin D: Oct-March (everyone)\n• Folic acid: If pregnant/trying\n• B12: If vegan\n\n🔗 nhs.uk/conditions/vitamins-and-minerals`;
    }

    if (input.match(/iron|anaemia|anemia/)) {
      return `💊 **Iron** (NHS)\n\n**Sources:** Red meat, beans, nuts, dried fruit, fortified cereals\n\n**Tip:** Vitamin C helps absorption. Tea/coffee reduce it.\n\n**Symptoms of low iron:** Tiredness, pale skin, breathlessness\n\n🔗 nhs.uk/conditions/iron-deficiency-anaemia`;
    }

    if (input.match(/alcohol|drinking|units/)) {
      return `🍺 **Alcohol** (NHS)\n\n**Limit:** 14 units/week (men & women)\n**Spread over 3+ days**\n\n1 unit = half pint beer, small wine, single spirit\n\n🔗 nhs.uk/live-well/alcohol-advice`;
    }

    if (input.match(/sugar|sweet|reduce sugar/)) {
      return `🍬 **Sugar** (NHS)\n\n**Limit:** 30g free sugars/day (7 teaspoons)\n\n**Tips:** Check labels, swap sugary drinks for water, fewer sweets/biscuits\n\n🔗 nhs.uk/live-well/eat-well/how-to-cut-down-on-sugar-in-your-diet`;
    }

    if (input.match(/salt|sodium/)) {
      return `🧂 **Salt** (NHS)\n\n**Max:** 6g/day (1 teaspoon)\n\n**Tips:** Check labels, cook from scratch, use herbs instead, avoid processed food\n\n🔗 nhs.uk/live-well/eat-well/salt-nutrition`;
    }

    // ═══ FITNESS (NHS Live Well) ═══

    if (input.match(/exercise|workout|fitness|physical activity/)) {
      let response = `🏃 **Exercise** (NHS)\n\n**Adults should do:**\n• 150 mins moderate activity/week OR\n• 75 mins vigorous activity/week\n• Strength exercises 2 days/week\n\n`;
      if (userFitness) {
        response += `**Today:** ${userFitness.steps || 0} steps\n\n`;
      }
      response += `🔗 nhs.uk/live-well/exercise`;
      return response;
    }

    if (input.match(/start exercise|beginner|new to exercise/)) {
      return `🏃 **Starting Exercise** (NHS)\n\n• Start slowly, build up gradually\n• Walking is a great start\n• Find something you enjoy\n• Any activity is better than none\n\n🔗 nhs.uk/live-well/exercise/exercise-guidelines`;
    }

    if (input.match(/chair exercise|elderly exercise|gentle exercise/)) {
      return `🪑 **Exercise for Older Adults** (NHS)\n\n• Aim to be active daily\n• Include balance, strength, flexibility\n• Walking, swimming, tai chi, yoga\n• Reduce sitting time\n\n🔗 nhs.uk/live-well/exercise/exercise-guidelines/physical-activity-guidelines-older-adults`;
    }

    if (input.match(/steps|walking|10000 steps/)) {
      const steps = userFitness?.steps || 0;
      return `👟 **Walking** (NHS)\n\nYour steps today: ${steps.toLocaleString()}\n\nBrisk walking counts as moderate exercise. Aim for 150 mins/week.\n\n🔗 nhs.uk/live-well/exercise/walking-for-health`;
    }

    if (input.match(/strength|muscle|weight training/)) {
      return `💪 **Strength Exercises** (NHS)\n\n**Do at least 2 days/week**\n\nExamples: Weights, resistance bands, push-ups, yoga, heavy gardening\n\n🔗 nhs.uk/live-well/exercise/strength-and-flexibility-exercises`;
    }

    // ═══ SLEEP (NHS) ═══

    if (input.match(/sleep|insomnia|can't sleep|tired/)) {
      return `😴 **Sleep** (NHS)\n\n**Adults need:** 7-9 hours\n\n**Tips:**\n• Same sleep/wake time daily\n• Wind down before bed\n• Dark, quiet, cool room\n• Avoid screens, caffeine, alcohol before bed\n\n🔗 nhs.uk/live-well/sleep-and-tiredness`;
    }

    // ═══ MENTAL HEALTH (NHS) ═══

    if (input.match(/stress|stressed|overwhelmed/)) {
      return `💙 **Stress** (NHS)\n\n**Signs:** Anxiety, irritability, sleep problems, headaches\n\n**Helps:** Exercise, breathing, talking, breaks, saying no\n\n📞 Samaritans: 116 123\n\n🔗 nhs.uk/mental-health/feelings-symptoms-behaviours/feelings-and-symptoms/stress`;
    }

    if (input.match(/mental health|wellbeing/)) {
      return `💙 **Mental Health** (NHS)\n\n**5 ways to wellbeing:**\n• Connect with others\n• Be physically active\n• Learn new skills\n• Give to others\n• Be mindful\n\n📞 NHS: 111 (press 2 for mental health)\n\n🔗 nhs.uk/mental-health`;
    }

    // ═══ HYDRATION ═══

    if (input.match(/water|hydration|dehydrated|drink/)) {
      const glasses = userFitness?.water || 0;
      return `💧 **Fluids** (NHS)\n\nToday: ${glasses} glasses\nAim: 6-8 glasses daily\n\nIncludes: Water, tea, coffee, milk. Limit sugary drinks.\n\n🔗 nhs.uk/live-well/eat-well/water-drinks-nutrition`;
    }

    // ═══ WHEN TO GET HELP (NHS) ═══

    if (input.match(/when.*doctor|should i see.*doctor|need doctor|nhs 111/)) {
      return `🩺 **When to Get Help** (NHS)\n\n🚨 **999:** Life-threatening emergency\n📞 **111:** Urgent, not emergency\n📅 **GP:** Non-urgent, within days\n🏥 **Pharmacy:** Minor ailments, advice\n\n🔗 nhs.uk/nhs-services`;
    }

    if (input.match(/a&e|emergency department|casualty/)) {
      return `🏥 **A&E** (NHS)\n\n**Go for:**\n• Loss of consciousness\n• Severe breathing problems\n• Severe bleeding\n• Chest pain\n• Stroke symptoms\n• Severe injuries\n\nFor non-emergencies, call 111 first.\n\n🔗 nhs.uk/nhs-services/urgent-and-emergency-care-services`;
    }

    // ═══ HEALTH SUMMARY ═══

    if (input.match(/how am i|summary|progress|my health/)) {
      let response = `📊 **Your Summary**\n\n`;
      response += `💊 Medications: ${userMedications.length}\n`;
      if (userFitness) {
        response += `👟 Steps: ${userFitness.steps || 0}\n`;
        response += `🏃 Exercises: ${(userFitness.activities || []).length}\n`;
        response += `💧 Water: ${userFitness.water || 0} glasses`;
      }
      response += `\n\n🔗 nhs.uk/live-well for health tips`;
      return response;
    }

    // ═══ GREETINGS ═══

    if (
      input.match(/^(hi|hello|hey|good morning|good afternoon|good evening)\b/)
    ) {
      return `Hello! 👋 I'm your Health Assistant.\n\nI use NHS guidance to help with:\n💊 Medications\n🩺 Health conditions\n🥗 Nutrition\n🏃 Fitness\n😴 Sleep\n💙 Mental health\n\nWhat can I help with?`;
    }

    if (input.match(/thank|thanks|cheers/)) {
      return `You're welcome! 😊\n\nFor more info, visit nhs.uk\n\nAnything else?`;
    }

    if (input.match(/bye|goodbye|see you/)) {
      return `Take care! 👋\n\nFor health info, visit nhs.uk\n\n🚨 Emergency? Call 999\n📞 Urgent? Call 111`;
    }

    if (input.match(/help|what can you do/)) {
      return `🤖 **I can help with:**\n\n💊 Medications - "Tell me about ibuprofen"\n🩺 Conditions - "What is diabetes?"\n🥗 Nutrition - "Healthy eating tips"\n🏃 Fitness - "Exercise guidelines"\n😴 Sleep - "Sleep tips"\n💙 Mental health - "Feeling stressed"\n\nAll info based on NHS guidance.\n\n🔗 nhs.uk`;
    }

    // ═══ COVID ═══

    if (input.match(/covid|coronavirus|covid-19/)) {
      return `🦠 **COVID-19** (NHS)\n\n**Symptoms:** High temp, new cough, loss of taste/smell\n\n**If unwell:** Rest, fluids, paracetamol if needed\n\n**Vaccines available** - check eligibility\n\n🔗 nhs.uk/conditions/covid-19`;
    }

    // ═══ PREGNANCY ═══

    if (input.match(/pregnant|pregnancy|expecting/)) {
      return `🤰 **Pregnancy** (NHS)\n\n**Important:**\n• Take folic acid (first 12 weeks)\n• Book midwife appointment\n• Avoid alcohol, smoking\n• Check food safety\n\n🔗 nhs.uk/pregnancy`;
    }

    // ═══ SMOKING ═══

    if (input.match(/smoking|quit smoking|stop smoking|cigarette/)) {
      return `🚭 **Stop Smoking** (NHS)\n\n**Free help:**\n📞 Smokefree helpline: 0300 123 1044\n💊 NRT available from pharmacy\n📱 NHS Quit Smoking app\n\n🔗 nhs.uk/live-well/quit-smoking`;
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

      // Voice (read response aloud) - first 200 chars max
      const cleanText = aiContent
        .replace(/\*\*/g, "") // Remove markdown bold
        .replace(/\n\n/g, ". ") // Convert double newlines to periods
        .replace(/\n/g, ", ") // Convert single newlines to commas
        .replace(/•/g, "") // Remove bullet points
        .replace(/[🔗📞🚨📅🩺💊🏃🥗😴💧⚠️✅❌💙🤧🤕💪🪑👟⚖️🍬🧂🦠🤰🚭🔵🟤☀️☕🧘🌬️]/g, ""); // Remove emojis

      // Limit to first 200 characters to avoid reading huge messages
      const truncated = cleanText.length > 200
        ? cleanText.substring(0, 200).replace(/,\s*$/, "") + "."
        : cleanText;

      // Speak the response
      onSpeak?.(truncated, voiceEnabled);

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
              <h1 className="page-title-main">Smart Health Assistant</h1>
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
            onStopSpeech?.();
          }

          // Announce the change only if turning ON
          if (newVoiceState) {
            onSpeak?.("Voice assistance enabled", newVoiceState);
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
