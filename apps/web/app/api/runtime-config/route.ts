const noStoreHeaders = {
  "Cache-Control": "no-store",
}

export async function GET() {
  const neshanApiKey = process.env.NESHAN_API_KEY?.trim()

  if (!neshanApiKey) {
    return Response.json(
      { error: "Map configuration is not set." },
      { status: 503, headers: noStoreHeaders }
    )
  }

  return Response.json({ neshanApiKey }, { headers: noStoreHeaders })
}
