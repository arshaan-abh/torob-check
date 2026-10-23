"use client"

import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import {
  AlertCircle,
  ArrowUp,
  Bot,
  LoaderCircle,
  Search,
  Square,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import type { FormEvent, KeyboardEvent } from "react"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar"
import { Bubble, BubbleContent } from "@workspace/ui/components/bubble"
import { Button } from "@workspace/ui/components/button"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@workspace/ui/components/input-group"
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageHeader,
} from "@workspace/ui/components/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@workspace/ui/components/message-scroller"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import {
  Trace,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@workspace/ui/components/trace"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import { TorobCheckCharacter } from "@/app/components/torob-check-character"
import { useTorobCheck } from "@/app/components/torob-check-provider"

type AssistantLocation = {
  latitude: number
  longitude: number
} | null

type CatalogSearchResult = {
  matches: number
  catalogAvailable: boolean
  locationAvailable: boolean
  offers: Array<{
    product: string
    brand: string | null
    model: string | null
    priceToman: string | null
    shop: string
    address: string | null
    locationLabel: string | null
    distanceKm: number | null
  }>
}

type AssistantTools = {
  searchCatalog: {
    input: {
      query: string
      sortBy?: "price" | "distance"
    }
    output: CatalogSearchResult
  }
}

type AssistantMessage = UIMessage<never, never, AssistantTools>

type TorobCheckAssistantProps = {
  location: AssistantLocation
}

const assistantTransport = new DefaultChatTransport({
  api: "/api/assistant/chat",
})

const welcomeMessage: AssistantMessage = {
  id: "torobcheck-welcome",
  role: "assistant",
  parts: [
    {
      type: "text",
      text: "سلام! من ترب‌چک هستم. بگو دنبال چه محصولی می‌گردی تا فروشگاه‌های حضوری و قیمت‌هاشون رو با هم پیدا و مقایسه کنیم.",
    },
  ],
}

const quickPrompts = [
  "یک فشارسنج مناسب پیدا کن",
  "فروشگاه‌های نزدیکم را مقایسه کن",
]

function getMessageText(message: AssistantMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("")
}

function isCatalogSearchPart(part: AssistantMessage["parts"][number]) {
  return part.type === "tool-searchCatalog"
}

export function TorobCheckAssistant({ location }: TorobCheckAssistantProps) {
  const { setMovement, setSpeech } = useTorobCheck()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState("")
  const [characterReady, setCharacterReady] = useState(false)
  const [characterError, setCharacterError] = useState(false)
  const introTimersRef = useRef<number[]>([])
  const previousStatusRef = useRef<string>("ready")
  const { messages, sendMessage, status, error, clearError, regenerate, stop } =
    useChat<AssistantMessage>({
      id: "torobcheck-assistant",
      messages: [welcomeMessage],
      transport: assistantTransport,
    })
  const isBusy = status === "submitted" || status === "streaming"

  const cancelIntro = useCallback(() => {
    for (const timer of introTimersRef.current) {
      window.clearTimeout(timer)
    }
    introTimersRef.current = []
  }, [])

  useEffect(() => {
    if (!characterReady) return

    const openAndTalk = window.setTimeout(() => {
      setOpen(true)
      setSpeech("talking")
    }, 900)
    const settle = window.setTimeout(() => {
      setSpeech("silent")
      setMovement("idle")
    }, 3300)

    introTimersRef.current = [openAndTalk, settle]

    return cancelIntro
  }, [cancelIntro, characterReady, setMovement, setSpeech])

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (nextOpen) cancelIntro()
  }

  useEffect(() => {
    if (previousStatusRef.current === status) return
    previousStatusRef.current = status

    if (status === "ready" || status === "error") {
      setMovement("idle")
      setSpeech("silent")
      return
    }

    setOpen(true)
    setMovement("walking")
    setSpeech(status === "streaming" ? "talking" : "silent")
  }, [setMovement, setSpeech, status])

  const submitMessage = useCallback(
    (text: string) => {
      const trimmedText = text.trim()
      if (!trimmedText || isBusy) return

      cancelIntro()
      clearError()
      setOpen(true)
      setMovement("walking")
      setSpeech("silent")
      setInput("")
      void sendMessage(
        { text: trimmedText },
        {
          body: {
            location,
          },
        }
      )
    },
    [
      cancelIntro,
      clearError,
      isBusy,
      location,
      sendMessage,
      setMovement,
      setSpeech,
    ]
  )

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    submitMessage(input)
  }

  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return
    }

    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  return (
    <Popover open={open} modal={false} onOpenChange={handleOpenChange}>
      <div className="relative size-[76px]">
        <PopoverTrigger
          aria-label="گفت‌وگو با ترب‌چک"
          className="pointer-events-auto rounded-full border-0 bg-transparent p-0 shadow-none outline-none hover:bg-transparent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <TorobCheckCharacter
            className="size-[76px]"
            onReady={() => setCharacterReady(true)}
            onError={() => setCharacterError(true)}
          />
        </PopoverTrigger>
        {characterError && (
          <Tooltip>
            <TooltipTrigger
              type="button"
              aria-label="تربچِک بارگذاری نشد"
              onClick={() => setOpen(true)}
              className="pointer-events-auto absolute inset-0 z-10 rounded-full bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="sr-only">تربچِک بارگذاری نشد</span>
            </TooltipTrigger>
            <TooltipContent dir="rtl" className="max-w-56 text-center">
              تربچِک بارگذاری نشد. اتصال اینترنت یا فایل انیمیشن در دسترس نیست.
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <PopoverContent
        dir="rtl"
        side="top"
        align="end"
        sideOffset={10}
        collisionPadding={12}
        className="flex h-[min(26rem,calc(100dvh-5rem))] w-[min(22rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] flex-col gap-0 overflow-hidden rounded-2xl border-border/70 bg-card/95 p-0 shadow-2xl shadow-black/20 backdrop-blur-xl"
      >
        <PopoverHeader className="flex-row items-start gap-3 border-b border-border/60 px-3.5 py-3">
          <Avatar size="sm" className="mt-0.5 bg-primary/10 text-primary">
            <AvatarFallback className="bg-primary/10 text-primary">
              <Bot aria-hidden="true" />
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <PopoverTitle className="text-sm font-bold">ترب‌چک</PopoverTitle>
            <PopoverDescription className="mt-0.5 text-xs leading-5">
              دستیار خرید حضوری تهران
            </PopoverDescription>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="بستن گفت‌وگو"
            onClick={() => setOpen(false)}
            className="-me-1 -mt-1 rounded-full text-muted-foreground"
          >
            <span aria-hidden="true">×</span>
          </Button>
        </PopoverHeader>

        <MessageScrollerProvider autoScroll scrollPreviousItemPeek={28}>
          <MessageScroller className="min-h-0 flex-1">
            <MessageScrollerViewport
              aria-label="گفت‌وگو با ترب‌چک"
              aria-live="polite"
            >
              <MessageScrollerContent className="gap-3 p-3">
                {messages.map((message) => {
                  if (message.role !== "assistant" && message.role !== "user") {
                    return null
                  }

                  const isAssistant = message.role === "assistant"
                  const messageText = getMessageText(message)

                  return (
                    <MessageScrollerItem
                      key={message.id}
                      messageId={message.id}
                      scrollAnchor={message.role === "user"}
                    >
                      <Message
                        align={isAssistant ? "start" : "end"}
                        className="gap-2"
                      >
                        {isAssistant && (
                          <MessageAvatar className="mb-0.5 w-7 min-w-7">
                            <Avatar size="sm">
                              <AvatarFallback className="bg-primary/10 text-primary">
                                <Bot aria-hidden="true" />
                              </AvatarFallback>
                            </Avatar>
                          </MessageAvatar>
                        )}
                        <MessageContent className="gap-1.5">
                          <MessageHeader className="px-2 text-[11px]">
                            {isAssistant ? "ترب‌چک" : "شما"}
                          </MessageHeader>
                          {messageText && (
                            <Bubble
                              align={isAssistant ? "start" : "end"}
                              variant={isAssistant ? "secondary" : "muted"}
                              className="max-w-[92%]"
                            >
                              <BubbleContent className="border-border/40 px-3 py-2.5 text-[13px] leading-6 whitespace-pre-wrap">
                                {messageText}
                              </BubbleContent>
                            </Bubble>
                          )}
                          {isAssistant &&
                            message.parts
                              .filter(isCatalogSearchPart)
                              .map((part, index) => {
                                const isRunning =
                                  part.state === "input-streaming" ||
                                  part.state === "input-available"
                                const catalogUnavailable =
                                  part.state === "output-available" &&
                                  !part.output.catalogAvailable

                                return (
                                  <Trace key={`${message.id}-catalog-${index}`}>
                                    <TraceLine
                                      status={
                                        part.state === "output-error" ||
                                        catalogUnavailable
                                          ? "error"
                                          : isRunning
                                            ? "running"
                                            : undefined
                                      }
                                      className="text-xs"
                                    >
                                      <TraceIcon>
                                        <Search aria-hidden="true" />
                                      </TraceIcon>
                                      <TraceTitle>
                                        {catalogUnavailable
                                          ? "کاتالوگ فروشگاه‌ها در دسترس نیست"
                                          : part.state === "output-error"
                                            ? "جست‌وجوی کالا ناموفق بود"
                                            : isRunning
                                              ? "دارم کالاها و فروشگاه‌ها را بررسی می‌کنم"
                                              : "اطلاعات فروشگاه‌ها بررسی شد"}
                                      </TraceTitle>
                                    </TraceLine>
                                  </Trace>
                                )
                              })}
                        </MessageContent>
                      </Message>
                    </MessageScrollerItem>
                  )
                })}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton
              aria-label="رفتن به تازه‌ترین پیام"
              className="size-7"
            />
          </MessageScroller>
        </MessageScrollerProvider>

        {messages.length === 1 && status === "ready" && (
          <div className="flex flex-wrap gap-1.5 px-3 pb-2">
            {quickPrompts.map((prompt) => (
              <Button
                key={prompt}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => submitMessage(prompt)}
                className="h-7 rounded-full px-2.5 text-[11px] font-normal"
              >
                {prompt}
              </Button>
            ))}
          </div>
        )}

        {status === "submitted" && (
          <div className="flex items-center gap-2 px-3 pb-2 text-xs text-muted-foreground">
            <LoaderCircle
              aria-hidden="true"
              className="size-3.5 animate-spin"
            />
            <span>دارم درخواستت را بررسی می‌کنم…</span>
          </div>
        )}

        {error && (
          <Alert variant="destructive" className="mx-3 mb-2 w-auto">
            <AlertCircle aria-hidden="true" />
            <AlertTitle className="text-xs">پاسخی دریافت نشد</AlertTitle>
            <AlertDescription className="flex items-center justify-between gap-2 text-xs">
              <span>
                پیکربندی دستیار یا اتصال به سرویس را بررسی کن و دوباره تلاش کن.
              </span>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => {
                  clearError()
                  void regenerate()
                }}
              >
                تلاش دوباره
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="px-3 pb-2.5">
          <FieldGroup className="gap-0">
            <Field>
              <FieldLabel
                htmlFor="torobcheck-assistant-input"
                className="sr-only"
              >
                پیام شما
              </FieldLabel>
              <InputGroup className="rounded-xl bg-background/70">
                <InputGroupTextarea
                  id="torobcheck-assistant-input"
                  dir="rtl"
                  value={input}
                  maxLength={500}
                  disabled={isBusy}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={handleInputKeyDown}
                  placeholder="دنبال چه محصولی هستی؟"
                  className="max-h-24 min-h-11 px-3 py-2 text-sm leading-5"
                />
                <InputGroupAddon align="inline-end" className="self-end pb-1.5">
                  <InputGroupButton
                    type={isBusy ? "button" : "submit"}
                    variant={isBusy ? "secondary" : "default"}
                    size="icon-sm"
                    disabled={!isBusy && !input.trim()}
                    aria-label={isBusy ? "توقف پاسخ" : "ارسال پیام"}
                    onClick={isBusy ? stop : undefined}
                    className="rounded-lg"
                  >
                    {isBusy ? (
                      <Square aria-hidden="true" />
                    ) : (
                      <ArrowUp aria-hidden="true" />
                    )}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </Field>
          </FieldGroup>
        </form>
      </PopoverContent>
    </Popover>
  )
}
