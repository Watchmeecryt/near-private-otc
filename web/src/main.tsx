import "./polyfills";
import React from "react";
import ReactDOM from "react-dom/client";
import "@unlocalhosted/metalui/icons.css";
import "@unlocalhosted/metalui/styles.css";
import "./tokens.css";
import "./styles.css";
import "./theme-glass.css";
import "./theme-quiet.css";
import App from "./App";
import { AuthRoot } from "./lib/privy";

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><AuthRoot><App /></AuthRoot></React.StrictMode>);
