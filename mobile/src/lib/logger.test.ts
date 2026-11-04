import { ApiError } from "@shared/api/client";
import { isReportable, logError, setErrorReporter, setReportedUser } from "./logger";

describe("logger", () => {
  const reporter = { captureException: jest.fn(), setUser: jest.fn() };
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    setErrorReporter(reporter);
  });
  afterEach(() => {
    setErrorReporter(null);
    jest.restoreAllMocks();
    reporter.captureException.mockReset();
  });

  it("reports bugs and server errors, not expected API states", () => {
    expect(isReportable(new Error("boom"))).toBe(true);
    expect(isReportable(new ApiError(500, "INTERNAL_SERVER_ERROR", "x"))).toBe(true);
    expect(isReportable(new ApiError(404, "NOT_FOUND", "x"))).toBe(false);
    expect(isReportable(new ApiError(0, "NETWORK_ERROR", "x"))).toBe(false);
  });

  it("hands reportable errors and the user to the reporter", () => {
    const error = new Error("boom");
    logError(error, { screen: "bookings" });
    logError(new ApiError(401, "UNAUTHENTICATED", "x"));
    setReportedUser("u1");
    expect(reporter.captureException).toHaveBeenCalledTimes(1);
    expect(reporter.captureException).toHaveBeenCalledWith(error, { screen: "bookings" });
    expect(reporter.setUser).toHaveBeenCalledWith("u1");
  });
});
