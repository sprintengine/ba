/** Currencies a business can pick, in picker order (the backend accepts any ISO 4217 code). */
export const CURRENCIES: readonly { code: string; name: string }[] = [
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British pound" },
  { code: "USD", name: "US dollar" },
  { code: "CAD", name: "Canadian dollar" },
  { code: "AUD", name: "Australian dollar" },
  { code: "NZD", name: "New Zealand dollar" },
  { code: "CHF", name: "Swiss franc" },
  { code: "SEK", name: "Swedish krona" },
  { code: "NOK", name: "Norwegian krone" },
  { code: "DKK", name: "Danish krone" },
  { code: "PLN", name: "Polish złoty" },
  { code: "CZK", name: "Czech koruna" },
];
