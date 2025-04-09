const { initializeApp } = require("firebase/app");
const { firebaseConfig } = require("./environment.d");

const firebase = initializeApp(firebaseConfig);

const express = require('express');
const { createServer } = require('node:http');
const { join } = require('node:path');
const { Server } = require('socket.io');
const { firebaseAuthMiddleware } = require("./auth.middleware");
const { initializeQuizListeners } = require("./quiz.listeners");


const app = express();
const server = createServer(app);
const io = new Server(server);

io.use(firebaseAuthMiddleware);

io.on('connection', (socket) => {
    initializeQuizListeners(socket);
    
});

