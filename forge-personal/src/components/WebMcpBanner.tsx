'use client';

import { originTrialAllowsWebMcp, originTrialConfigured } from '@/lib/webmcp/originTrial';

export function WebMcpBanner() {
  if (originTrialConfigured() || originTrialAllowsWebMcp()) return null;
  return <div className="originTrialBanner" data-testid="origin-trial-banner" role="status">
    <strong>WebMCP origin trial is not configured.</strong>
    <span>This production origin will not claim WebMCP. Set NEXT_PUBLIC_ORIGIN_TOKEN and reload after Chrome 149–156 receives the trial header.</span>
  </div>;
}
