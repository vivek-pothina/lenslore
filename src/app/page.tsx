"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import dynamic from "next/dynamic";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1 } },
});

const App = dynamic(() => import("@/src/App"), { ssr: false });

export default function Home() {
  return (
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  );
}
