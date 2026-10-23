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
  if (!from) return

  const text = `${purpose}\n\n${url}\n\nIf you did not request this, you can ignore this email.`

  if (emailProvider === "resend") {
    if (!resendApiKey) return

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
    return
  }
  if (!smtpUrl) return

  const transport = nodemailer.createTransport(smtpUrl)
  await transport.sendMail({ from, to, subject: purpose, text })
}
