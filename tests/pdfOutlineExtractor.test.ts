import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { PDFParse } from "pdf-parse";
import { extractAllStudies } from "../src/utils/pdfOutlineExtractor.js";

const aliases = {
  studyMarker: ["Study"],
  topic: ["Topic"],
  theme: ["Theme"],
  subTheme: ["Sub-Theme"],
  textRef: ["Text"],
  memoryVerseRef: ["Memory Verse", "Memory Verse to Learn"],
  aim: ["Aim", "Aims"],
  introduction: ["Introduction"],
  studyGuide: ["Study Guide"],
  discussionQuestions: ["Discussion Questions"],
  conclusion: ["Conclusion"],
  prayerPoints: ["Prayer Points"],
  foodForThought: ["Food for Thought"],
};

describe("Bible Study outline extraction", () => {
  it("extracts every required field from the sample outline", async () => {
    const parser = new PDFParse({ data: await readFile("tests/fixtures/sample-bible-study.pdf") });
    const text = (await parser.getText()).text;
    await parser.destroy();

    const knownBooks = new Set([
      "matthew", "james", "hosea", "mrk", "jas", "gal", "ecclesiastes", "jn",
      "heb", "john", "jeremiah", "col", "psalm", "proverbs", "peter",
    ]);
    const studies = await extractAllStudies(
      text,
      aliases,
      async (token) => knownBooks.has(token) ? ({ bookId: token, bookName: token }) : null,
    );

    expect(studies).toHaveLength(5);
    expect(studies.map(({ extracted }) => extracted.studyGuide)).toHaveLength(5);
    expect(studies.map(({ extracted }) => extracted.studyGuide.length)).toEqual([4, 3, 3, 3, 3]);
    expect(studies.map(({ extracted }) => extracted.aims.length)).toEqual([3, 3, 2, 3, 3]);
    expect(studies[0].extracted.studyGuide).not.toContain("A heart that resists tilling will never know the joy of harvest.");
    expect(studies[0].extracted.foodForThought).toBe("A heart that resists tilling will never know the joy of harvest.");
    expect(studies.map(({ extracted }) => extracted.studyHeading)).toEqual([
      "1ST SUNDAY AFTER TRINITY, JUNE 7 2026",
      "2ND SUNDAY AFTER TRINITY, JUNE 14 2026",
      "3RD SUNDAY AFTER TRINITY, JUNE 21 2026",
      "4TH SUNDAY AFTER TRINITY, JUNE 28 2026",
      "5TH SUNDAY AFTER TRINITY, JULY 5 2026",
    ]);
    expect(studies[0].extracted.studyGuide[2]).toContain("over time?");
    expect(studies[0].extracted.memoryVerseRef).toBe("Matthew 13:8");
    expect(studies[0].extracted.memoryVerseText).toBe(
      "But the seed that fell on good soil produced a harvest, some yielding a hundred, some sixty, some thirty times what was sown.",
    );
    expect(studies[2].extracted.memoryVerseRef).toBe("John 15:2");
    expect(studies[3].extracted.scriptureReferences.some((ref) => ref.raw === "with 17:7-8" && ref.recognized)).toBe(true);
    expect(studies[2].extracted.scriptureReferences.some((ref) => ref.raw === "Xzq 9:3" && !ref.recognized)).toBe(true);
  });
});
