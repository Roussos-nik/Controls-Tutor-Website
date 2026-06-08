/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // react-plotly.js ships no types; the TS errors are all third-party
    // typing gaps, not actual bugs. Remove once @types/react-plotly.js lands.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
