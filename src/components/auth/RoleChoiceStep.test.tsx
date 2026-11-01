import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { RoleChoiceStep } from "@/components/auth/RoleChoiceStep";

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn(async () => {}) }));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, signOut }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [] }) }) }),
  },
}));

vi.mock("@/i18n/personalLanguage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/i18n/personalLanguage")>();
  return {
    ...actual,
    usePersonalLanguage: () => ({
      gender: undefined,
      command: (text?: string) => text,
      text: (forms: { male: string; female: string; neutral?: string }) => forms.neutral ?? forms.male,
    }),
  };
});

vi.mock("@/hooks/useUserRole", () => ({ userRolesQueryKey: (id: string) => ["user-roles", id] }));
vi.mock("@/lib/signupRole", () => ({ clearPendingSignupRole: vi.fn(), markPostSignupWelcome: vi.fn() }));
vi.mock("@/lib/rewardFeedback", () => ({ prepareRewardSounds: vi.fn() }));
vi.mock("@/components/auth/BrokerLicenseField", () => ({ BrokerLicenseField: () => null }));
vi.mock("@/components/auth/BrokerCertificateCheck", () => ({ BrokerCertificateCheck: () => null }));
vi.mock("@/components/auth/BrokerLicensePhotoUpload", () => ({
  BrokerLicensePhotoUpload: () => null,
  uploadBrokerLicensePhoto: vi.fn(),
  requestBrokerLicenseReview: vi.fn(),
  BROKER_LICENSE_REVIEW_MESSAGE: "",
}));

const PathProbe = () => {
  const { pathname } = useLocation();
  return <span data-testid="path">{pathname}</span>;
};

const render = () =>
  rtlRender(
    <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <PathProbe />
              <RoleChoiceStep />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
    </QueryClientProvider>,
  );

describe("user type step closing", () => {
  it("signs out and leaves for the homepage when the close button is pressed", async () => {
    render();
    expect(screen.getByTestId("path").textContent).toBe("/dashboard");
    fireEvent.click(screen.getByRole("button", { name: "סגירה ויציאה מהחשבון" }));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId("path").textContent).toBe("/"));
  });

  it("offers every user type and hides the back arrow until one is chosen", () => {
    render();
    expect(screen.getAllByRole("button", { name: /^(בעל נכס|קונה\/שוכר|מתווך\/סוכנות|יזם \/ קבלן|תוכנית שותפים)$/ })).toHaveLength(5);
    expect(screen.queryByRole("button", { name: "חזרה" })).toBeNull();
  });

  it("returns to the user type list from the back arrow without signing out", () => {
    render();
    fireEvent.click(screen.getByRole("button", { name: "בעל נכס" }));
    fireEvent.click(screen.getByRole("button", { name: "חזרה" }));
    expect(screen.getAllByRole("button", { name: /^(בעל נכס|קונה\/שוכר|מתווך\/סוכנות|יזם \/ קבלן|תוכנית שותפים)$/ })).toHaveLength(5);
    expect(signOut).not.toHaveBeenCalled();
    expect(screen.getByTestId("path").textContent).toBe("/dashboard");
  });
});
