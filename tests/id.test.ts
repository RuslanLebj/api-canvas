import { afterEach, describe, expect, it, vi } from "vitest";
import { createId } from "../shared/id";

afterEach(() => vi.unstubAllGlobals());

describe("createId", () => {
  it("creates a UUID when randomUUID is unavailable on an insecure LAN origin", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.forEach((_value, index) => void (bytes[index] = index));
        return bytes;
      },
    });

    expect(createId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
