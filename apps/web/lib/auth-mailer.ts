import "server-only"
import nodemailer from "nodemailer"
import { getRuntimeSettings } from "@/lib/runtime-settings"

export async function sendAuthLink(to: string, url: string, purpose: string) {
  const { smtpUrl, smtpFrom: from } = await getRuntimeSettings()
  if (!smtpUrl || !from) {
    throw new Error("SMTP_URL and SMTP_FROM are required for merchant email")
  }

  const transport = nodemailer.createTransport(smtpUrl)
  await transport.sendMail({
    from,
    to,
    subject: purpose,
    text: `${purpose}\n\n${url}\n\nIf you did not request this, you can ignore this email.`,
  })
}
