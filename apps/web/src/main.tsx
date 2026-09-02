import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { JoinLobby } from "./JoinLobby";
import { TeacherApp } from "./TeacherApp";
import { registerSW } from "virtual:pwa-register";

const isTeacherRoute = window.location.pathname === "/teacher" || window.location.pathname === "/teacher/signup" || window.location.pathname === "/teacher/login";

createRoot(document.getElementById("root")!).render(<StrictMode>{isTeacherRoute ? <TeacherApp /> : <JoinLobby />}</StrictMode>);
registerSW({ immediate: true });
