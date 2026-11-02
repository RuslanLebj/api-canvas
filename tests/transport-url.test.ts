import { describe, expect, it } from "vitest";
import { toTransportUrl } from "../server/transport-url";

describe("container transport URL", () => {
  it("routes host loopback through the Docker host gateway", () => {
    expect(toTransportUrl("http://localhost:8000/openapi.json", "host.docker.internal"))
      .toBe("http://host.docker.internal:8000/openapi.json");
    expect(toTransportUrl("http://127.0.0.1:8000/api?q=1", "host.docker.internal"))
      .toBe("http://host.docker.internal:8000/api?q=1");
  });

  it("keeps remote URLs and non-container launches unchanged", () => {
    expect(toTransportUrl("https://api.example.com/v1", "host.docker.internal"))
      .toBe("https://api.example.com/v1");
    expect(toTransportUrl("http://localhost:8000/openapi.json", ""))
      .toBe("http://localhost:8000/openapi.json");
  });
});
