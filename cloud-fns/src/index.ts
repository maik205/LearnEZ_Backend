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
