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
import {
  RoadmapCheckpoint,
  RoadmapCheckpointStatus,
} from "./types/roadmap.type";
import { RoadmapGenerationConfig } from "./types/roadmap.config";
import { collection, getDocs } from "firebase/firestore";

enableFirebaseTelemetry();

export const ai = genkit({
  plugins: [vertexAI()],
});

export const roadmapInfoSuggestionFlow = ai.defineFlow(
  {
    name: "roadmapInfoSuggestionFlow",
    inputSchema: z.object({
      referenceMaterialId: z.string(),
    }),
    outputSchema: z.object({
      label: z.string(),
      description: z.string(),
    }),
  },
  async (input) => {
    const data = (
      await getDocs(
        collection(
          (await import("firebase/firestore")).getFirestore(),
          `materials/${input.referenceMaterialId}/embeddings`
        )
      )
    ).docs.flatMap((doc) => {
      return new Document({
        content: [
          {
            text: doc.data()[embeddingConfig.contentField] as string,
          },
        ],
      });
    });
    const inferenceResult = ai.generate({
      model: gemini20FlashLite,
      prompt: `Given the following paragraph, extract and summarize the content into two fields:

Label – A short title (3–7 words) that best represents the main topic or purpose of the paragraph.

Description – A concise summary (1–2 sentences) that explains the key idea or content of the paragraph.`,
      output: {
        schema: z.object({
          label: z.string(),
          description: z.string(),
        }),
      },
      docs: data,
    });
    return (
      (await inferenceResult).data || {
        label: "",
        description: "",
      }
    );
  }
);

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

export const questionSuggestionFlow = ai.defineFlow(
  {
    name: "questionSuggestionFlow",
    inputSchema: z.object({
      difficulty: z.number(),
      initialQuery: z.string(),
      materialId: z.string(),
      previousQuestions: z.array(z.string()),
    }),
    outputSchema: z.object({
      maxScore: z.number(),
      minScore: z.number(),
      passingScore: z.number(),
      answer: z.string(),
      question: z.string(),
      choices: z.object({
        a: z.string().describe("Choice A"),
        b: z.string().describe("Choice B"),
        c: z.string().describe("Choice C"),
        d: z.string().describe("Choice D"),
      }),
      level: z.number(),
      reference: z.object({
        referenceContent: z.string(),
        referenceId: z.string(),
        referenceCollection: z.string(),
      }),
    }),
  },
  async (input) => {
    const bloomTaxLevel = ((difficulty: number) => {
      if (difficulty <= 2) {
        return "Remember"; // Level 1
      } else if (difficulty <= 4) {
        return "Understand"; // Level 2
      } else if (difficulty <= 6) {
        return "Apply"; // Level 3
      } else if (difficulty <= 8) {
        return "Analyze"; // Level 4
      } else if (difficulty === 9) {
        return "Evaluate"; // Level 5
      } else {
        return "Create"; // Level 6
      }
    })(input.difficulty);

    const prompt = `
  You are an educational assistant. Create 1 multiple choice question (MCQ) in JSON format.

            Requirements:
            - Question must include:
                - "question": the question text (relevant to the context provided below)
                The question's level on the Bloom's Taxonomy Scale is ${bloomTaxLevel}, and on a scale of 1 to 10 ${
      input.difficulty
    }
                - "options": a list of 4 choices
                - "answer": the correct answer (must match one of the options)

            - Do not repeat any of the previous questions listed below:
            ${input.previousQuestions.join("\n")}
    `;
    const docs = await queryMaterialContent(
      `materials/${input.materialId}`,
      input.initialQuery,
      10
    );
    const inferenceResult = ai.generate({
      model: gemini20FlashLite,
      prompt,
      docs,
      output: {
        schema: z.object({
          question: z
            .string()
            .describe(
              "The question to be generated, based on the mentioned Bloom Taxonomy and the material given."
            ),
          answer: z
            .string()
            .describe("The answer to the question in whole text, not A B C D"),
          choices: z
            .object({
              a: z.string().describe("Choice A"),
              b: z.string().describe("Choice B"),
              c: z.string().describe("Choice C"),
              d: z.string().describe("Choice D"),
            })
            .describe("The choices to the Multiple Choice Question."),
        }),
      },
    });
    const inferenceData = (await inferenceResult).data || {
      answer: "",
      question: "",
      choices: {
        a: "",
        b: "",
        c: "",
        d: "",
      },
    };
    return {
      maxScore: 1,
      minScore: 0,
      passingScore: 1,
      answer: inferenceData.answer,
      question: inferenceData.question,
      choices: inferenceData.choices,
      level: input.difficulty,
      reference: {
        referenceId: input.materialId,
        referenceCollection: `materials/${input.materialId}`,
        referenceContent: docs.join("|"),
      },
    };
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
            id: input.referenceMaterialId,
            content: groundingData.join("|"),
            collection: referenceCollection,
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

function convertToDocument(strings: string[]): Document[] {
  return strings.flatMap((val) => {
    return new Document({
      content: [
        {
          text: val,
        },
      ],
    });
  });
}
