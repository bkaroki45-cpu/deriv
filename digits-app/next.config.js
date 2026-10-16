const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '/trade/digits'

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@deriv/core'],
  output: 'export',
  trailingSlash: true,
  basePath,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_DERIV_APP_NAME: process.env.NEXT_PUBLIC_DERIV_APP_NAME || 'Profitera Digits',
  },
}

module.exports = nextConfig
