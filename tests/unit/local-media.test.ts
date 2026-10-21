import { describe, expect, it } from "vitest";
import { mediaErrorMessage } from "@/lib/video/use-local-media";

describe("local media errors", () => {
  it("maps permission denial", () => {
    expect(mediaErrorMessage(Object.assign(new Error("denied"), { name: "NotAllowedError" }))).toMatch(
      /Allow camera/,
    );
  });

  it("maps missing devices", () => {
    expect(mediaErrorMessage(Object.assign(new Error("missing"), { name: "NotFoundError" }))).toMatch(
      /No camera/,
    );
  });

  it("maps devices already in use", () => {
    expect(mediaErrorMessage(Object.assign(new Error("busy"), { name: "NotReadableError" }))).toMatch(
      /already in use/,
    );
  });
});
