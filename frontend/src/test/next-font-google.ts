/**
 * Vitest stand-in for `next/font/google` (a build-time Next feature): every font is a function
 * returning a stable class name and CSS variable.
 */
type FontOptions = { variable?: string };
const font = (options: FontOptions = {}) => ({
  className: "font-mock",
  variable: options.variable ? `var-mock${options.variable}` : "",
  style: { fontFamily: "mock" },
});

export const Archivo = font;
export const DM_Sans = font;
export const Fraunces = font;
export const Fredoka = font;
export const Geist = font;
export const IBM_Plex_Sans = font;
export const Instrument_Sans = font;
export const Instrument_Serif = font;
export const Nunito = font;
