import { describe, expect, it } from "vitest";
import { endDraw, motion } from "./motion";

describe("motion", () => {
  it("carries an animation on across redraws, then stops", () => {
    expect(motion("a", "fade", 200, 1000)).toBe("animation:fade 200ms cubic-bezier(.2,.7,.3,1) 0ms both;");
    endDraw();
    expect(motion("a", "flip", 200, 1120)).toContain("fade 200ms cubic-bezier(.2,.7,.3,1) -120ms");   // the first name stays
    endDraw();
    expect(motion("a", "fade", 200, 1300)).toBe("");
    endDraw();
  });
  it("a part left out of a draw animates again when it comes back", () => {
    motion("b", "fade", 200, 0); endDraw();
    endDraw();   // a draw without it (a card hovered)
    expect(motion("b", "fade", 200, 5000)).toContain(" 0ms both");
    endDraw();
  });
});
