'use client';
// app/page.jsx
// Entry point — renders the full platform.
// All API calls happen inside Platform.jsx via fetch().

import dynamic from 'next/dynamic';

// Disable SSR for the Platform component (it uses browser APIs like URL.createObjectURL)
const Platform = dynamic(() => import('@/components/Platform'), { ssr: false });

export default function Home() {
  return <Platform />;
}
