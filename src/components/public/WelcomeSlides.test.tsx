import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { WelcomeSlides } from "@/components/public/WelcomeSlides";

beforeAll(() => {
  Element.prototype.animate = vi.fn(() => ({ onfinish: null, cancel: vi.fn() })) as unknown as typeof Element.prototype.animate;
});

describe("welcome slides", () => {
  it("has exactly 3 slides", () => {
    render(<WelcomeSlides onDone={() => {}} />);
    expect(screen.getAllByRole("button", { name: /^שקופית \d$/ })).toHaveLength(3);
  });
  it("never uses long dashes", () => {
    const { container } = render(<WelcomeSlides onDone={() => {}} />);
    for (const n of [1, 2, 3]) {
      fireEvent.click(screen.getByRole("button", { name: `שקופית ${n}` }));
      expect(container.textContent).not.toMatch(/[—–]/);
    }
  });
  it("slide 1 starts with המהפכה בעולם הנדל״ן and drops מקצה לקצה", () => {
    const { container } = render(<WelcomeSlides onDone={() => {}} />);
    expect(container.querySelector("h2")?.textContent?.startsWith("המהפכה בעולם הנדל״ן")).toBe(true);
    expect(container.textContent).not.toContain("מקצה לקצה");
  });
});
