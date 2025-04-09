import { HttpsError, onCall } from "firebase-functions/v2/https";

import pdfParse from "pdf-parse";
import { chunk } from "llm-chunk";
import { ref, uploadBytes, getStorage } from "firebase/storage";
import { textEmbeddingGeckoMultilingual001 } from "@genkit-ai/vertexai";
import { ai } from "./inferences";
import {
  addDoc,
  collection,
  doc,
  getFirestore,
  setDoc,
} from "firebase/firestore";
import { FieldValue } from "firebase-admin/firestore";
import {
  defaultRoadmapGenerationConfig,
  RoadmapGenerationConfig,
} from "./types/roadmap.config";

const maxFileSizeMB: number = 50;

export const embeddingConfig = {
  contentField: "text",
  vectorField: "embedding",
  embedder: textEmbeddingGeckoMultilingual001,
};

export const ingestPDFFile = onCall(
  { enforceAppCheck: true },
  async (request, response) => {
    // Validating the request
    const source: File = request.data.file;
    if (
      source == undefined ||
      source.type != "application/pdf" ||
      source.size > maxFileSizeMB * 1024 * 1024 ||
      source.size <= 0
    )
      throw new HttpsError(
        "invalid-argument",
        "The file given doesn't exist or is invalid."
      );

    // Upload file to Cloud Storage
    const storageInstance = getStorage();
    const documentId = crypto.randomUUID();
    const location = `${request.auth?.uid}/documents/${documentId}-${source.name}`;
    const storageRef = ref(storageInstance, location);
    if (request.acceptsStreaming) {
      response?.sendChunk("Uploading file");
    }

    await uploadBytes(storageRef, source);
    if (request.acceptsStreaming) {
      response?.sendChunk("Saving your material");
    }

    const document = doc(getFirestore(), `materials/${documentId}`);
    setDoc(document, {
      documentId: documentId,
      ownerId: request.auth?.uid,
      fileName: source.name,
    });
    // Extract text content from pdf
    const data = pdfParse(Buffer.from(await source.arrayBuffer()));
    const chunks = chunk((await data).text);
    // Start firestore collection to store vector embeddings and material information.
    if (request.acceptsStreaming) {
      response?.sendChunk("Embedding into database.");
    }
    for (const text of chunks) {
      const embedding = (
        await ai.embed({
          embedder: embeddingConfig.embedder,
          content: text,
        })
      )[0].embedding;

      addDoc(collection(getFirestore(), `materials/${documentId}/embeddings`), {
        [embeddingConfig.contentField]: text,
        [embeddingConfig.vectorField]: FieldValue.vector(embedding),
      });
    }
    return "Success";
  }
);

export const generateRoadmap = onCall(
  { enforceAppCheck: true },
  (request, response) => {
    const config: RoadmapGenerationConfig =
      request.data.roadmapGenerationConfig || defaultRoadmapGenerationConfig;
  }
);
