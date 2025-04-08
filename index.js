const { initializeApp } = require("firebase/app");
const { firebaseConfig } = require("./environment.d");

const app = initializeApp(firebaseConfig);
// Index JS is used for setting up and testing.