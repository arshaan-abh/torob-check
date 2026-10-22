type RuntimeConfigResponse = {
  neshanApiKey: string
}

/** Load the browser-visible Neshan key when initializing the client-side map. */
export async function getNeshanApiKey(): Promise<string> {
  const response = await fetch("/api/runtime-config", {
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error("Map configuration is unavailable.")
  }

  const config = (await response.json()) as RuntimeConfigResponse

  if (!config.neshanApiKey) {
    throw new Error("Map configuration is unavailable.")
  }

  return config.neshanApiKey
}
