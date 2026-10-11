import { createServerFn } from "@tanstack/react-start";

import type { FilingExhibitInput } from "./filing-pdf.server";

export type { FilingExhibitInput, FilingPartResult } from "./filing-pdf.server";

const MAX_EXHIBITS_PER_PART = 8;

/** Build one part of the filing packet and save it to Drive. */
export const buildFilingPart = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      version: number;
      name: string;
      startPage: number;
      exhibits: FilingExhibitInput[];
      tabsStartingHere: string[];
    }) => {
      if (!Number.isInteger(data?.version) || data.version < 1)
        throw new Error("Invalid packet version.");
      if (!Number.isInteger(data.startPage) || data.startPage < 1)
        throw new Error("Invalid start page.");
      if (!Array.isArray(data.exhibits) || !data.exhibits.length)
        throw new Error("No exhibits in this part.");
      if (data.exhibits.length > MAX_EXHIBITS_PER_PART)
        throw new Error("Too many exhibits for one part.");
      for (const ex of data.exhibits) {
        if (ex.driveFileId && !/^[A-Za-z0-9_-]{6,200}$/.test(ex.driveFileId)) {
          throw new Error("That Drive file reference is not valid.");
        }
      }
      return data;
    },
  )
  .handler(async ({ data }) => {
    const { buildFilingPart: build } = await import("./filing-pdf.server");
    return build(data);
  });

/** Build the title page, cover letter and table of contents once page numbers are known. */
export const buildFilingFrontMatter = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      version: number;
      name: string;
      caseName: string;
      applicant: string;
      qualifyingRelative: string;
      preparedOn: string;
      coverLetter: string[];
      tabs: {
        letter: string;
        title: string;
        exhibits: {
          number: string;
          title: string;
          date: string;
          firstPage: number;
          lastPage: number;
        }[];
      }[];
      parts: { name: string; firstPage: number; lastPage: number }[];
    }) => {
      if (!Number.isInteger(data?.version) || data.version < 1)
        throw new Error("Invalid packet version.");
      if (!Array.isArray(data.tabs)) throw new Error("Missing table of contents.");
      return data;
    },
  )
  .handler(async ({ data }) => {
    const { buildFilingFrontMatter: build } = await import("./filing-pdf.server");
    return build(data);
  });
