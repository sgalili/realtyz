import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { WelcomeSlides } from "@/components/public/WelcomeSlides";

beforeAll(() => {
  // jsdom has no Web Animations API; the slide background drift calls element.animate().
  Element.prototype.animate = vi.fn(() => ({
    onfinish: null,
    cancel: vi.fn(),
  })) as unknown as typeof Element.prototype.animate;
});

const openSlide = (number: number) => {
  const view = render(<WelcomeSlides onDone={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: `שקופית ${number}` }));
  return view;
};

describe("welcome slide 3", () => {
  it("names property owners instead of private individuals", () => {
    const { container } = openSlide(3);
    const copy = container.textContent ?? "";
    expect(copy).toContain("בעלי נכסים");
    expect(copy).not.toContain("פרטיים");
    expect(copy).toContain("כאן כולם שותפים");
  });

  it("draws an Israeli shekel sign inside each of the three nodes", () => {
    const { container } = openSlide(3);
    const art = container.querySelector(".welcome-icon");
    expect(art).not.toBeNull();
    expect(art?.querySelectorAll("circle")).toHaveLength(3);
    // One shekel glyph per node: left upright + arm arcing down-right, mirrored pair.
    const shekels = art?.querySelectorAll('path[d^="M-1.39 1.7"]') ?? [];
    expect(shekels).toHaveLength(3);
  });

  it("keeps the shekel art out of the other slides", () => {
    const { container } = openSlide(1);
    expect(container.querySelector('.welcome-icon path[d^="M-1.39 1.7"]')).toBeNull();
  });
});
