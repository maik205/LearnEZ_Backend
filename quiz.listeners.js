

import { getApp } from "firebase/app";
import { Socket } from "socket.io";
import { addDoc, collection, doc, DocumentReference, getDoc, getFirestore } from "firebase/firestore";
/**
 * 
 * @param {Socket} Give me the fkcing socket to initializeee
 */
export function initializeQuizListeners(socket) {
    const firestore = getFirestore();

    socket.on("quiz-begin",
        /**
         * when this is called, the server creates a new quizzing attempt and sends the first question to the client. 
         * while also calling functions to generate the next quiz item nodes.
         * @param {string} referenceMaterialId 
         * @param {string} initialQuery 
         * @param {(question: import("./genkit-fns/src/types/quiz.d.ts").MultipleChoiceQuestion, docRef: DocumentReference) => void} callback 
         */
        async (referenceMaterialId, initialQuery, callback) => {
            const firstQuestion = getQuestionData(referenceMaterialId, []);
            const firstQuestionAttemptData = {
                question: firstQuestion,
                index: 0,

            }
            const collection = collection(getFirestore(), "quizzes")
            const attemptDoc = await addDoc(collection,
                {
                    userId: socket.handshake.auth.user.uid,
                    startedAt: Date.now(),
                    attemptData: [firstQuestion]
                });
            callback(firstQuestion, attemptDoc);
        })
    socket.on("record-answer",
        /**
         * This records the answer of the attempt and publish it to firestore for realtime upddates./
         * @param {string} attemptId 
         * @param {import("./genkit-fns/src/types/quiz.d.ts").MultipleChoiceQuestion} question 
         * @param {} callback 
         */
        async (attemptId, question, callback) => {
            const attemptDoc = doc(firestore, `quizzes/${attemptId}`);
            const attemptDocData = (await getDoc(attemptDoc)).data();
            const questionReference = attemptDocData.attemptData.find((val, indx) => {
                return question.question == val
            });

        });
    socket.on("get-quiz-data", async (attemptId, callback) => {
        callback(await getDoc(firestore, doc(firestore, `$quizzes/${attemptId}`)));
    });
}


/**
 * 
 * @param {string[]} previousQuestions Previous questions strings for LLM to avoid repeating itself.
 * @param {string} referenceMaterialId Reference material ID to ground LLM content generation.
 * @param {string} initialQuery The user's initial query or grounding material vect DB search result.
 * @returns {import("./genkit-fns/src/types/quiz.d.ts").MultipleChoiceQuestion} Returns a question object
 */
function getQuestionData(referenceMaterialId, previousQuestions = [], initialQuery) {
    return undefined;
}

