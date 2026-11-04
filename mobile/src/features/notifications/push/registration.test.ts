import * as Notifications from "expo-notifications";
import { calls, mockApi } from "~/test/api-mock";
import {
  REFRESH_MS,
  registerThisDevice,
  registeredToken,
  releaseThisDevice,
  unregisterThisDevice,
} from "./registration";

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { variant: "preview", eas: { projectId: "proj-1" } } } },
}));

const granted = () =>
  jest
    .mocked(Notifications.getPermissionsAsync)
    .mockResolvedValue({ status: "granted", canAskAgain: true, granted: true } as never);

function api({ offline = false } = {}) {
  return mockApi((method, path, body) => {
    if (path === "/v1/me/push-devices" && method === "POST")
      return { id: "d1", ...(body as object), createdAt: "", lastSeenAt: "" };
    if (path === "/v1/me/push-devices" && method === "DELETE") {
      if (offline) throw new TypeError("Network request failed");
      return new Response(null, { status: 204 });
    }
    return undefined;
  });
}

beforeEach(() => {
  jest
    .mocked(Notifications.getPermissionsAsync)
    .mockResolvedValue({ status: "undetermined", canAskAgain: true, granted: false } as never);
  jest.mocked(Notifications.unregisterForNotificationsAsync).mockClear();
  jest.mocked(Notifications.getExpoPushTokenAsync).mockClear();
  jest.mocked(Notifications.setBadgeCountAsync).mockClear();
});

describe("push registration", () => {
  it("registers this device's token for the person, with the platform and app variant", async () => {
    granted();
    const fetch = api();
    expect(await registerThisDevice("u1", 1_000)).toBe("registered");
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: "proj-1" });
    const [, init] = fetch.mock.calls[0]!;
    expect(JSON.parse(init!.body as string)).toEqual({
      token: "ExponentPushToken[test]",
      platform: "ios",
      appVariant: "preview",
    });
    expect(registeredToken()).toBe("ExponentPushToken[test]");
  });

  it("doesn't register again within a day for the same person and token, but does for someone else", async () => {
    granted();
    const fetch = api();
    await registerThisDevice("u1", 1_000);
    expect(await registerThisDevice("u1", 2_000)).toBe("unchanged");
    expect(await registerThisDevice("u2", 3_000)).toBe("registered");
    expect(await registerThisDevice("u2", 3_000 + REFRESH_MS)).toBe("registered");
    expect(calls(fetch)).toHaveLength(3);
  });

  it("does nothing without permission or a token", async () => {
    const fetch = api();
    expect(await registerThisDevice("u1")).toBe("no-permission");
    granted();
    jest.mocked(Notifications.getExpoPushTokenAsync).mockRejectedValueOnce(new Error("no aps-environment"));
    expect(await registerThisDevice("u1")).toBe("unavailable");
    expect(calls(fetch)).toEqual([]);
  });

  it("unregisters on sign-out and clears the badge", async () => {
    granted();
    const fetch = api();
    await registerThisDevice("u1");
    await unregisterThisDevice();
    expect(calls(fetch)).toEqual(["POST /v1/me/push-devices", "DELETE /v1/me/push-devices"]);
    const [, init] = fetch.mock.calls[1]!;
    expect(JSON.parse(init!.body as string)).toEqual({ token: "ExponentPushToken[test]" });
    expect(Notifications.setBadgeCountAsync).toHaveBeenCalledWith(0);
    expect(registeredToken()).toBeNull();
    // The backend stopped pushing here: nothing to turn off once signed out.
    await releaseThisDevice();
    expect(Notifications.unregisterForNotificationsAsync).not.toHaveBeenCalled();
    // Signed in again: registers again straight away.
    expect(await registerThisDevice("u1")).toBe("registered");
  });

  it("when sign-out can't reach the backend, turns push off on this device once signed out, until someone signs in", async () => {
    granted();
    const fetch = api({ offline: true });
    await registerThisDevice("u1");
    await expect(unregisterThisDevice()).rejects.toThrow();
    expect(registeredToken()).toBe("ExponentPushToken[test]");

    await releaseThisDevice();
    expect(Notifications.unregisterForNotificationsAsync).toHaveBeenCalledTimes(1);
    expect(registeredToken()).toBeNull();
    expect(Notifications.setBadgeCountAsync).toHaveBeenLastCalledWith(0);
    // Only once.
    await releaseThisDevice();
    expect(Notifications.unregisterForNotificationsAsync).toHaveBeenCalledTimes(1);

    // Signing in again gets a token again (which turns push back on) and registers it.
    expect(await registerThisDevice("u2")).toBe("registered");
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(2);
    expect(calls(fetch)).toEqual([
      "POST /v1/me/push-devices",
      "DELETE /v1/me/push-devices",
      "POST /v1/me/push-devices",
    ]);
  });

  it("keeps the registration when push can't be turned off, to try again on the next launch", async () => {
    granted();
    api();
    await registerThisDevice("u1");
    jest
      .mocked(Notifications.unregisterForNotificationsAsync)
      .mockRejectedValueOnce(new Error("SERVICE_NOT_AVAILABLE"));
    await expect(releaseThisDevice()).rejects.toThrow("SERVICE_NOT_AVAILABLE");
    expect(registeredToken()).toBe("ExponentPushToken[test]");
    await releaseThisDevice();
    expect(registeredToken()).toBeNull();
    expect(Notifications.unregisterForNotificationsAsync).toHaveBeenCalledTimes(2);
  });

  it("registering waits for a release in progress, so the fresh token isn't turned off", async () => {
    granted();
    api();
    await registerThisDevice("u1");
    let finish = () => undefined as void;
    jest
      .mocked(Notifications.unregisterForNotificationsAsync)
      .mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)));
    const release = releaseThisDevice();
    const register = registerThisDevice("u2");
    await Promise.resolve();
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(1);
    finish();
    await release;
    expect(await register).toBe("registered");
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(2);
    expect(registeredToken()).toBe("ExponentPushToken[test]");
  });

  it("does nothing once signed out when this device was never registered", async () => {
    await releaseThisDevice();
    expect(Notifications.unregisterForNotificationsAsync).not.toHaveBeenCalled();
  });
});
