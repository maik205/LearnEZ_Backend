/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { maxFileSizeMB } from "./config";

import { ref, uploadBytes, getStorage } from "firebase/storage";
import pdf from "pdf-parse";

import { chunk } from "llm-chunk";

// Start writing functions
// https://firebase.google.com/docs/functions/typescript


export const ingestPDFFile = onCall({ enforceAppCheck: true }, async (request, response) => {
    // Validating the request
    const source: File = request.data.file;
    if (source == undefined
        || source.type != "application/pdf"
        || (source.size > maxFileSizeMB * 1024 * 1024 || source.size <= 0)
    ) throw new HttpsError("invalid-argument", "The file given doesn't exist or is invalid.");

    // Upload file to Cloud Storage
    const storageInstance = getStorage();
    const location = `${request.auth?.uid}/documents/${crypto.randomUUID}-${source.name}`;
    const storageRef = ref(storageInstance, location);
    if (request.acceptsStreaming) {
        response?.sendChunk("Uploading file")
    }

    await uploadBytes(storageRef, source);
    if (request.acceptsStreaming) {
        response?.sendChunk("Indexing document")
    }

    // Extract text content from pdf
    
})