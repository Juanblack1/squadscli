export function parseMarkdownSections(content: string) {
  const lines = content.replace(/\r/g, "").split("\n");
  const sections = new Map<string, string[]>();
  let current = "__root__";

  for (const line of lines) {
    const match = line.match(/^##\s+(.+)$/);

    if (match) {
      current = match[1].trim();
      if (!sections.has(current)) {
        sections.set(current, []);
      }
      continue;
    }

    if (!sections.has(current)) {
      sections.set(current, []);
    }

    sections.get(current)?.push(line);
  }

  return sections;
}

export function uniqueNonEmptyLines(lines: string[]) {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const line of lines.map((entry) => entry.trimEnd())) {
    const normalized = line.trim();

    if (!normalized) {
      continue;
    }

    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    output.push(line);
  }

  return output;
}

export function buildEmptyWorkflowMemory() {
  return [
    "# Workflow Memory",
    "",
    "## Decisoes duraveis",
    "",
    "## Riscos ativos",
    "",
    "## Handoffs reutilizaveis",
    "",
    "## Preferencias aprovadas",
    "",
  ].join("\n");
}

export function mergeMemoryContent(existing: string, incomingSection: string, targetHeading: string) {
  const sections = parseMarkdownSections(existing);
  const incomingLines = uniqueNonEmptyLines(incomingSection.split("\n"));
  const currentLines = uniqueNonEmptyLines(sections.get(targetHeading) || []);
  const mergedLines = uniqueNonEmptyLines([...currentLines, ...incomingLines]);
  sections.set(targetHeading, mergedLines);

  const orderedHeadings = ["Decisoes duraveis", "Riscos ativos", "Handoffs reutilizaveis", "Preferencias aprovadas"];

  return [
    "# Workflow Memory",
    "",
    ...orderedHeadings.flatMap((heading) => [
      `## ${heading}`,
      "",
      ...(sections.get(heading) && sections.get(heading)?.length ? sections.get(heading)! : ["- none"]),
      "",
    ]),
  ].join("\n").trimEnd() + "\n";
}
