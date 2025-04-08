
// Import the Genkit core libraries and plugins.
import { genkit, z } from "genkit";
import { gemini15Flash, vertexAI } from "@genkit-ai/vertexai";


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
import { enableFirebaseTelemetry } from '@genkit-ai/firebase';

enableFirebaseTelemetry();

const ai = genkit({
  plugins: [
    // Load the Vertex AI plugin. You can optionally specify your project ID
    // by passing in a config object; if you don't, the Vertex AI plugin uses
    // the value from the GCLOUD_PROJECT environment variable.
    vertexAI(),
  ],
});

// Define a simple flow that prompts an LLM to generate menu suggestions.
const menuSuggestionFlow = ai.defineFlow({
  name: "menuSuggestionFlow",
  inputSchema: z.string().describe("A restaurant theme").default("seafood"),
  outputSchema: z.string(),
  streamSchema: z.string(),
}, async (subject, { sendChunk }) => {
  // Construct a request and send it to the model API.
  const prompt =
    `Suggest an item for the menu of a ${subject} themed restaurant`;
  const { response, stream } = ai.generateStream({
    model: gemini15Flash,
    prompt: prompt,
    config: {
      temperature: 1,
    },
  });

  for await (const chunk of stream) {
    sendChunk(chunk.text);
  }

  return (await response).text;
}
);

export const menuSuggestion = onCallGenkit({
  secrets: [apiKey],
}, menuSuggestionFlow);
