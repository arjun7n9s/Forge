export function originTrialToken(): string | undefined {
  const token = process.env.NEXT_PUBLIC_ORIGIN_TOKEN?.trim();
  return token ? token : undefined;
}

export function originTrialConfigured(): boolean {
  return originTrialToken() !== undefined;
}

/** Production without a trial token must not claim a WebMCP transport. */
export function originTrialAllowsWebMcp(): boolean {
  if (originTrialConfigured()) return true;
  return process.env.NODE_ENV !== 'production';
}
