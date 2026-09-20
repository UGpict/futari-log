export type MaskResult = {
  masked: string;
  flags: string[];
  needsUserFix: boolean;
};

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(?:\+?81[-\s]?)?0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}/g;
const POSTAL = /〒?\s*\d{3}-?\d{4}/g;

export function maskPii(input: string): MaskResult {
  const flags: string[] = [];
  let masked = input;
  if (EMAIL.test(input)) {
    flags.push("email");
    masked = masked.replace(EMAIL, "[EMAIL]");
  }
  if (PHONE.test(input)) {
    flags.push("phone");
    masked = masked.replace(PHONE, "[PHONE]");
  }
  if (POSTAL.test(input)) {
    flags.push("postal");
    masked = masked.replace(POSTAL, "[POSTAL]");
  }
  const nameLike = /([一-龯ぁ-んァ-ン]{1,4}\s*[一-龯ぁ-んァ-ン]{1,4})(さん|様)/;
  const needsUserFix = /住所|自宅|本籍/.test(input) && !flags.includes("postal");
  if (nameLike.test(input)) {
    flags.push("possible_name");
  }
  return {
    masked,
    flags,
    needsUserFix: needsUserFix || flags.includes("possible_name"),
  };
}

export function assertNoRawPiiInLog(text: string): void {
  if (EMAIL.test(text) || PHONE.test(text)) {
    throw new Error("refusing to log unmasked contact data");
  }
}
