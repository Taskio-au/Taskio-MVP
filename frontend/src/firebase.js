// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAVmOP2j8VIMHWRz9o49JHKqyiszQ5qMOg",
  authDomain: "taskio-v2.firebaseapp.com",
  projectId: "taskio-v2",
  storageBucket: "taskio-v2.firebasestorage.app",
  messagingSenderId: "848916998874",
  appId: "1:848916998874:web:718d57c9621cb15461d3e3"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export the auth service
export const auth = getAuth(app);