import "server-only";
import { completeWithFallback, parseJson } from "./fallback";
import type { ProviderRequest } from "./providers/gemini";

export { AIError } from "./providers/gemini";
export { completeWithFallback, parseJson };

export type GatewayRequest = ProviderRequest;

export async function gateway(request: GatewayRequest) {
  return completeWithFallback(request);
}
