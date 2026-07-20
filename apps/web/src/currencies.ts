/**
 * Currencies offered in Currency dropdowns (run form + review screen), as
 * ISO 4217 codes with display names. Lives in the web app rather than
 * packages/shared because shared compiles to CommonJS for the server, which
 * the browser can't import named values from at runtime - and the server
 * never needs this list anyway.
 */
export const CURRENCY_OPTIONS: { code: string; name: string }[] = [
  { code: "INR", name: "Indian rupee" },
  { code: "BDT", name: "Bangladeshi taka" },
  { code: "USD", name: "US dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British pound" },
  { code: "JPY", name: "Japanese yen" },
  { code: "CNY", name: "Chinese yuan" },
  { code: "AUD", name: "Australian dollar" },
  { code: "CAD", name: "Canadian dollar" },
  { code: "SGD", name: "Singapore dollar" },
  { code: "MYR", name: "Malaysian ringgit" },
  { code: "THB", name: "Thai baht" },
  { code: "IDR", name: "Indonesian rupiah" },
  { code: "PHP", name: "Philippine peso" },
  { code: "VND", name: "Vietnamese dong" },
  { code: "KRW", name: "South Korean won" },
  { code: "HKD", name: "Hong Kong dollar" },
  { code: "NZD", name: "New Zealand dollar" },
  { code: "CHF", name: "Swiss franc" },
  { code: "SEK", name: "Swedish krona" },
  { code: "NOK", name: "Norwegian krone" },
  { code: "DKK", name: "Danish krone" },
  { code: "PLN", name: "Polish zloty" },
  { code: "TRY", name: "Turkish lira" },
  { code: "AED", name: "UAE dirham" },
  { code: "SAR", name: "Saudi riyal" },
  { code: "ILS", name: "Israeli new shekel" },
  { code: "ARS", name: "Argentine peso" },
  { code: "BRL", name: "Brazilian real" },
  { code: "MXN", name: "Mexican peso" },
  { code: "ZAR", name: "South African rand" },
];
