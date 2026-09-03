export class BodyLimitError extends Error {
  maxBytes: number;
  constructor(maxBytes: number) {
    super('PAYLOAD_TOO_LARGE');
    this.name = 'BodyLimitError';
    this.maxBytes = maxBytes;
  }
}

export const VERIFY_BODY_LIMIT = 4_096;
export const SCAN_BODY_LIMIT = 32_768;

export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maxBytes) throw new BodyLimitError(maxBytes);
  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > maxBytes) throw new BodyLimitError(maxBytes);
  const text = new TextDecoder().decode(buffer);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new SyntaxError('INVALID_JSON');
  }
}
