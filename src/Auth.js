// Import React and the useState hook for managing component state
import React, { useState } from "react";

// Import Firebase authentication functions
import { auth } from "./firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";

export default Auth;
