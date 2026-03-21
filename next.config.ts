import type { NextConfig } from "next";
import tailwindcss from "@tailwindcss/vite";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
};

export default nextConfig;
