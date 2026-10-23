import "server-only"

export function parsePublicHttpsUrl(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "")
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal" ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
    host.includes(":")
  ) {
    return null
  }
  url.hash = ""
  return url
}

export function hostMatchesDomain(urlValue: string, domain: string) {
  const url = parsePublicHttpsUrl(urlValue)
  const candidate = domain.toLowerCase().replace(/^www\./, "")
  const host = url?.hostname.toLowerCase().replace(/^www\./, "")
  return Boolean(host && (host === candidate || host.endsWith(`.${candidate}`)))
}
