import { describe, expect, it } from "vitest";
import { keywordScore } from "./GroupDiscoveryDialog";

describe("keyword group ranking", () => {
  it("counts each chosen keyword found in the group name", () => {
    expect(keywordScore("דירות להשכרה בתל אביב", ["תל אביב", "להשכרה", "חיפה"])).toBe(2);
  });
  it("scores zero when no keyword matches", () => {
    expect(keywordScore("קבוצת בישול", ["דירות"])).toBe(0);
  });
});
