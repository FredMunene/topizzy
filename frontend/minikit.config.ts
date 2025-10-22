const ROOT_URL =
  process.env.NEXT_PUBLIC_URL ||
  (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
  "http://localhost:3000";

/**
 * MiniApp configuration object. Must follow the mini app manifest specification.
 *
 * @see {@link https://docs.base.org/mini-apps/features/manifest}
 */
export const minikitConfig = {
  accountAssociation: {
    "header": "eyJmaWQiOjk4ODIxMCwidHlwZSI6ImN1c3RvZHkiLCJrZXkiOiIweDczMjFDQzIwNDI3YzVkYUY3YThBMTgwNDI1OWVDM0E3MkFkNzhiMzQifQ",
    "payload": "eyJkb21haW4iOiJ0b3Bpenp5LnZlcmNlbC5hcHAifQ",
    "signature": "CcoxzVzAJUdP6SmKcdlK9S8buRoAmcLEK3HriaGm3qFavlYaTHJYL5b4tVGn1GTduHl8I0p53WRahxi8GnWkJxs="
  },
  baseBuilder: {
    allowedAddresses: [],
    "ownerAddress": "0x1Dc052F929863c6702de70166f05a8517157B9Ac"
  },
  miniapp: {
    version: "1",
    name: "topizzy",
    subtitle: "",
    description: "",
    screenshotUrls: [],
    iconUrl: `${ROOT_URL}/icon.png`,
    splashImageUrl: `${ROOT_URL}/splash.png`,
    splashBackgroundColor: "#000000",
    homeUrl: ROOT_URL,
    webhookUrl: `${ROOT_URL}/api/webhook`,
    primaryCategory: "utility",
    tags: ["example"],
    heroImageUrl: `${ROOT_URL}/hero.png`,
    tagline: "",
    ogTitle: "",
    ogDescription: "",
    ogImageUrl: `${ROOT_URL}/hero.png`,
  },
} as const;


