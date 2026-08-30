/**
 * Data model for citation authors and contributors.
 */

export class Author {
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  isOrganization: boolean;
  organizationName: string;

  constructor(opts: Partial<Author> = {}) {
    this.firstName = opts.firstName ?? "";
    this.middleName = opts.middleName ?? "";
    this.lastName = opts.lastName ?? "";
    this.suffix = opts.suffix ?? "";
    this.isOrganization = opts.isOrganization ?? false;
    this.organizationName = opts.organizationName ?? "";
  }

  toDict(): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    if (this.isOrganization) {
      data.is_organization = true;
      const orgName = (this.organizationName.trim() || this.lastName.trim());
      if (orgName) {
        data.organization_name = orgName;
      }
    } else {
      if (this.firstName.trim()) data.first_name = this.firstName.trim();
      if (this.middleName.trim()) data.middle_name = this.middleName.trim();
      if (this.lastName.trim()) data.last_name = this.lastName.trim();
      if (this.suffix.trim()) data.suffix = this.suffix.trim();
    }
    return data;
  }

  static fromDict(data: Record<string, unknown>): Author {
    if (typeof data !== "object" || data === null) {
      return Author.fromString(String(data));
    }
    return new Author({
      firstName: (String(data.first_name ?? "")).trim(),
      middleName: (String(data.middle_name ?? "")).trim(),
      lastName: (String(data.last_name ?? "")).trim(),
      suffix: (String(data.suffix ?? "")).trim(),
      isOrganization: Boolean(data.is_organization ?? false),
      organizationName: (String(data.organization_name ?? "")).trim(),
    });
  }

  static fromString(nameStr: string): Author {
    nameStr = nameStr.trim();
    if (!nameStr) return new Author();

    // Check if explicitly enclosed in brackets or braces as organization
    if (
      (nameStr.startsWith("{") && nameStr.endsWith("}")) ||
      (nameStr.startsWith("[") && nameStr.endsWith("]"))
    ) {
      return new Author({
        isOrganization: true,
        organizationName: nameStr.slice(1, -1).trim(),
      });
    }

    // Check for 'Last, First Middle Suffix' or 'Last, First Middle'
    if (nameStr.includes(",")) {
      const parts = nameStr.split(",").map((p) => p.trim());
      const last = parts[0];
      const firstMiddle = parts[1] ?? "";
      const suffix = parts[2] ?? "";

      const fmParts = firstMiddle.split(/\s+/).filter(Boolean);
      const first = fmParts[0] ?? "";
      const middle = fmParts.length > 1 ? fmParts.slice(1).join(" ") : "";
      return new Author({
        firstName: first,
        middleName: middle,
        lastName: last,
        suffix: suffix,
      });
    }

    // Standard "First Middle Last"
    const parts = nameStr.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      return new Author({ lastName: parts[0] });
    } else if (parts.length === 2) {
      return new Author({ firstName: parts[0], lastName: parts[1] });
    } else {
      return new Author({
        firstName: parts[0],
        middleName: parts.slice(1, -1).join(" "),
        lastName: parts[parts.length - 1],
      });
    }
  }

  displayName(): string {
    if (this.isOrganization) {
      return this.organizationName || this.lastName;
    }
    const parts: string[] = [];
    if (this.firstName) parts.push(this.firstName);
    if (this.middleName) parts.push(this.middleName);
    if (this.lastName) parts.push(this.lastName);
    if (this.suffix) parts.push(this.suffix);
    return parts.join(" ").trim();
  }

  /**
   * APA 7 author format: 'Last, F. M.' or 'Last, F. M., Jr.' or 'Organization'
   */
  apaFormat(): string {
    if (this.isOrganization) {
      return this.organizationName || this.lastName;
    }

    if (!this.lastName && !this.firstName) return "";
    if (!this.firstName && !this.middleName) return this.lastName;

    const initials: string[] = [];
    if (this.firstName) {
      // Handle hyphenated first names like 'Jean-Paul' -> 'J.-P.'
      if (this.firstName.includes("-")) {
        const subInits = this.firstName
          .split("-")
          .filter(Boolean)
          .map((p) => `${p[0]}.`);
        initials.push(subInits.join("-"));
      } else {
        initials.push(`${this.firstName[0]}.`);
      }
    }

    if (this.middleName) {
      for (const mp of this.middleName.split(/\s+/)) {
        if (mp.includes("-")) {
          const subInits = mp
            .split("-")
            .filter(Boolean)
            .map((p) => `${p[0]}.`);
          initials.push(subInits.join("-"));
        } else if (mp) {
          initials.push(`${mp[0]}.`);
        }
      }
    }

    const initialsStr = initials.join(" ");
    let res = `${this.lastName}, ${initialsStr}`;
    if (this.suffix) {
      res += `, ${this.suffix}`;
    }
    return res;
  }

  /** Returns last name or organization for in-text citation. */
  inTextName(): string {
    if (this.isOrganization) {
      return this.organizationName || this.lastName;
    }
    return this.lastName || this.firstName || "Anonymous";
  }

  /**
   * Parse multiple authors from a single string.
   * Supports semicolon (;), newline, conjunctions ('and', '&'), and commas.
   */
  static parseMultiple(text: string): Author[] {
    text = text.trim();
    if (!text) return [];

    // 1. Newline-separated
    if (text.includes("\n")) {
      return text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => Author.fromString(l));
    }

    // 2. Semicolon-separated
    if (text.includes(";")) {
      return text
        .split(";")
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => Author.fromString(p));
    }

    // 3. Conjunctions (' and ', ' & ')
    const conjParts = text.split(/\s+and\s+|\s+&\s+/i);
    if (conjParts.length > 1) {
      return conjParts
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => Author.fromString(p));
    }

    // 4. Comma-separated
    if (text.includes(",")) {
      const parts = text
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length === 1) {
        return [Author.fromString(parts[0])];
      } else if (parts.length === 2) {
        // If both parts have internal spaces, treat as 2 distinct names
        if (
          (parts[0].includes(" ") && parts[1].includes(" ")) ||
          parts[0].startsWith("[") ||
          parts[0].startsWith("{")
        ) {
          return [Author.fromString(parts[0]), Author.fromString(parts[1])];
        }
        // Otherwise standard single author "Last, First"
        return [Author.fromString(text)];
      } else {
        // 3+ comma parts: check if all parts have spaces
        const allHaveSpaces = parts.every(
          (p) =>
            p.includes(" ") || p.startsWith("[") || p.startsWith("{")
        );
        if (allHaveSpaces) {
          return parts.filter((p) => p.trim()).map((p) => Author.fromString(p));
        }

        // Check if even number of parts (e.g. "Smith, John, Jones, Mary")
        if (parts.length % 2 === 0) {
          const paired: string[] = [];
          for (let i = 0; i < parts.length; i += 2) {
            paired.push(`${parts[i]}, ${parts[i + 1]}`);
          }
          return paired.filter((p) => p.trim()).map((p) => Author.fromString(p));
        }

        return parts.filter((p) => p.trim()).map((p) => Author.fromString(p));
      }
    }

    // 5. Single name without delimiters
    return [Author.fromString(text)];
  }

  /** Format a list of authors as a semicolon-separated string for entry fields. */
  static formatAuthorList(authors: Author[]): string {
    if (!authors.length) return "";
    const formatted: string[] = [];
    for (const a of authors) {
      if (a.isOrganization) {
        const org = a.organizationName || a.lastName;
        if (org) formatted.push(`[${org}]`);
      } else {
        const name = a.displayName();
        if (name) formatted.push(name);
      }
    }
    return formatted.filter(Boolean).join("; ");
  }
}
