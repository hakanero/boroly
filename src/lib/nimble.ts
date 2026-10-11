import Nimble from "@nimble-way/nimble-js";

let client: Nimble | null = null;

export function nimble(): Nimble {
  if (!process.env.NIMBLE_API_KEY) {
    throw new Error("NIMBLE_API_KEY is not set. Add it to .env.local.");
  }
  client ??= new Nimble({
    apiKey: process.env.NIMBLE_API_KEY,
    timeout: 90_000,
    maxRetries: 1,
  });
  return client;
}

export type WebSnippet = {
  title: string;
  url: string;
  text: string;
};

const clip = (s: string | undefined, n: number) =>
  (s ?? "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images
    .replace(/‹ image \d+ of \d+ ›/g, "")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, n);

/** Live page extraction, rendered in a stealth browser, returned as markdown. */
export async function extractPage(url: string, maxChars = 14_000): Promise<string> {
  const res = await nimble().extract.run({
    url,
    render: true,
    driver: "vx10",
    formats: ["markdown"],
    country: "US",
  });
  const data = res.data as { markdown?: string; html?: string } | undefined;
  const md = data?.markdown || stripHtml(data?.html ?? "");
  return clip(md, maxChars);
}

/** Live web search. Each result carries ~2K chars of rich content. */
export async function searchWeb(
  query: string,
  opts: {
    includeDomains?: string[];
    maxResults?: number;
    timeRange?: "day" | "week" | "month" | "year";
    perResultChars?: number;
  } = {},
): Promise<WebSnippet[]> {
  const res = await nimble().search({
    query,
    max_results: opts.maxResults ?? 8,
    search_depth: "standard",
    include_domains: opts.includeDomains,
    time_range: opts.timeRange,
    country: "US",
    locale: "en",
  });
  return (res.results ?? []).map((r) => ({
    title: r.title,
    url: r.url,
    text: clip(r.content || r.description, opts.perResultChars ?? 1_800),
  }));
}

/**
 * Crawl from a start page and return each crawled page's markdown.
 * Crawls are async on Nimble's side, so we poll until done or until the deadline.
 */
export async function crawlPages(
  startUrl: string,
  opts: {
    includePaths: string[];
    limit: number;
    deadlineMs: number;
    entireDomain?: boolean;
    render?: boolean;
  },
): Promise<{ url: string; markdown: string }[]> {
  const n = nimble();
  const started = await n.crawl.run({
    url: startUrl,
    limit: opts.limit,
    max_discovery_depth: 1,
    sitemap: "skip",
    crawl_entire_domain: opts.entireDomain ?? false,
    include_paths: opts.includePaths,
    extract_options: {
      formats: ["markdown"],
      ...(opts.render ? { render: true, driver: "vx10", country: "US" } : {}),
    },
  } as Parameters<typeof n.crawl.run>[0]);

  const crawlId = started.crawl_id;
  const stopAt = Date.now() + opts.deadlineMs;
  let status = await n.crawl.status(crawlId);
  while ((status.status === "queued" || status.status === "running") && Date.now() < stopAt) {
    await new Promise((r) => setTimeout(r, 2_500));
    status = await n.crawl.status(crawlId);
  }
  if (status.status === "queued" || status.status === "running") {
    n.crawl.terminate(crawlId).catch(() => {});
  }

  const completed = (status.tasks ?? []).filter((t) => t.status === "completed");
  const pages = await Promise.all(
    completed.map(async (t) => {
      try {
        const r = (await n.tasks.results(t.task_id)) as unknown as {
          url?: string;
          data?: { markdown?: string; html?: string };
        };
        const markdown = r.data?.markdown || stripHtml(r.data?.html ?? "");
        return markdown ? { url: r.url ?? startUrl, markdown } : null;
      } catch {
        return null;
      }
    }),
  );
  return pages.filter((p): p is { url: string; markdown: string } => !!p);
}

/** Single-page markdown extraction for search/result pages (no cleanup or clipping). */
export async function extractMarkdown(url: string, opts: { render?: boolean } = {}): Promise<string> {
  const res = await nimble().extract.run({
    url,
    formats: ["markdown"],
    country: "US",
    ...(opts.render ? { render: true, driver: "vx10" as const } : { driver: "vx6" as const }),
  });
  return (res.data as { markdown?: string } | undefined)?.markdown ?? "";
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s{2,}/g, " ")
    .trim();
}
