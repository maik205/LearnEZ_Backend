

import { Socket } from "socket.io";
/**
 * 
 * @param {Socket} socket 
 */
export function initializeQuizListeners(socket) {
    //when this is called, the server creates a new quizzing attempt and sends the first question to the client. while also calling functions to generate the next quiz item nodes.
    socket.on("quiz-begin", (roadmapId, milestoneIndex, checkpointIndex, callback) => {

    })
    socket.on("record-answer", (attemptId, question, callback) => {

    });
    socket.on("get-quiz-data", (attemptId) => {
        
    });
}