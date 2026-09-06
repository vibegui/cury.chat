// Brazilian DDD (area code) → state map.
// Source: ANATEL DDD list (https://www.anatel.gov.br) and standard postal data.
//
// Used to tag a phone number with the originating state — e.g. +55 21 9 8844-7814
// → RJ. Best-effort: number portability means the DDD reflects where the chip
// was activated, not necessarily where the user lives, but for display it's
// good enough.

const DDD_TO_STATE: Record<string, string> = {
	// SP
	"11": "SP",
	"12": "SP",
	"13": "SP",
	"14": "SP",
	"15": "SP",
	"16": "SP",
	"17": "SP",
	"18": "SP",
	"19": "SP",
	// RJ
	"21": "RJ",
	"22": "RJ",
	"24": "RJ",
	// ES
	"27": "ES",
	"28": "ES",
	// MG
	"31": "MG",
	"32": "MG",
	"33": "MG",
	"34": "MG",
	"35": "MG",
	"37": "MG",
	"38": "MG",
	// PR
	"41": "PR",
	"42": "PR",
	"43": "PR",
	"44": "PR",
	"45": "PR",
	"46": "PR",
	// SC
	"47": "SC",
	"48": "SC",
	"49": "SC",
	// RS
	"51": "RS",
	"53": "RS",
	"54": "RS",
	"55": "RS",
	// DF / Centro-Oeste
	"61": "DF",
	"62": "GO",
	"64": "GO",
	"63": "TO",
	"65": "MT",
	"66": "MT",
	"67": "MS",
	// Norte
	"68": "AC",
	"69": "RO",
	"91": "PA",
	"93": "PA",
	"94": "PA",
	"95": "RR",
	"96": "AP",
	"92": "AM",
	"97": "AM",
	"98": "MA",
	"99": "MA",
	// Nordeste
	"71": "BA",
	"73": "BA",
	"74": "BA",
	"75": "BA",
	"77": "BA",
	"79": "SE",
	"81": "PE",
	"87": "PE",
	"82": "AL",
	"83": "PB",
	"84": "RN",
	"85": "CE",
	"88": "CE",
	"86": "PI",
	"89": "PI",
};

const STATE_TO_REGION: Record<string, "N" | "NE" | "CO" | "SE" | "S"> = {
	AC: "N",
	AM: "N",
	AP: "N",
	PA: "N",
	RO: "N",
	RR: "N",
	TO: "N",
	AL: "NE",
	BA: "NE",
	CE: "NE",
	MA: "NE",
	PB: "NE",
	PE: "NE",
	PI: "NE",
	RN: "NE",
	SE: "NE",
	DF: "CO",
	GO: "CO",
	MS: "CO",
	MT: "CO",
	ES: "SE",
	MG: "SE",
	RJ: "SE",
	SP: "SE",
	PR: "S",
	RS: "S",
	SC: "S",
};

export interface PhoneOrigin {
	cc: string; // "55"
	ddd: string; // "21"
	state?: string; // "RJ"
	region?: "N" | "NE" | "CO" | "SE" | "S";
}

/**
 * Parse a digits-only international phone number and return its origin.
 * Supports Brazilian numbers (CC 55). For other country codes, returns just
 * the CC with no state/region.
 */
export function parsePhoneOrigin(phone: string): PhoneOrigin {
	const digits = phone.replace(/[^\d]/g, "");
	if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
		const ddd = digits.slice(2, 4);
		const state = DDD_TO_STATE[ddd];
		return { cc: "55", ddd, state, region: state ? STATE_TO_REGION[state] : undefined };
	}
	return { cc: digits.slice(0, 2), ddd: "" };
}
