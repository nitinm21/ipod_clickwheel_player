import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "iPod",
    short_name: "iPod",
    description: "Offline click-wheel music player",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F2F1EC",
    theme_color: "#F2F1EC",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
