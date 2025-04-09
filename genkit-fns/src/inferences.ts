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

enableFirebaseTelemetry();

export const ai = genkit({
  plugins: [
    // Load the Vertex AI plugin. You can optionally specify your project ID
    // by passing in a config object; if you don't, the Vertex AI plugin uses
    // the value from the GCLOUD_PROJECT environment variable.
    vertexAI(),
  ],
});

// // Define a simple flow that prompts an LLM to generate menu suggestions.
// const menuSuggestionFlow = ai.defineFlow(
//   {
//     name: "menuSuggestionFlow",
//     inputSchema: z.string().describe("A restaurant theme").default("seafood"),
//     outputSchema: z.string(),
//     streamSchema: z.string(),
//   },
//   async (subject, { sendChunk }) => {
//     // Construct a request and send it to the model API.
//     const prompt = `Suggest an item for the menu of a ${subject} themed restaurant`;
//     const { response, stream } = ai.generateStream({
//       model: gemini15Flash,
//       prompt: prompt,
//       config: {
//         temperature: 1,
//       },
//     });

//     for await (const chunk of stream) {
//       sendChunk(chunk.text);
//     }

//     return (await response).text;
//   }
// );

// export const menuSuggestion = onCallGenkit(
//   {
//     secrets: [apiKey],
//   },
//   menuSuggestionFlow
// );

const milestoneSuggestionFlow = ai.defineFlow(
  {
    name: "milestoneSuggestionFlow",
    inputSchema: z.object({
      previousMilestonesDescription: z.array(z.string()),
      milestoneNumber: z.number(),
      maxMilestoneAmount: z.number(),
      referenceMaterial: z.string(),
    }),
    outputSchema: z.object({
      label: z.string(),
      description: z.string(),
    }),
  },
  async (input) => {
    // Retrieve embedded data from Firestore Vector Store
    const result = {
      label: "",
      description: "",
    };

    return result;
  }
);

const checkpointSuggestionFlow = ai.defineFlow(
  {
    name: "checkpointSuggestionFlow",
    inputSchema: z.object({
      milestoneDescription: z.string(),
      milestoneName: z.string(),
      referenceMaterialId: z.string(),
      milestoneMinLength: z.number(),
      milestoneMaxLength: z.number(),
    }),
    outputSchema: z
      .array(
        z
          .object({
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
            referenceMaterials: z.array(
              z.object({
                referenceId: z.string(),
                referenceCollection: z.string(),
                referenceContent: z.string(),
              })
            ),
          })
          .describe(
            "A checkpoint describing a step in the learner's journey to learning the milestone's main content"
          )
      )
      .describe(
        "Multiple checkpoints as steps in learning the content provided in the milestone's title and description."
      ),
  },
  async (input) => {
    const result = [
      {
        label: "",
        description: "",
        referenceMaterials: [],
      },
    ];
    // Query Firestore Vect DB
    const groundingData = await queryMaterialContent(
      `materials/${input.referenceMaterialId}/embeddings`,
      input.milestoneDescription,
      10
    );

    const { output } = await ai.generate({
      model: gemini20FlashLite,
      prompt: `You are a smart and responsible agent that generates checkpoints as step by steps for a Learner's roadmap's milestone, the milestone is about ${input.milestoneName}. You should generate at least ${input.milestoneMinLength} and at most ${input.milestoneMaxLength} checkpoints to guide the learner to learn about ${input.milestoneName}, based on the material's content. DO NOT HALLUCINATE. DO NOT ADD CONTENT THAT IS NOT INCLUDED IN THE PROVIDED MATERIALS`,
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
    return result;
  }
);

async function queryMaterialContent(
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
