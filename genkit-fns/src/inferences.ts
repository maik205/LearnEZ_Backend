import { getFirestore } from "firebase-admin/firestore";
// Import the Genkit core libraries and plugins.
import { genkit, z, Document } from "genkit";
import {
  gemini15Flash,
  gemini20FlashLite,
  textEmbeddingGeckoMultilingual001,
  vertexAI,
} from "@genkit-ai/vertexai";

// Cloud Functions for Firebase supports Genkit natively. The onCallGenkit function creates a callable
// function from a Genkit action. It automatically implements streaming if your flow does.
// The https library also has other utility methods such as hasClaim, which verifies that
// a caller's token has a specific claim (optionally matching a specific value)
import { onCallGenkit } from "firebase-functions/https";

// Genkit models generally depend on an API key. APIs should be stored in Cloud Secret Manager so that
// access to these sensitive values can be controlled. defineSecret does this for you automatically.
// If you are using Google generative AI you can get an API key at https://aistudio.google.com/app/apikey
import { defineSecret } from "firebase-functions/params";
const apiKey = defineSecret("GOOGLE_GENAI_API_KEY");
import {
  defineFirestoreRetriever,
  enableFirebaseTelemetry,
} from "@genkit-ai/firebase";
import { embeddingConfig } from ".";
import { RoadmapCheckpoint, RoadmapCheckpointStatus } from "./types/roadmap";
import { RoadmapGenerationConfig } from "./types/roadmap.config";

enableFirebaseTelemetry();

export const ai = genkit({
  plugins: [vertexAI()],
});

export const milestoneSuggestionFlow = ai.defineFlow(
  {
    name: "milestoneSuggestionFlow",
    inputSchema: z.object({
      previousMilestonesDescription: z.array(z.string()),
      milestoneNumber: z.number(),
      maxMilestoneAmount: z.number(),
      referenceMaterialId: z.string(),
      userRequestedContent: z.string(),
    }),
    outputSchema: z.object({
      label: z.string(),
      description: z.string(),
    }),
  },
  async (input) => {
    // Retrieve embedded data from Firestore Vector Store
    const groundingData = await queryMaterialContent(
      `materials/${input.referenceMaterialId}/embeddings`,
      input.userRequestedContent,
      10
    );

    const inferenceResult = ai.generate({
      model: gemini20FlashLite,
      prompt: `You are an expert roadmap designer.
Create milestone #${input.milestoneNumber} in a learning roadmap, not exceeding ${input.maxMilestoneAmount} total milestones.
Act as a curriculum developer who adapts plans based on prior steps and user goals.
Use the following to guide your milestone creation:

Previous Milestones: ${input.previousMilestonesDescription}

Reference Material ID: ${input.referenceMaterialId}

User Goal: ${input.userRequestedContent}

Design the milestone to be sequential, achievable, and relevant.
It should clearly build upon prior milestones and help progress toward the user’s learning objective.`,
      output: {
        schema: z.object({
          label: z.string(),
          description: z.string(),
        }),
      },
      docs: groundingData,
    });

    return (await inferenceResult).data || { label: "", description: "" };
  }
);

export async function queryMaterialContent(
  embedsCollection: string,
  query: string,
  maxLength: number = 5
): Promise<Document[]> {
  const retriever = defineFirestoreRetriever(ai, {
    name: "materialRetriever",
    firestore: getFirestore(),
    collection: embedsCollection,
    contentField: embeddingConfig.contentField,
    vectorField: embeddingConfig.vectorField,
    embedder: textEmbeddingGeckoMultilingual001,
    distanceMeasure: "COSINE",
  });

  return await ai.retrieve({
    retriever,
    query,
    options: {
      limit: maxLength,
    },
  });
}

export async function generateCheckpointsForMilestone(
  input: CheckpointGenerationInput
): Promise<RoadmapCheckpoint[]> {
  const result: Array<RoadmapCheckpoint> = [];

  // Query Firestore Vect DB
  const referenceCollection: string = `materials/${input.referenceMaterialId}/embeddings`;
  const groundingData = await queryMaterialContent(
    referenceCollection,
    input.milestoneDescription,
    10
  );
  const { output } = await ai.generate({
    model: gemini20FlashLite,
    prompt: `You are a smart and responsible agent that generates checkpoints as step by steps for a Learner's roadmap's milestone, the milestone is about ${input.milestoneName}. You should generate at least ${input.generationConfig.milestoneMinLength} and at most ${input.generationConfig.milestoneMaxLength} checkpoints to guide the learner to learn about ${input.milestoneName}, based on the material's content. DO NOT HALLUCINATE. DO NOT ADD CONTENT THAT IS NOT INCLUDED IN THE PROVIDED MATERIALS`,
    output: {
      schema: z.array(
        z.object({
          label: z
            .string()
            .describe(
              "A short and concise title/label of the checkpoint, generated from the given material content."
            ),
          description: z
            .string()
            .describe(
              "A descriptive description of the checkpoint's content and what the learner should accomplish by finishing this checkpoint."
            ),
        })
      ),
    },
    docs: groundingData,
  });
  if (output != null) {
    output.forEach((val) => {
      result.push({
        ...val,
        referenceMaterial: [
          {
            referenceId: input.referenceMaterialId,
            referenceContent: groundingData.join("|"),
            referenceCollection: referenceCollection,
          },
        ],
        status: RoadmapCheckpointStatus.NOT_STARTED,
      });
    });
    return result;
  }
  return [];
}

interface CheckpointGenerationInput {
  milestoneName: string;
  milestoneDescription: string;
  referenceMaterialId: string;
  generationConfig: RoadmapGenerationConfig;
}

export const suggestMilestone = onCallGenkit(milestoneSuggestionFlow);
