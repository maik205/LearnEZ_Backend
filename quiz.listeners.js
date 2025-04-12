

// eslint-disable-next-line no-unused-vars
import { Socket } from "socket.io";
import { addDoc, doc, getDoc, getFirestore, setDoc } from "firebase/firestore";
import { fireFunctions } from "./index.js";
import { httpsCallable } from "firebase/functions";
import { questionGenerationConfig } from "./config.js";
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
         * @param {(question: import("./genkit-fns/src/types/quiz.d.ts").MultipleChoiceQuestion, docRef: string) => void} callback 
         */
        async (referenceMaterialId, initialQuery, callback) => {
            const firstQuestion = getQuestionData(referenceMaterialId, initialQuery, 5, []);
            /**
             * @type {import("./genkit-fns/src/types/quiz.d.ts").QuestionAttempt}
            */
            const firstQuestionAttemptData = {
                question: firstQuestion,
            }
            const collection = collection(getFirestore(), "quizzes")
            const attemptDoc = await addDoc(collection,
                {
                    userId: socket.handshake.auth.user.uid,
                    startedAt: Date.now(),
                    attemptData: [firstQuestionAttemptData],
                    materialId: referenceMaterialId,
                    initialQuery
                });
            callback(attemptDoc.id);
            // The client should subscribe to the doc to get further data.
            firstQuestionAttemptData.harderQuestion = getQuestionData(referenceMaterialId, initialQuery, firstQuestion.level + questionGenerationConfig.difficultyOffsetCorrect, [firstQuestion.question]);
            firstQuestionAttemptData.easierQuestion = getQuestionData(referenceMaterialId, initialQuery, firstQuestion.level - questionGenerationConfig.difficultyOffsetWrong, [firstQuestion.question]);
            setDoc(attemptDoc, firstQuestionAttemptData);
        })
    socket.on("record-answer",
        /**
         * This records the answer of the attempt and publish it to firestore for realtime upddates./
         * @param {string} attemptId 
         * @param {string} answer
         * @param {() => void} callback 
         */
        async (attemptId, answer, callback) => {
            const attemptDoc = doc(firestore, `quizzes/${attemptId}`);
            /**
             * I hate Js typing system 💔
             * @type {import("./genkit-fns/src/types/quiz.d.ts").Attempt}
             */
            const currentAttemptData = (await getDoc(attemptDoc)).data();
            const latestQuestionAttemptData = currentAttemptData.questionHistory[currentAttemptData.questionHistory.length - 1];
            latestQuestionAttemptData.answeredAt = Date.now();
            if (!currentAttemptData) return;
            const isCorrect = answer == latestQuestionAttemptData.question.answer;
            let nextDifficulty = latestQuestionAttemptData.question.level;
            if (isCorrect) {
                // For now we give full marks for the answeree.
                // In the future it is possible to rank the answer with Genkit.
                // If the answer is correct, bump up the difficulty, if reached 10, end the quiz.
                latestQuestionAttemptData.pointsReceived = latestQuestionAttemptData.question.maxScore;
                if (latestQuestionAttemptData.question.level == 10) {
                    currentAttemptData.endedAt = Date.now();
                    setDoc(attemptDoc, currentAttemptData);
                    callback({
                        isOver: true
                    })
                    return;
                }
                else if (latestQuestionAttemptData.question.level >= 0) {
                    nextDifficulty += questionGenerationConfig.difficultyOffsetCorrect;
                }
                currentAttemptData.questionHistory.push({
                    question: latestQuestionAttemptData.harderQuestion,
                    easierQuestion: latestQuestionAttemptData.easierQuestion
                })
            }
            else {
                /**
                 * If user gets it wrong, dont give them any points, and 
                 */
                latestQuestionAttemptData.pointsReceived = 0;
                if (latestQuestionAttemptData.question.level >= 0 + questionGenerationConfig.difficultyOffsetWrong) {
                    nextDifficulty -= questionGenerationConfig.difficultyOffsetWrong;
                }
                currentAttemptData.questionHistory.push({
                    question: latestQuestionAttemptData.easierQuestion,
                    harderQuestion: latestQuestionAttemptData.harderQuestion
                })

            }
            callback({
                wasCorrect: isCorrect,
                currentAttemptData: currentAttemptData,
            });

            //Generate next question
            const nextQuestion = await getQuestionData(currentAttemptData.materialId, currentAttemptData.initialQuery, nextDifficulty, currentAttemptData.questionHistory.flatMap((val) => { return val.question }));
            if (isCorrect) currentAttemptData.questionHistory[currentAttemptData.questionHistory.length - 1].harderQuestion = nextQuestion;
            else currentAttemptData.questionHistory[currentAttemptData.questionHistory.length - 1].easierQuestion = nextQuestion;
        });
}


/**
 * 
 * @param {string[]} previousQuestions Previous questions strings for LLM to avoid repeating itself.
 * @param {string} referenceMaterialId Reference material ID to ground LLM content generation.
 * @param {number} level level is ranged from 1-10, based on the bloom's Taxonomy scale.
 * @param {string} initialQuery The user's initial query or grounding material vect DB search result.
 * @returns {Promise<import("./genkit-fns/src/types/quiz.d.ts").MultipleChoiceQuestion>} Returns a question object
 */
async function getQuestionData(referenceMaterialId, initialQuery, level = 5, previousQuestions = []) {
    const generateQuestionFn = httpsCallable(fireFunctions, 'generateQuestion');
    return await generateQuestionFn({
        difficulty: level,
        initialQuery,
        materialId: referenceMaterialId,
        previousQuestions
    })
}


/**
 * 
 * @param {string} materialId 
 * @param {string} queryString 
 * @param {number} maxLength 
 * @returns {string[]} The result of vector store query.
 */

// eslint-disable-next-line no-unused-vars
async function queryMaterialData(materialId, queryString, maxLength = 5) {
    const queryMaterialDataFn = httpsCallable(fireFunctions, "getGroundingData");
    return (await (queryMaterialDataFn(materialId, queryString, maxLength))).data
}
