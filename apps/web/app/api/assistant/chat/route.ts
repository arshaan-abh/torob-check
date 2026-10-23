import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import {
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
  tool,
  type ModelMessage,
  type UIMessage,
} from "ai"
import { z } from "zod"

import {
  searchAssistantCatalog,
  type AssistantCatalogLocation,
} from "@workspace/db"

export const runtime = "nodejs"
export const maxDuration = 30

const MAX_MESSAGES = 16
const MAX_MESSAGE_LENGTH = 2000
const MAX_REQUEST_BYTES = 64_000

const locationSchema = z
  .object({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
  })
  .nullable()

const systemPrompt = `تو ترب‌چک هستی، دستیار فارسی‌زبان خرید حضوری در تهران.

رفتارت:
- اگر هنوز معلوم نیست کاربر دنبال چه کالا یا دسته‌ای است، قبل از جست‌وجو یک سؤال کوتاه برای روشن‌شدن نیاز، بودجه یا اولویت او بپرس.
- برای معرفی قیمت یا فروشگاه، از ابزار searchCatalog استفاده کن. اطلاعات ابزار از داده‌های کاتالوگ برنامه می‌آید و ممکن است قدیمی باشد.
- اگر خروجی ابزار catalogAvailable=false بود، بگو دسترسی به کاتالوگ فروشگاه‌ها در حال حاضر برقرار نیست و وانمود نکن که جست‌وجو انجام شده است.
- هیچ‌وقت موجودی لحظه‌ای، قیمت قطعی، ساعت کاری امروز یا تماس با فروشگاه را تأییدشده جلوه نده. پیشنهاد بده کاربر پیش از حرکت با فروشگاه تماس بگیرد.
- اگر مختصات کاربر در دسترس بود و او نزدیکی را خواست، نتایج را با sortBy=distance بگیر و فاصله را تقریبی بیان کن. اگر مختصات نیست، نزدیک‌ترین‌بودن را حدس نزن و در صورت نیاز درخواست دسترسی موقعیت کن.
- نتایج را حداکثر در سه گزینه‌ی قابل‌مقایسه و به زبان ساده خلاصه کن. قیمت‌ها به تومان هستند. نام فروشگاه و نشانی را در صورت وجود بیاور؛ ویژگی‌های محصول، ضمانت، روش پرداخت و ساعات درج‌شده را فقط وقتی در نتیجه وجود دارند ذکر کن.
- اگر نتیجه‌ای پیدا نشد، شفاف بگو و از کاربر مدل، برند یا عبارت جست‌وجوی دیگری بخواه.
- اطلاعات تماس را فقط از نتیجه‌ی ابزار نقل کن و هرگز ادعا نکن که خودت با فروشگاه تماس گرفته‌ای.
- پاسخ را به فارسی و متن ساده بنویس؛ گزینه‌های مقایسه را در خط‌های جدا و کوتاه بیاور.`

type RawChatMessage = {
  id?: unknown
  role?: unknown
  parts?: unknown
}

function getTextFromParts(parts: unknown) {
  if (!Array.isArray(parts)) return ""

  return parts
    .filter(
      (part): part is { type: "text"; text: string } =>
        typeof part === "object" &&
        part !== null &&
        "type" in part &&
        part.type === "text" &&
        "text" in part &&
        typeof part.text === "string"
    )
    .map((part) => part.text.slice(0, MAX_MESSAGE_LENGTH))
    .join("\n")
    .trim()
}

function sanitizeMessages(value: unknown) {
  if (!Array.isArray(value) || value.length > 100) return null

  const cleanMessages: UIMessage[] = []
  const modelMessages: ModelMessage[] = []

  for (const rawMessage of value.slice(-MAX_MESSAGES) as RawChatMessage[]) {
    if (rawMessage.role !== "user" && rawMessage.role !== "assistant") continue

    const text = getTextFromParts(rawMessage.parts)
    if (!text) continue

    const id =
      typeof rawMessage.id === "string" && rawMessage.id.length <= 128
        ? rawMessage.id
        : crypto.randomUUID()
    const role = rawMessage.role

    cleanMessages.push({
      id,
      role,
      parts: [{ type: "text", text }],
    })
    modelMessages.push({ role, content: text })
  }

  return { cleanMessages, modelMessages }
}

export async function POST(request: Request) {
  const baseURL = process.env.AI_PROVIDER_BASE_URL?.trim()
  const modelId = process.env.AI_MODEL?.trim()

  if (!baseURL || !modelId) {
    return Response.json(
      {
        error:
          "دستیار هوشمند هنوز پیکربندی نشده است. AI_PROVIDER_BASE_URL و AI_MODEL را در محیط اجرا تنظیم کنید.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    )
  }

  const contentLength = Number(request.headers.get("content-length"))
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return Response.json(
      { error: "گفت‌وگو بیش از حد طولانی است. یک گفت‌وگوی تازه شروع کن." },
      { status: 413, headers: { "Cache-Control": "no-store" } }
    )
  }

  let requestBody: unknown
  try {
    requestBody = await request.json()
  } catch {
    return Response.json(
      { error: "درخواست گفت‌وگو معتبر نیست." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    )
  }

  if (typeof requestBody !== "object" || requestBody === null) {
    return Response.json(
      { error: "درخواست گفت‌وگو معتبر نیست." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    )
  }

  const requestData = requestBody as Record<string, unknown>
  const sanitized = sanitizeMessages(requestData.messages)
  const locationResult = locationSchema.safeParse(requestData.location ?? null)

  if (
    !sanitized ||
    sanitized.modelMessages.at(-1)?.role !== "user" ||
    !locationResult.success
  ) {
    return Response.json(
      { error: "پیام یا موقعیت ارسالی معتبر نیست." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    )
  }

  const location: AssistantCatalogLocation = locationResult.data
  const provider = createOpenAICompatible({
    name: "torobcheck-assistant",
    baseURL,
    apiKey: process.env.AI_PROVIDER_API_KEY?.trim() || undefined,
  })
  const tools = {
    searchCatalog: tool({
      description:
        "نام محصول، برند یا مدل را در کاتالوگ فروشگاه‌های حضوری ترب‌چک جست‌وجو می‌کند. عبارت جست‌وجو را کوتاه و مشخص نگه دار.",
      inputSchema: z.object({
        query: z.string().trim().min(2).max(120),
        sortBy: z.enum(["price", "distance"]).optional(),
      }),
      execute: async ({ query, sortBy = "price" }) => {
        if (!process.env.DATABASE_URL) {
          return {
            matches: 0,
            catalogAvailable: false,
            locationAvailable: location !== null,
            offers: [],
          }
        }

        try {
          return await searchAssistantCatalog({ query, sortBy, location })
        } catch (error) {
          console.error("TorobCheck catalog search failed", error)
          return {
            matches: 0,
            catalogAvailable: false,
            locationAvailable: location !== null,
            offers: [],
          }
        }
      },
    }),
  }

  const result = streamText({
    model: provider.chatModel(modelId),
    system: systemPrompt,
    messages: sanitized.modelMessages,
    tools,
    stopWhen: stepCountIs(4),
  })
  const uiStream = toUIMessageStream({
    stream: result.fullStream,
    tools,
    originalMessages: sanitized.cleanMessages,
    onError: (error) => {
      console.error("TorobCheck assistant stream failed", error)
      return "ارتباط با دستیار هوشمند برقرار نشد. لطفاً کمی بعد دوباره تلاش کن."
    },
  })

  return createUIMessageStreamResponse({
    stream: uiStream,
    headers: { "Cache-Control": "no-store" },
  })
}
