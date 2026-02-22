import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyDljJKaPiA9S5DLLtb1yUMp6oKutoPYbN0",
  authDomain: "medfit-health-app.firebaseapp.com",
  projectId: "medfit-health-app",
  storageBucket: "medfit-health-app.firebasestorage.app",
  messagingSenderId: "257682947478",
  appId: "1:257682947478:web:b5d681b7eba5d472ef31b7",
  databaseURL: "https://medfit-health-app-default-rtdb.europe-west1.firebasedatabase.app"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const database = getDatabase(app);
