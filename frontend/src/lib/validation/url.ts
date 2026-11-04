import * as z from "zod";

/** `Validator.url` on the backend refuses longer addresses. */
export const URL_MAX_LENGTH = 500;

/**
 * An optional web address as the backend's `Validator.url` takes it: blank, or http(s) with no spaces and at most
 * 500 characters. `message` says what kind of address is expected.
 */
export function optionalHttpUrl(message: string) {
  return z.union([
    z.literal(""),
    z
      .url({ message })
      .max(URL_MAX_LENGTH, `Keep it under ${URL_MAX_LENGTH} characters`)
      .refine((u) => /^https?:\/\/\S+$/.test(u), message),
  ]);
}
