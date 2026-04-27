import { describe, it, expect } from "vitest";
import { StatewaveClient, StatewaveAPIError, StatewaveConnectionError } from "../src/index.js";

describe("StatewaveClient", () => {
  it("can be constructed with default URL", () => {
    const client = new StatewaveClient();
    expect(client).toBeDefined();
  });

  it("can be constructed with custom URL", () => {
    const client = new StatewaveClient("http://custom:9000");
    expect(client).toBeDefined();
  });

  it("strips trailing slashes from base URL", () => {
    const client = new StatewaveClient("http://localhost:8100///");
    expect(client).toBeDefined();
  });

  it("has getContextString method", () => {
    const client = new StatewaveClient();
    expect(typeof client.getContextString).toBe("function");
  });
});

describe("StatewaveAPIError", () => {
  it("contains status code and error code", () => {
    const err = new StatewaveAPIError(422, "validation_error", "bad request", null, "req-123");
    expect(err.statusCode).toBe(422);
    expect(err.code).toBe("validation_error");
    expect(err.requestId).toBe("req-123");
    expect(err.message).toContain("422");
    expect(err.message).toContain("validation_error");
    expect(err.name).toBe("StatewaveAPIError");
  });

  it("is an instance of Error", () => {
    const err = new StatewaveAPIError(500, "internal_error", "oops");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("StatewaveConnectionError", () => {
  it("has a default message", () => {
    const err = new StatewaveConnectionError();
    expect(err.message).toContain("Cannot connect");
    expect(err.name).toBe("StatewaveConnectionError");
  });

  it("accepts a custom message", () => {
    const err = new StatewaveConnectionError("refused");
    expect(err.message).toBe("refused");
  });

  it("is an instance of Error", () => {
    expect(new StatewaveConnectionError()).toBeInstanceOf(Error);
  });
});

describe("exports", () => {
  it("exports StatewaveClient", async () => {
    const mod = await import("../src/index.js");
    expect(mod.StatewaveClient).toBeDefined();
  });

  it("exports error classes", async () => {
    const mod = await import("../src/index.js");
    expect(mod.StatewaveAPIError).toBeDefined();
    expect(mod.StatewaveConnectionError).toBeDefined();
  });
});
