export interface ParsedTaskCard {
  title: string;
  owner: string;
  domain: string;
  complexity: string;
  dependencies: string[];
  deliverables: string[];
  evidence: string[];
  body: string;
}

export interface ParsedReviewIssue {
  severity: string;
  file: string;
  line: string;
  title: string;
  recommendation: string;
}

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

export function extractMarkdownSection(content: string, heading: string) {
  return (parseMarkdownSections(content).get(heading) || []).join("\n").trim();
}

export function splitTaskBlocks(taskSection: string) {
  return taskSection
    .split(/\n(?=###\s+)/g)
    .map((block) => block.trim())
    .filter((block) => block.startsWith("### "));
}

export function parseTaskListValue(value: string) {
  if (!value || value.toLowerCase() === "nenhuma") {
    return [] as string[];
  }

  return value
    .split(/,|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseTaskBlock(block: string): ParsedTaskCard {
  const lines = block.split("\n");
  const title = lines[0]?.replace(/^###\s*/, "").trim() || "Task";
  const metadata = new Map<string, string>();
  const bodyLines: string[] = [];

  for (const line of lines.slice(1)) {
    const metadataMatch = line.match(/^-\s+([^:]+):\s*(.+)$/);

    if (metadataMatch) {
      metadata.set(metadataMatch[1].trim().toLowerCase(), metadataMatch[2].trim());
      continue;
    }

    bodyLines.push(line);
  }

  return {
    title,
    owner: metadata.get("owner") || "unassigned",
    domain: metadata.get("dominio") || metadata.get("domain") || "feature",
    complexity: metadata.get("complexidade") || metadata.get("complexity") || "medium",
    dependencies: parseTaskListValue(metadata.get("dependencias") || metadata.get("dependencies") || ""),
    deliverables: parseTaskListValue(metadata.get("entregaveis") || metadata.get("deliverables") || ""),
    evidence: parseTaskListValue(metadata.get("testes e evidencias") || metadata.get("evidence") || ""),
    body: bodyLines.join("\n").trim(),
  };
}

export function parseReviewIssues(findingsSection: string): ParsedReviewIssue[] {
  const pipeIssues = findingsSection
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.replace(/^-\s*/, ""))
    .map((line) => {
      const parts = line.split("|").map((part) => part.trim());

      if (parts.length < 5) {
        return null;
      }

      return {
        severity: parts[0],
        file: parts[1],
        line: parts[2],
        title: parts[3],
        recommendation: parts.slice(4).join(" | "),
      };
    })
    .filter(Boolean) as ParsedReviewIssue[];

  if (pipeIssues.length > 0) {
    return pipeIssues;
  }

  const regex = /###\s*([^|\n]+)\|\s*([^|\n]+)\|\s*([^|\n]+)\|\s*([^\n]+)\n([\s\S]*?)(?=\n###\s*[^|\n]+\||$)/g;
  const issues: ParsedReviewIssue[] = [];

  for (const match of findingsSection.matchAll(regex)) {
    issues.push({
      severity: match[1].trim(),
      file: match[2].trim(),
      line: match[3].trim(),
      title: match[4].trim(),
      recommendation: match[5].trim() || "No recommendation provided.",
    });
  }

  return issues;
}
