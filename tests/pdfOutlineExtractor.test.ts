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
    expect(studies.map(({ extracted }) => extracted.studyGuide.length)).toEqual([4, 3, 3, 3, 3]);
    expect(studies.map(({ extracted }) => extracted.studyGuide.map((item) => item.split(/\s+/)[0]))).toEqual([
      ["Identify", "Read", "What", "Discuss"],
      ["What", "Read", "Share"],
      ["What", "Read", "Discuss"],
      ["Contrast", "Read", "Discuss"],
      ["What", "Read", "Which"],
    ]);
    expect(studies.map(({ extracted }) => extracted.aims.length)).toEqual([3, 3, 2, 3, 3]);
    const withoutWhitespace = (value: string) => value.replace(/\s+/g, "");
    expect(withoutWhitespace(studies[0].extracted.foodForThought ?? "")).toBe(
      withoutWhitespace("A heart that resists tilling will never know the joy of harvest."),
    );
    expect(studies[0].extracted.studyGuide).not.toContain(studies[0].extracted.foodForThought);
    expect(studies.map(({ extracted }) => extracted.foodForThought !== null)).toEqual([true, true, false, false, true]);
    expect(studies.map(({ extracted }) => extracted.studyHeading)).toEqual([
      "1ST SUNDAY AFTER TRINITY, JUNE 7 2026",
      "2ND SUNDAY AFTER TRINITY, JUNE 14 2026",
      "3RD SUNDAY AFTER TRINITY, JUNE 21 2026",
      "4TH SUNDAY AFTER TRINITY, JUNE 28 2026",
      "5TH SUNDAY AFTER TRINITY, JULY 5 2026",
    ]);
    expect(studies[0].extracted.studyGuide[2]).toContain("over time?");
    expect(studies.map(({ extracted }) => extracted.memoryVerseRef)).toEqual([
      "Matthew 13:8",
      "James 5:8",
      "John 15:2",
      "Jeremiah 17:8",
      "John 15:16",
    ]);
    expect(studies.map(({ extracted }) => extracted.memoryVerseText)).toEqual([
      "But the seed that fell on good soil produced a harvest, some yielding a hundred, some sixty, some thirty times what was sown.",
      "You too, be patient and strengthen your hearts, for the coming of the Lord draws near.",
      "Every branch that bears no fruit He removes, and every branch that bears fruit He trims clean so it may bear even more.",
      "He shall be like a tree planted by the waters, spreading out its roots, unafraid when the heat comes, for its leaves stay green.",
      "You did not choose Me, but I chose you and appointed you to go and bear fruit, fruit that will remain.",
    ]);
    for (const { extracted } of studies) {
      expect(extracted.memoryVerseText).not.toMatch(/---|TO LEARN:/i);
    }
    expect(studies.slice(0, 4).map(({ extracted }) => extracted.prayerPoints.length)).toEqual([0, 0, 0, 0]);
    expect(studies[4].extracted.prayerPoints).toHaveLength(3);
    expect(studies[4].extracted.prayerPoints).not.toContain("transformation.");
    expect(studies[3].extracted.scriptureReferences.some((ref) => ref.raw === "with 17:7-8" && ref.recognized)).toBe(true);
    expect(studies[2].extracted.scriptureReferences.some((ref) => ref.raw === "Xzq 9:3" && !ref.recognized)).toBe(true);
  });
});
