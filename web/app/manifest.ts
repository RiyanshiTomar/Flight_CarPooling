import type { MetadataRoute } from "next";

// Lets people "Add to Home Screen" and open FlyPool like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FlyPool - Share the cab from the airport",
    short_name: "FlyPool",
    description: "Match with travellers landing around the same time and split the cab fare.",
    start_url: "/trip/new",
    display: "standalone",
    background_color: "#f4f5fd",
    theme_color: "#2f3fa6",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
