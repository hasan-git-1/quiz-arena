import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "QuizArena",
        short_name: "QuizArena",
        description: "Real-time classroom quizzes.",
        theme_color: "#5b21b6",
        background_color: "#170d33",
        display: "standalone",
        start_url: "/",
      },
    }),
  ],
});
