import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ThemeProvider } from "./components/ThemeProvider";
import { TooltipProvider } from "./components/ui/tooltip";
import { logger } from "./lib/logger";
import { TOOLTIP_DELAY_MS } from "./lib/constants";
import { applyTypography } from "./lib/typography";
import "./index.css";
import "highlight.js/styles/github-dark.css";

logger.info("lifecycle", "App starting");
applyTypography();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ThemeProvider>
          <TooltipProvider delayDuration={TOOLTIP_DELAY_MS}>
            <App />
          </TooltipProvider>
        </ThemeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
