import "server-only"
import { createGoogle } from "@ai-sdk/google"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { createGateway, type LanguageModel } from "ai"
import { getRuntimeSettings } from "@/lib/runtime-settings"

export async function getAssistantModel(): Promise<LanguageModel> {
  const settings = await getRuntimeSettings()
  const modelId = settings.aiModel.trim()
  if (!modelId) throw new Error("AI_MODEL is required")

  const provider = settings.aiProvider.toLowerCase()
  if (provider === "gateway") {
    if (!settings.aiGatewayApiKey)
      throw new Error("AI Gateway API key is required")
    return createGateway({ apiKey: settings.aiGatewayApiKey })(modelId)
  }
  if (provider === "google") {
    if (!settings.googleApiKey) throw new Error("Google API key is required")
    return createGoogle({ apiKey: settings.googleApiKey }).chat(modelId)
  }
  if (provider === "openrouter" || provider === "openai-compatible") {
    const apiKey =
      provider === "openrouter"
        ? settings.openrouterApiKey
        : settings.compatibleApiKey
    const baseURL =
      provider === "openrouter"
        ? settings.openrouterBaseUrl
        : settings.compatibleBaseUrl
    if (!apiKey || !baseURL) {
      throw new Error(
        provider === "openrouter"
          ? "OPENROUTER_API_KEY is required"
          : "AI_PROVIDER_API_KEY and AI_PROVIDER_BASE_URL are required"
      )
    }
    const compatible = createOpenAICompatible({
      name: provider,
      baseURL,
      apiKey,
      supportsStructuredOutputs: false,
      headers:
        provider === "openrouter"
          ? {
              ...(process.env.NEXT_PUBLIC_APP_URL
                ? { "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL }
                : {}),
              "X-Title": "Torob Check",
            }
          : undefined,
    })
    return compatible.chatModel(modelId)
  }

  throw new Error(`Unsupported AI_PROVIDER: ${provider}`)
}
