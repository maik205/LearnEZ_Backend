import { initializeApp } from "firebase/app";
import { firebaseConfig } from "./environment.d.js";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { firebaseAuthMiddleware } from "./auth.middleware.js";
import { initializeQuizListeners } from "./quiz.listeners.js";
import { getFunctions } from "firebase/functions";

// eslint-disable-next-line no-unused-vars
const firebase = initializeApp(firebaseConfig);



const app = express();
const server = createServer(app);
const io = new Server(server);
export const fireFunctions = getFunctions();
io.use(firebaseAuthMiddleware);

io.on('connection', (socket) => {
    initializeQuizListeners(socket);
});

