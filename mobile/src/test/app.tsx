/**
 * Render the whole app (the real `app/` routes, root providers, dev auth) in memory, for flows across screens:
 * launch → sign in → home, deep links, role-based navigation. Stub the API with `mockApi` first.
 */
import { renderRouter } from "expo-router/testing-library";
import { encodeDevToken, type DevIdentity } from "@shared/auth/dev-token";
import { secureStoreMock } from "./secure-store";

/** The real routes (resolved from the working directory: Jest runs in mobile/). */
const APP_DIR = "./app";

export type RenderAppOptions = {
  initialUrl?: string;
  /** Start signed in as this dev identity (otherwise signed out). */
  signedInAs?: DevIdentity;
};

export function renderApp({ initialUrl = "/", signedInAs }: RenderAppOptions = {}) {
  if (signedInAs) secureStoreMock.setItem("bookanything.devAuth", encodeDevToken(signedInAs));
  return renderRouter(APP_DIR, { initialUrl });
}
