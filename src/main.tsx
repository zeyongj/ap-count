import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import App from "./App";
import "./styles.css";

const publishableKey = import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {publishableKey ? (
      <ClerkProvider publishableKey={publishableKey} afterSignOutUrl="/">
        <App />
      </ClerkProvider>
    ) : (
      <main style={{ padding: "3rem", fontFamily: "system-ui" }} role="alert">
        <h1>AP Count</h1>
        <p>The sign-in service is not configured. Please contact the administrator.</p>
      </main>
    )}
  </React.StrictMode>,
);
