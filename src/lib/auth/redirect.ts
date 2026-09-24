/** Keep post-login navigation inside this app, including after a failed attempt. */
export function safeLoginDestination(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020]/.test(value)) return "/";
  return value;
}

export function loginErrorUrl(message: string, destination: string): string {
  return `/login?${new URLSearchParams({ error: message, redirectTo: safeLoginDestination(destination) })}`;
}
