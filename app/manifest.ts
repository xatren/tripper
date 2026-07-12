import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Tripper — Road Trip Planner',
    short_name: 'Tripper',
    description: 'Plan epic road trips with friends. Interactive map, collaboration, and budget tracking.',
    start_url: '/dashboard',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#06061c',
    theme_color: '#0a1020',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  }
}
