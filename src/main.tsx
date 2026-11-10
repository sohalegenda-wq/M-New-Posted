import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider } from "./lib";
import App from "./App";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/inter/cyrillic-400.css";
import "@fontsource/inter/cyrillic-500.css";
import "@fontsource/inter/cyrillic-600.css";
import "@fontsource/inter/cyrillic-700.css";
import "@fontsource/inter/cyrillic-ext-400.css";
import "./styles.css";
const client = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15000, retry: 1, refetchOnWindowFocus: false },
  },
});
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="fatal-error">
        <h1>Не удалось открыть пространство</h1>
        <p>Обновите страницу и попробуйте снова.</p>
        <button className="button" onClick={() => location.reload()}>
          Обновить
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <Provider>
          <App />
        </Provider>
      </BrowserRouter>
    </QueryClientProvider>
  </ErrorBoundary>,
);
if ("serviceWorker" in navigator && import.meta.env.PROD)
  void navigator.serviceWorker.register("/sw.js").catch(() => {});
