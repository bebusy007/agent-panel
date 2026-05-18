import Masonry from "react-masonry-css";
import { ReactNode } from "react";
import { MASONRY_BREAKPOINT_XL, MASONRY_BREAKPOINT_LG, MASONRY_BREAKPOINT_SM } from "@/lib/constants";

const breakpoints = {
  default: 4,
  [MASONRY_BREAKPOINT_XL]: 3,
  [MASONRY_BREAKPOINT_LG]: 2,
  [MASONRY_BREAKPOINT_SM]: 1,
};

export function MasonryGrid({ children }: { children: ReactNode }) {
  return (
    <Masonry
      breakpointCols={breakpoints}
      className="masonry-grid"
      columnClassName="masonry-column"
    >
      {children}
    </Masonry>
  );
}
