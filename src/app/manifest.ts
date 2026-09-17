import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Jarvis | WeedEater Lawn Care",
    short_name: "Jarvis",
    description: "Operations command center for WeedEater Lawn Care.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a1410",
    theme_color: "#0a1410",
    icons: [
      { src: "/icon", sizes: "64x64", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
