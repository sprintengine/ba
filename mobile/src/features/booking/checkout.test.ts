import * as WebBrowser from "expo-web-browser";
import { publicApi } from "@shared/api/public";
import { openCheckout, sessionFromUrl } from "./checkout";

jest.mock("expo-web-browser", () => ({
  openBrowserAsync: jest.fn(() => Promise.resolve({ type: "dismiss" })),
  openAuthSessionAsync: jest.fn(),
  maybeCompleteAuthSession: jest.fn(),
}));
// The website on https, as in production: its manage page closes the authentication session.
jest.mock("~/lib/links", () => ({
  ...jest.requireActual<object>("~/lib/links"),
  websiteUrl: (path: string) => `https://bookanything.example${path}`,
}));
jest.mock("@shared/api/public", () => ({
  publicApi: { confirmManagedPayment: jest.fn(() => Promise.resolve({})) },
}));

const authSession = jest.mocked(WebBrowser.openAuthSessionAsync);
const confirm = jest.mocked(publicApi.confirmManagedPayment);

describe("Checkout from the app", () => {
  beforeEach(() => {
    authSession.mockReset();
    confirm.mockClear();
  });

  it("reads the Checkout Session Stripe sent back", () => {
    expect(sessionFromUrl("https://x.ie/manage/t?payment=succeeded&session_id=cs_test_9")).toBe("cs_test_9");
    expect(sessionFromUrl("https://x.ie/manage/t?payment=succeeded")).toBeNull();
    expect(sessionFromUrl(null)).toBeNull();
  });

  it("confirms a paid checkout straight away", async () => {
    authSession.mockResolvedValue({
      type: "success",
      url: "https://bookanything.example/manage/tok?payment=succeeded&session_id=cs_test_9",
    });
    await expect(openCheckout("https://checkout.stripe.test/c/1", "tok")).resolves.toBe("succeeded");
    expect(confirm).toHaveBeenCalledWith("tok", { sessionId: "cs_test_9" });
  });

  it("still reports the payment when confirming it fails (the webhook confirms it anyway)", async () => {
    authSession.mockResolvedValue({
      type: "success",
      url: "https://bookanything.example/manage/tok?payment=succeeded&session_id=cs_test_9",
    });
    confirm.mockRejectedValueOnce(new Error("offline"));
    await expect(openCheckout("https://checkout.stripe.test/c/1", "tok")).resolves.toBe("succeeded");
  });

  it("confirms nothing for a cancelled checkout", async () => {
    authSession.mockResolvedValue({
      type: "success",
      url: "https://bookanything.example/manage/tok?payment=cancelled",
    });
    await expect(openCheckout("https://checkout.stripe.test/c/1", "tok")).resolves.toBe("cancelled");
    expect(confirm).not.toHaveBeenCalled();
  });
});
