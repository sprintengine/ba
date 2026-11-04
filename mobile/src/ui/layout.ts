import { useWindowDimensions } from "react-native";
import { WIDE_BREAKPOINT } from "./tokens";

export type Layout = {
  /** iPad (full or two-thirds width), large phones in landscape: sidebar navigation and split views. */
  isWide: boolean;
  width: number;
  height: number;
};

/**
 * The window's size class. Follows the window, not the device: an iPad app in a narrow Split View or Slide Over is a
 * phone layout, and switches live as the window is resized.
 */
export function useLayout(): Layout {
  const { width, height } = useWindowDimensions();
  return { isWide: width >= WIDE_BREAKPOINT, width, height };
}
