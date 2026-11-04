import { domMax } from "motion/react";

/**
 * motion's animation and layout features, for `LazyMotion` to load after the page:
 *   <LazyMotion features={loadMotionFeatures}><m.span layoutId=… /></LazyMotion>
 * `m` components are the small core; this chunk (most of motion) arrives once the page is up, before anyone can
 * click anything that animates.
 */
export default domMax;
