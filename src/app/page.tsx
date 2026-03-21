"use client";

import dynamic from "next/dynamic";

// Import the main app component with SSR disabled
const App = dynamic(() => import("@/src/App"), { ssr: false });

export default function Home() {
  return <App />;
}
