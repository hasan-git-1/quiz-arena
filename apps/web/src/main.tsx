import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { JoinLobby } from "./JoinLobby";
import { TeacherApp } from "./TeacherApp";
import { registerSW } from "virtual:pwa-register";

createRoot(document.getElementById("root")!).render(<StrictMode>{window.location.pathname === "/join" ? <JoinLobby /> : <TeacherApp />}</StrictMode>);
registerSW({ immediate: true });
