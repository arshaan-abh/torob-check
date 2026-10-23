import "server-only"
import nodemailer from "nodemailer"
import { getRuntimeSettings } from "@/lib/runtime-settings"

export async function sendAuthLink(to: string, url: string, purpose: string) {
  const {
    emailProvider,
    smtpUrl,
    smtpFrom: from,
    resendApiKey,
  } = await getRuntimeSettings()
  if (!from) {
    throw new Error("SMTP_FROM is required for account email")
  }

  const text = `${purpose}\n\n${url}\n\nIf you did not request this, you can ignore this email.`

  if (emailProvider === "resend") {
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY is required for account email")
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject: purpose, text }),
      signal: AbortSignal.timeout(15_000),
    })

    if (!response.ok) {
      throw new Error(`Resend email delivery failed (${response.status})`)
    }
    return
  }

  if (emailProvider !== "smtp") {
    throw new Error("Choose a supported account email provider")
  }
  if (!smtpUrl) {
    throw new Error("SMTP_URL is required for account email")
  }

  const transport = nodemailer.createTransport(smtpUrl)
  await transport.sendMail({ from, to, subject: purpose, text })
}
