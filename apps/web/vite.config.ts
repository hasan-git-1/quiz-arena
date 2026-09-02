import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Quiz Khelo",
        short_name: "Quiz Khelo",
        description: "Real-time classroom quizzes.",
        theme_color: "#5b21b6",
        background_color: "#170d33",
        display: "standalone",
        start_url: "/",
      },
    }),
  ],
});
