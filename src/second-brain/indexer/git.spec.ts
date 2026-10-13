import { parseFileList, parseLogForUpdatedAt, parseNameStatus, parseRevision } from "./git";

describe("parseNameStatus", () => {
  it("parses -z name-status records, including non-ASCII names and the D and T statuses", () => {
    const raw =
      ["A", "Garden/New plant.md", "M", "Сад/Томаты.md", "D", "Старое/Удалено.md", "T", "Links/Symlinked.md"].join(
        "\0",
      ) + "\0";
    expect(parseNameStatus(raw)).toEqual([
      { status: "A", path: "Garden/New plant.md" },
      { status: "M", path: "Сад/Томаты.md" },
      { status: "D", path: "Старое/Удалено.md" },
      { status: "T", path: "Links/Symlinked.md" },
    ]);
  });

  it("returns [] for empty output and sees a rename as delete plus add", () => {
    expect(parseNameStatus("")).toEqual([]);
    expect(parseNameStatus("D\0Old/Имя.md\0A\0New/Имя.md\0")).toEqual([
      { status: "D", path: "Old/Имя.md" },
      { status: "A", path: "New/Имя.md" },
    ]);
  });

  it("skips statuses outside A/M/T/D without losing alignment", () => {
    expect(parseNameStatus("U\0Conflict.md\0M\0Сад/Земляника.md\0")).toEqual([
      { status: "M", path: "Сад/Земляника.md" },
    ]);
  });
});

describe("parseFileList", () => {
  it("splits -z ls-files output and keeps paths verbatim", () => {
    expect(parseFileList("Garden/Tomatoes.md\0Сад/Томаты.md\0Сад/Земляника.md\0")).toEqual([
      "Garden/Tomatoes.md",
      "Сад/Томаты.md",
      "Сад/Земляника.md",
    ]);
    expect(parseFileList("")).toEqual([]);
  });
});

describe("parseLogForUpdatedAt", () => {
  it("assigns names to the preceding commit timestamp; the newest (first) occurrence wins", () => {
    const raw =
      "2024-05-10T12:00:00+03:00\0\nGarden/Tomatoes.md\0Сад/Томаты.md\0" +
      "2024-01-02T08:30:00Z\0\nСад/Томаты.md\0Garden/Plants.md\0";
    const updatedAt = parseLogForUpdatedAt(raw);
    expect(updatedAt.get("Garden/Tomatoes.md")).toBe("2024-05-10T12:00:00+03:00");
    expect(updatedAt.get("Сад/Томаты.md")).toBe("2024-05-10T12:00:00+03:00");
    expect(updatedAt.get("Garden/Plants.md")).toBe("2024-01-02T08:30:00Z");
    expect(updatedAt.size).toBe(3);
  });

  it("tolerates newline-separated headers and empty records", () => {
    const raw = "2024-05-10T12:00:00+03:00\n\nA.md\0B.md\0\0\n2024-01-02T08:30:00.123-05:00\n\nA.md\0";
    const updatedAt = parseLogForUpdatedAt(raw);
    expect([...updatedAt.entries()]).toEqual([
      ["A.md", "2024-05-10T12:00:00+03:00"],
      ["B.md", "2024-05-10T12:00:00+03:00"],
    ]);
    expect(parseLogForUpdatedAt("").size).toBe(0);
  });
});

describe("parseRevision", () => {
  it("trims and returns a 40-hex sha, or empty for anything else", () => {
    const sha = "0123456789abcdef0123456789abcdef01234567";
    expect(parseRevision(`${sha}\n`)).toBe(sha);
    expect(parseRevision(sha.toUpperCase())).toBe(sha);
    expect(parseRevision("HEAD")).toBe("");
    expect(parseRevision("0123456789abcdef")).toBe("");
    expect(parseRevision("")).toBe("");
  });
});
