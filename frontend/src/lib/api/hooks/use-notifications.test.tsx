/** Notifications: the mobile app's push devices. */
import { act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pushDevice } from "../__tests__/fixtures/notifications";
import type { PushDeviceInput } from "../types";
import { useRegisterPushDevice, useUnregisterPushDevice } from "./use-notifications";
import { fail, json, noContent, renderApiHook, stubApi } from "./__tests__/harness";

afterEach(() => vi.unstubAllGlobals());

const TOKEN = "ExponentPushToken[abc]";

describe("push devices", () => {
  it("registering this device sends its token, platform and app variant, and caches nothing", async () => {
    const input: PushDeviceInput = { token: TOKEN, platform: "ios", appVariant: "production" };
    const api = stubApi({ "POST /v1/me/push-devices": json(pushDevice) });
    const view = renderApiHook(() => useRegisterPushDevice(), { seed: true });

    await expect(act(() => view.result.current.mutateAsync(input))).resolves.toEqual(pushDevice);

    expect(api.last().body).toEqual(input);
    expect(view.invalidated()).toEqual([]);
    expect(view.removed()).toEqual([]);
  });

  it("unregistering sends the token in the DELETE body, and caches nothing", async () => {
    const api = stubApi({ "DELETE /v1/me/push-devices": noContent });
    const view = renderApiHook(() => useUnregisterPushDevice(), { seed: true });

    await act(() => view.result.current.mutateAsync(TOKEN));

    expect(api.last()).toMatchObject({ method: "DELETE", body: { token: TOKEN } });
    expect(view.invalidated()).toEqual([]);
    expect(view.removed()).toEqual([]);
  });

  it("surfaces the API error", async () => {
    stubApi({ "POST /v1/me/push-devices": fail(400, "VALIDATION_ERROR") });
    const view = renderApiHook(() => useRegisterPushDevice());

    await expect(
      act(() => view.result.current.mutateAsync({ token: "", platform: "android", appVariant: "preview" })),
    ).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
  });
});
