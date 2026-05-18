import {
  COPY_FEEDBACK_MS,
  BOOT_MIN_DISPLAY_MS,
  BOOT_TIMEOUT_MS,
  TOOLTIP_DELAY_MS,
  SIDEBAR_SESSION_LIMIT,
  TITLE_PREVIEW_MAX_LEN,
  HIGHLIGHT_SIZE_LIMIT,
  ESTIMATE_SESSION_ITEM_HEIGHT,
  DEFAULT_ACTIVITY_WEEKS,
  MASONRY_BREAKPOINT_XL,
  MASONRY_BREAKPOINT_LG,
  MASONRY_BREAKPOINT_SM,
} from "../constants";

describe("constants", () => {
  it("timing constants are positive numbers", () => {
    expect(COPY_FEEDBACK_MS).toBeGreaterThan(0);
    expect(BOOT_MIN_DISPLAY_MS).toBeGreaterThan(0);
    expect(BOOT_TIMEOUT_MS).toBeGreaterThan(0);
    expect(TOOLTIP_DELAY_MS).toBeGreaterThan(0);
  });

  it("boot timeout is greater than boot min display", () => {
    expect(BOOT_TIMEOUT_MS).toBeGreaterThan(BOOT_MIN_DISPLAY_MS);
  });

  it("text limits are positive", () => {
    expect(TITLE_PREVIEW_MAX_LEN).toBeGreaterThan(0);
    expect(HIGHLIGHT_SIZE_LIMIT).toBeGreaterThan(0);
  });

  it("sidebar session limit is reasonable", () => {
    expect(SIDEBAR_SESSION_LIMIT).toBeGreaterThanOrEqual(100);
    expect(SIDEBAR_SESSION_LIMIT).toBeLessThanOrEqual(10000);
  });

  it("virtual list estimates are positive", () => {
    expect(ESTIMATE_SESSION_ITEM_HEIGHT).toBeGreaterThan(0);
  });

  it("masonry breakpoints are ordered correctly", () => {
    expect(MASONRY_BREAKPOINT_XL).toBeGreaterThan(MASONRY_BREAKPOINT_LG);
    expect(MASONRY_BREAKPOINT_LG).toBeGreaterThan(MASONRY_BREAKPOINT_SM);
  });

  it("default activity weeks is reasonable", () => {
    expect(DEFAULT_ACTIVITY_WEEKS).toBeGreaterThan(0);
    expect(DEFAULT_ACTIVITY_WEEKS).toBeLessThanOrEqual(52);
  });
});
