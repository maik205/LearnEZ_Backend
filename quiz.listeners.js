

import { getApp } from "firebase/app";
import { Socket } from "socket.io";
import { addDoc, collection, getFirestore } from "firebase/firestore";
/**
 * 
 * @param {Socket} Give me the fkcing socket to initializeee
 */
export function initializeQuizListeners(socket) {
    const firebaseApp = getApp();

    socket.on("quiz-begin",
        /**
         * when this is called, the server creates a new quizzing attempt and sends the first question to the client. 
         * while also calling functions to generate the next quiz item nodes.
         * @param {string} referenceMaterialId 
         * @param {string} initialQuery 
         * @param {*} callback 
         */
        async (referenceMaterialId, initialQuery, callback) => {
            const collection = collection(getFirestore(), "quizzes")
            const attemptDoc = addDoc(collection, {
                userId: socket.handshake.auth.user.uid,
                startedAt: Date.now(),
                attemptData: []
            });

        })
    socket.on("record-answer", async (attemptId, question, callback) => {

    });
    socket.on("get-quiz-data", async (attemptId) => {

    });
}


/**
 * 
 * @param {string[]} previousQuestions Previous questions strings for LLM to avoid repeating itself.
 * @param {string} referenceMaterialId Reference material ID to ground LLM content generation.
 * @returns {import("./genkit-fns/src/types/quiz.d.ts").GenericQuestion} Returns a question object
 */
function getQuestionData(referenceMaterialId, previousQuestions = []) {
    return undefined;
}