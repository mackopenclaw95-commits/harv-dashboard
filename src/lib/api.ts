const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://api.openclaw-yqar.srv1420157.hstgr.cloud";

export async function fetchAPI(path: string, options?: RequestInit) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export function getSSEUrl(path: string) {
  return `${API_BASE}${path}`;
}
