"use client";
import { ReactNode, useState } from "react";
import { base } from "wagmi/chains";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OnchainKitProvider } from "@coinbase/onchainkit";
import "@coinbase/onchainkit/styles.css";
import { createAppWagmiConfig } from "@/lib/wagmi-config";

export function RootProvider({ children }: { children: ReactNode }) {
  // Own WagmiProvider so both Base and Arc chains are available to wallet
  // connections — OnchainKitProvider picks up this config from context instead
  // of building its Base-only default one.
  const [wagmiConfig] = useState(() =>
    createAppWagmiConfig(process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY)
  );
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <OnchainKitProvider
          apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
          chain={base}
          config={{
            appearance: {
              mode: "auto",
            },
            wallet: {
              display: "modal",
              preference: "all",
            },
          }}
          miniKit={{
            enabled: true,
            autoConnect: true,
            notificationProxyUrl: undefined,
          }}
        >
          {children}
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
