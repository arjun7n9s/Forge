export function originTrialToken(): string | undefined {
  const token = process.env.NEXT_PUBLIC_ORIGIN_TOKEN?.trim();
  return token ? token : undefined;
}

export function originTrialConfigured(): boolean {
  return originTrialToken() !== undefined;
}

export function originTrialAllowsWebMcp(): boolean {
  if (originTrialConfigured()) return true;
  return process.env.NODE_ENV !== 'production';
}
