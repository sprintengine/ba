import { BEFORE_SIGN_OUT_MS, beforeSignOut, runBeforeSignOut } from "./before-sign-out";

describe("beforeSignOut", () => {
  it("runs registered tasks before sign-out, until unregistered", async () => {
    const task = jest.fn(() => Promise.resolve());
    const off = beforeSignOut(task);
    await runBeforeSignOut();
    expect(task).toHaveBeenCalledTimes(1);
    off();
    await runBeforeSignOut();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("never blocks signing out: failures are logged, slow tasks time out", async () => {
    jest.useFakeTimers();
    const offs = [
      beforeSignOut(() => Promise.reject(new Error("offline"))),
      beforeSignOut(() => new Promise(() => undefined)),
    ];
    const done = jest.fn();
    void runBeforeSignOut().then(done);
    await jest.advanceTimersByTimeAsync(BEFORE_SIGN_OUT_MS);
    expect(done).toHaveBeenCalled();
    offs.forEach((off) => off());
    jest.useRealTimers();
  });
});
