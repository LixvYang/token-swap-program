import path from "node:path";

const nextConfig = {
  transpilePackages: ["@rebetxin/token-swap-sdk"],
  turbopack: {
    root: path.join(process.cwd(), ".."),
  },
};

export default nextConfig;
