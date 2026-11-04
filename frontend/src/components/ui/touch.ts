/**
 * An invisible 44px hit area centred on a small control (checkbox, radio, switch) on touch screens, so it keeps its
 * size and still takes a fingertip. The control needs nothing else: this sets `relative` itself.
 */
export const touchHitArea =
  "relative pointer-coarse:before:absolute pointer-coarse:before:top-1/2 pointer-coarse:before:left-1/2 pointer-coarse:before:size-11 pointer-coarse:before:-translate-1/2";
