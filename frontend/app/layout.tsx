import type { Metadata } from "next";
import { Inter, Source_Code_Pro } from "next/font/google";
import { SafeArea } from "@coinbase/onchainkit/minikit";
import { minikitConfig } from "@/minikit.config";
import { RootProvider } from "./rootProvider";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: {
      default: "Topizzy — Buy Airtime with USDC on Base",
      template: "%s | Topizzy",
    },
    description: minikitConfig.miniapp.description,
    applicationName: "Topizzy",
    metadataBase: new URL(minikitConfig.miniapp.homeUrl),
    alternates: {
      canonical: minikitConfig.miniapp.homeUrl,
    },
    openGraph: {
      title: minikitConfig.miniapp.ogTitle,
      description: minikitConfig.miniapp.ogDescription,
      url: minikitConfig.miniapp.homeUrl,
      siteName: "Topizzy",
      images: [{ url: minikitConfig.miniapp.ogImageUrl }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: minikitConfig.miniapp.ogTitle,
      description: minikitConfig.miniapp.ogDescription,
      images: [minikitConfig.miniapp.ogImageUrl],
    },
    robots: {
      index: true,
      follow: true,
    },
    other: {
      "fc:miniapp": JSON.stringify({
        version: minikitConfig.miniapp.version,
        imageUrl: minikitConfig.miniapp.heroImageUrl,
        button: {
          title: `Launch ${minikitConfig.miniapp.name}`,
          action: {
            name: `Launch ${minikitConfig.miniapp.name}`,
            type: "launch_miniapp",
          },
        },
      }),
      "base:app_id":"68f930fd3eacc16300ec1e66",
    },
  };
}

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const sourceCodePro = Source_Code_Pro({
  variable: "--font-source-code-pro",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <RootProvider>
      <html lang="en">
        <body className={`${inter.variable} ${sourceCodePro.variable}`}>
          <SafeArea>{children}</SafeArea>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "Organization",
                name: "Topizzy",
                url: minikitConfig.miniapp.homeUrl,
                logo: minikitConfig.miniapp.iconUrl,
              }),
            }}
          />
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "Product",
                name: "Topizzy Airtime",
                description: minikitConfig.miniapp.description,
                brand: "Topizzy",
                image: minikitConfig.miniapp.heroImageUrl,
                url: minikitConfig.miniapp.homeUrl,
                category: "Mobile Airtime",
                offers: {
                  "@type": "Offer",
                  priceCurrency: "USDC",
                  price: "0",
                  availability: "https://schema.org/InStock",
                },
              }),
            }}
          />
        </body>
      </html>
    </RootProvider>
  );
}
