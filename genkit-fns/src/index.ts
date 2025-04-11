import { HttpsError, onCall } from "firebase-functions/v2/https";

import pdfParse from "pdf-parse";
import { chunk } from "llm-chunk";
import { ref, uploadBytes, getStorage } from "firebase/storage";
import { textEmbeddingGeckoMultilingual001 } from "@genkit-ai/vertexai";
import {
  ai,
  generateCheckpointsForMilestone,
  milestoneSuggestionFlow,
  queryMaterialContent,
} from "./inferences";
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
import { RoadmapMilestone } from "./types/roadmap";

const maxFileSizeMB: number = 50;

export const embeddingConfig = {
  contentField: "text",
  vectorField: "embedding",
  embedder: textEmbeddingGeckoMultilingual001,
};

export const ingestPDFFile = onCall(async (request, response) => {
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
  const bucketLocation = `materials/${documentId}-${source.name}`;
  const storageRef = ref(storageInstance, bucketLocation);
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
    ownerId: request.auth?.uid || "anoynomous",
    fileName: source.name,
  })
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
});
export const getGroundingData = onCall(async (request, response) => {
  const referenceMaterialId = request.data.materialId;
  const queryString = request.data.queryString;
  if (!referenceMaterialId || queryString) {
    throw new Error("Please provide appropriate input data..");
  }
  const embedsCollection = `materials/${referenceMaterialId}/embeddings`;
  const result = await queryMaterialContent(
    embedsCollection,
    queryString,
    request.data.maxLength
  );
  return result.map((val) => {
    return val.text;
  });
});

export const generateRoadmap = onCall(async (request, response) => {
  const config: RoadmapGenerationConfig =
    request.data.roadmapGenerationConfig || defaultRoadmapGenerationConfig;
  let currentMilestoneNumber: number = 0;
  const materialId = request.data.materialId;
  const userRequestedContent = request.data.requestedContent || "";
  if (!materialId)
    throw new Error(
      "You need to provide grounding material to generate a roadmap."
    );
  //Initial data
  let initialMilestone: RoadmapMilestone = {
    ...(await milestoneSuggestionFlow({
      previousMilestonesDescription: [],
      milestoneNumber: 0,
      maxMilestoneAmount: config.maxLength,
      referenceMaterialId: materialId,
      userRequestedContent,
    })),
    content: [],
  };
  populateMilestoneWithCheckpoints(initialMilestone, materialId);
  let currentMilestone = initialMilestone;
  let inferenceResult: { label: string; description: string };
  while (true) {
    inferenceResult = await milestoneSuggestionFlow({
      previousMilestonesDescription: getAllDescriptions(initialMilestone),
      milestoneNumber: ++currentMilestoneNumber,
      maxMilestoneAmount: config.maxLength,
      referenceMaterialId: materialId,
      userRequestedContent,
    });
    if (inferenceResult.label == "") break;
    currentMilestone.nextMilestone = {
      ...inferenceResult,
      content: [],
    };
    populateMilestoneWithCheckpoints(
      currentMilestone.nextMilestone,
      materialId
    );
    currentMilestone = currentMilestone.nextMilestone;
  }
});

async function populateMilestoneWithCheckpoints(
  milestone: RoadmapMilestone,
  referenceId: string,
  config: RoadmapGenerationConfig = defaultRoadmapGenerationConfig
) {
  milestone.content = await generateCheckpointsForMilestone({
    milestoneName: milestone.label,
    milestoneDescription: milestone.description,
    referenceMaterialId: referenceId,
    generationConfig: config,
  });
}

function getAllDescriptions(milestone: RoadmapMilestone): string[] {
  let node: RoadmapMilestone | undefined = milestone;
  const result: string[] = [];
  while (node) {
    result.push(milestone.description);
    node = milestone.nextMilestone;
  }
  return result;
}
