import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import {
  GetCityChatSystemPromptResponse,
  SendCityChatMessageBody,
  SendCityChatMessageResponse,
} from "@workspace/api-zod";
import { Router, type IRouter } from "express";
import { CITY_SYSTEM_PROMPT } from "../city";

const DEFAULT_MODEL = "gemini-3.6-flash";
const DEFAULT_SETTINGS = {
  temperature: 1,
  topP: 0.95,
  maxOutputTokens: 300,
};

const router: IRouter = Router();

router.get("/chat/system-prompt", (_req, res) => {
  const response = GetCityChatSystemPromptResponse.parse({
    systemPrompt: CITY_SYSTEM_PROMPT,
  });
  res.json(response);
});

router.post("/chat", async (req, res): Promise<void> => {
  const parsed = SendCityChatMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a question and valid Prompt Lab settings." });
    return;
  }

  const message = parsed.data.message.trim();
  if (!message) {
    res.status(400).json({ error: "Enter a question for the city guide." });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    res.status(503).json({
      error: "Add a GEMINI_API_KEY secret to enable the AI city guide.",
    });
    return;
  }

  const settings = {
    temperature: parsed.data.settings?.temperature ?? DEFAULT_SETTINGS.temperature,
    topP: parsed.data.settings?.topP ?? DEFAULT_SETTINGS.topP,
    maxOutputTokens:
      parsed.data.settings?.maxOutputTokens ?? DEFAULT_SETTINGS.maxOutputTokens,
  };
  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  // Keep short chat replies fast and reserve the token limit for visible answers.
  const thinkingLevel = model.startsWith("gemini-3.8") || model.startsWith("gemini-4")
    ? ThinkingLevel.LOW
    : model.startsWith("gemini-3.")
      ? ThinkingLevel.MINIMAL
      : undefined;
  const history = parsed.data.history ?? [];

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { timeout: 30_000 },
    });
    const response = await ai.models.generateContent({
      model,
      contents: [
        ...history.map((turn) => ({
          role: turn.role === "assistant" ? "model" : "user",
          parts: [{ text: turn.content }],
        })),
        { role: "user", parts: [{ text: message }] },
      ],
      config: {
        systemInstruction: CITY_SYSTEM_PROMPT,
        temperature: settings.temperature,
        topP: settings.topP,
        maxOutputTokens: settings.maxOutputTokens,
        ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}),
      },
    });

    const usage = response.usageMetadata;
    const result = SendCityChatMessageResponse.parse({
      reply: response.text?.trim() || "I’m not sure about that just yet.",
      usage: {
        promptTokens: usage?.promptTokenCount ?? 0,
        outputTokens: usage?.candidatesTokenCount ?? 0,
        totalTokens: usage?.totalTokenCount ?? 0,
        finishReason: response.candidates?.[0]?.finishReason
          ? String(response.candidates[0].finishReason)
          : null,
      },
      settings,
      model,
    });

    res.json(result);
  } catch (error) {
    req.log.error(
      { model, errorName: error instanceof Error ? error.name : "UnknownError" },
      "Gemini city guide request failed",
    );
    res.status(502).json({
      error: "The city guide could not answer right now. Please try again.",
    });
  }
});

export default router;
