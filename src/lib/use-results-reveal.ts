import { useEffect, useRef } from "react";
import type { AnalysisResult } from "./types";

/** Animate presentation only; the displayed and exported counts stay exact. */
export function useResultsReveal(result: AnalysisResult | null) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (
      !result ||
      !container.current ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const animations: Animation[] = [];
    const elements = container.current.querySelectorAll<HTMLElement>(
      ".metric, .results-inner",
    );
    elements.forEach((element, index) => {
      if (typeof element.animate !== "function") return;
      animations.push(
        element.animate(
          [
            { opacity: 0.45, transform: "translateY(8px)" },
            { opacity: 1, transform: "translateY(0)" },
          ],
          {
            duration: 380,
            delay: index * 35,
            easing: "cubic-bezier(.2,.7,.2,1)",
            fill: "backwards",
          },
        ),
      );
    });
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const cancelOnPreferenceChange = () => {
      if (media.matches) animations.forEach((animation) => animation.cancel());
    };
    media.addEventListener("change", cancelOnPreferenceChange);
    return () => {
      animations.forEach((animation) => animation.cancel());
      media.removeEventListener("change", cancelOnPreferenceChange);
    };
  }, [result]);
  return container;
}
