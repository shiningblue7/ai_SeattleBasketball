import type { NextConfig } from "next";

// Allow local network origin(s) to load dev assets when testing from other devices
// (used for iPhone testing). Use `any` to avoid TypeScript type mismatch with
// unsupported dev-only config keys.
const nextConfig: any = {
  output: "standalone",
  // permitted dev origins (add your phone's origin if different)
  allowedDevOrigins: ["http://localhost:3000", "http://192.168.0.12:3000"],
};

export default nextConfig as NextConfig;
