// React 19 types no longer declare the global JSX namespace; existing
// annotations such as `JSX.Element` keep resolving to React's JSX types.
import type { JSX as ReactJSX } from "react";

declare global {
  namespace JSX {
    type Element = ReactJSX.Element;
    type IntrinsicElements = ReactJSX.IntrinsicElements;
  }
}
