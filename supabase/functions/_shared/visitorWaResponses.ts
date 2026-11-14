import { createOpenAI } from "npm:@ai-sdk/openai@4";
import { streamText, type ModelMessage, type UIMessage } from "npm:ai@7";

import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "./visitorWaRunId.ts";

export function createResponsesCall(
  request: Request,
  config: { baseURL: string; apiKey: string; model: string },
  messages: ModelMessage[],
  instructions?: string,
) {
  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
  const provider = createOpenAI({
    baseURL: `${config.baseURL.replace(/\/+$/, "").replace(/\/v1$/, "")}/v1`,
    apiKey: config.apiKey,
    headers: { "Lovable-API-Key": config.apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });
  const reasoning = config.model !== "openai/chat-latest";
  let upstreamError: unknown;
  const result = streamText({
    model: provider.responses(config.model),
    // AI SDK 6 lacks `instructions`: rename this key to `system` there.
    ...(instructions ? { instructions } : {}),
    messages,
    abortSignal: request.signal,
    onError: ({ error }) => { upstreamError = error; },
    providerOptions: {
      openai: {
        store: false,
        ...(reasoning
          ? {
              forceReasoning: true,
              reasoningEffort: "medium",
              reasoningSummary: "auto",
              include: ["reasoning.encrypted_content"],
            }
          : {}),
      },
    },
  });
  return {
    result,
    text: async () => {
      const text = await result.text;
      if (upstreamError) throw upstreamError;
      return text;
    },
    response: (originalMessages: UIMessage[], headers: HeadersInit) =>
      withLovableAiGatewayRunIdHeader(result.toUIMessageStreamResponse({ originalMessages, sendReasoning: false, onError: () => 'ריטה אינה זמינה כרגע. נסו שוב מאוחר יותר.' }), runIdFetch, headers),
  };
}
