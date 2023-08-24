/** @type {import('next').NextConfig} */
const nextConfig = {
  rewrites: async () => {
    return [
      {
        source: "/api/:path*", // capture all matching domain endpoint requests made to /api/* and map tp the destination API Python FastAPI server to handle incoming requests
        destination:
          process.env.NODE_ENV === "development"
            ? "http://127.0.0.1:8000/api/:path*"
            : "/backend/api/",
      },
    ];
  },
  webpack: (config) => {
    config.module.rules.push({
      test: /\.node/,
      use: "raw-loader", // required configuration (and additional raw-loader dependency) to allow for react-pdf to work with Next.js (see https://github.com/wojtekmaj/react-pdf#webpack)
    });
    return config;
  },
};

module.exports = nextConfig;
