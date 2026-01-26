// src/lib/extractCountry.ts
import cities from "cities.json";
import countries from "i18n-iso-countries";

import en from "i18n-iso-countries/langs/en.json";
import de from "i18n-iso-countries/langs/de.json";
import fr from "i18n-iso-countries/langs/fr.json";
import es from "i18n-iso-countries/langs/es.json";

interface CityType {
  name: string;
  country: string; // ISO‑Alpha2 code
  lat: string;
  lng: string;
}

countries.registerLocale(en);
countries.registerLocale(de);
countries.registerLocale(fr);
countries.registerLocale(es);

const langs = ["en", "de", "fr", "es"];

const ignoreTokens = ["area", "region", "district", "province", "state", "greater", "metropolitain"];

export default function extractCountry(input: string): string | null {
  if (!input) return null;

  // split input into tokens
  const tokens = input
    .split(/[,\s\/]+/)
    .map(t => t.trim())
    .filter(Boolean)
    .map(t => t.toLowerCase());

  // filter the ignored tokens
  const filtered = tokens.filter(t => !ignoreTokens.includes(t));

  for (let t of filtered) {
    // filter for country
    for (const lang of langs) {
      const code = countries.getAlpha2Code(t, lang);
      if (code) return code;
    }
    // filter city -> country
    const cityMatch = (cities as CityType[]).find(
      c => c.name.toLowerCase() === t
    );
    if (cityMatch) return cityMatch.country;
  }
  return null;
}