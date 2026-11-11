"use client";

import { useEffect } from "react";

/**
 * Visual editor bridge (P12). Loaded only in OPEX edit mode (draft mode + opex_edit cookie), inside
 * the console's frame; visitors never download it.
 *
 * The console sends the draft content of every entry on the page. Each `[data-opex-entry]` scope is
 * matched against its entry: elements whose whole text equals a content string, and images whose
 * source equals a content image, are marked editable. Text is edited in place (plain text only);
 * images and sections are picked here and edited in the console. Messages are origin-checked both
 * ways.
 */
type Entries = Record<string, unknown>;
type Msg =
  | { source: "opex-console"; type: "content"; locale: string; entries: Entries }
  | { source: "opex-console"; type: "select"; section: string | null }
  | { source: "opex-console"; type: "text"; entry: string; path: string; value: string };

const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const LOCS = ["fa", "en", "tr"];
const isLoc = (v: unknown): v is Record<string, string> => !!v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length > 0 && Object.keys(v).every((k) => LOCS.includes(k));

/** Every editable string and image in an entry, with its field path. */
function leaves(data: unknown, locale: string, prefix = "") {
  const texts = new Map<string, string[]>();
  const images = new Map<string, string>();
  const add = (t: string, p: string) => {
    const k = norm(t);
    if (k.length < 2) return;
    texts.set(k, [...(texts.get(k) ?? []), p]);
  };
  const walk = (v: unknown, p: string) => {
    if (isLoc(v)) {
      if (typeof v[locale] === "string") add(v[locale]!, `${p}@${locale}`);
      return;
    }
    if (typeof v === "string") {
      if (/^\/(images|media)\//.test(v)) images.set(v, p);
      return;
    }
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${p}[${i}]`));
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.src === "string" && /^\/(images|media)\//.test(o.src)) images.set(o.src, p);
      for (const [k, x] of Object.entries(o)) if (k !== "src") walk(x, `${p}/${k}`);
    }
  };
  walk(data, prefix);
  return { texts, images };
}

/** The value at a simple path like /sections[3]/props (blocks keep their data inside the layout). */
function subtree(data: unknown, base: string): unknown {
  let node = data;
  for (const part of base.split("/").filter(Boolean)) {
    const m = /^([^[\]]*)((?:\[\d+\])*)$/.exec(part);
    if (!m) return undefined;
    if (m[1]) node = (node as Record<string, unknown> | undefined)?.[m[1]];
    for (const i of m[2]!.match(/\d+/g) ?? []) node = (node as unknown[] | undefined)?.[Number(i)];
  }
  return node;
}

/** The original path of an image, also through next/image (/_next/image?url=…). */
function imgSrc(img: HTMLImageElement) {
  const raw = img.getAttribute("src") ?? "";
  try {
    const u = new URL(raw, location.href);
    return u.pathname === "/_next/image" ? (u.searchParams.get("url") ?? "") : u.pathname;
  } catch {
    return raw;
  }
}

const STYLE = `
[data-opex-path]{cursor:text;transition:outline-color .15s}
[data-opex-path]:hover{outline:2px dashed #2f6fed;outline-offset:3px}
[data-opex-path][contenteditable]{outline:2px solid #2f6fed;outline-offset:3px;background:rgba(47,111,237,.06)}
img[data-opex-img]{cursor:pointer}
img[data-opex-img]:hover{outline:3px dashed #2f6fed;outline-offset:-3px}
#opex-frame{position:absolute;pointer-events:none;border:2px solid transparent;border-radius:4px;z-index:2147483646;transition:all .12s}
#opex-frame[data-on]{border-color:rgba(47,111,237,.55)}
#opex-frame[data-sel]{border-color:#2f6fed;box-shadow:0 0 0 4px rgba(47,111,237,.15)}
#opex-frame b{position:absolute;inset-block-start:-26px;inset-inline-start:-2px;pointer-events:auto;cursor:pointer;font:600 12px/1 system-ui,sans-serif;color:#fff;background:#2f6fed;padding:6px 8px;border-radius:4px 4px 0 0;white-space:nowrap}
`;

export default function EditBridge({ consoleOrigin }: { consoleOrigin: string }) {
  useEffect(() => {
    // One bridge per page, even when React mounts effects twice (development).
    const w = window as Window & { __opexBridge?: boolean };
    if (window.parent === window || w.__opexBridge) return;
    w.__opexBridge = true;
    const post = (m: Record<string, unknown>) => window.parent.postMessage({ source: "opex-site", ...m }, consoleOrigin);
    const style = document.createElement("style");
    style.textContent = STYLE;
    document.head.append(style);
    const frame = document.createElement("div");
    frame.id = "opex-frame";
    frame.innerHTML = "<b></b>";
    document.body.append(frame);
    let selected: string | null = null;
    let hovered: HTMLElement | null = null;
    let locale = document.documentElement.lang || "fa";

    const scopes = () => Array.from(document.querySelectorAll<HTMLElement>("[data-opex-entry]"));
    const rectOf = (el: HTMLElement) => {
      const kids = Array.from(el.children) as HTMLElement[];
      const rs = (getComputedStyle(el).display === "contents" ? kids : [el]).map((k) => k.getBoundingClientRect()).filter((r) => r.width || r.height);
      if (!rs.length) return null;
      const top = Math.min(...rs.map((r) => r.top));
      const left = Math.min(...rs.map((r) => r.left));
      return { top: top + scrollY, left: left + scrollX, width: Math.max(...rs.map((r) => r.right)) - left, height: Math.max(...rs.map((r) => r.bottom)) - top };
    };
    const place = (el: HTMLElement | null) => {
      const r = el && rectOf(el);
      if (!el || !r) return frame.removeAttribute("data-on");
      Object.assign(frame.style, { top: `${r.top}px`, left: `${r.left}px`, width: `${r.width}px`, height: `${r.height}px` });
      frame.setAttribute("data-on", "");
      frame.toggleAttribute("data-sel", el.dataset.opexSection === selected);
      frame.querySelector("b")!.textContent = el.dataset.opexLabel ?? "";
    };
    const sectionOf = (n: Element | null) => n?.closest<HTMLElement>("[data-opex-section]") ?? null;

    /** Marks editable text and images in every scope from the console's draft content. */
    const mark = (entries: Entries) => {
      for (const scope of scopes()) {
        const data = entries[scope.dataset.opexEntry!];
        if (data === undefined) continue;
        const base = scope.dataset.opexBase ?? "";
        const { texts, images } = leaves(base ? subtree(data, base) : data, locale, base);
        const els = scope.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6,p,span,li,a,button,dt,dd,figcaption,summary,label,small,strong,em,b");
        for (const el of els) {
          if (el.closest("[data-opex-entry]") !== scope || el.closest("form")) continue;
          // Only leaf-ish elements: their whole text is one content string.
          const paths = texts.get(norm(el.textContent ?? ""));
          if (!paths || el.querySelector("[data-opex-path]")) continue;
          el.dataset.opexPath = paths[0]!;
          el.dataset.opexOwner = scope.dataset.opexEntry!;
        }
        for (const img of scope.querySelectorAll<HTMLImageElement>("img")) {
          const p = images.get(imgSrc(img));
          if (p !== undefined) {
            img.dataset.opexImg = p || "/";
            img.dataset.opexOwner = scope.dataset.opexEntry!;
          }
        }
      }
      post({ type: "marked", count: document.querySelectorAll("[data-opex-path]").length });
    };

    const twins = (el: HTMLElement) => Array.from(document.querySelectorAll<HTMLElement>(`[data-opex-owner="${el.dataset.opexOwner}"][data-opex-path="${CSS.escape(el.dataset.opexPath!)}"]`));
    const startEdit = (el: HTMLElement) => {
      if (el.isContentEditable) return;
      el.contentEditable = "plaintext-only";
      el.focus();
      const before = el.textContent ?? "";
      const send = () => {
        const value = (el.textContent ?? "").trim();
        for (const t of twins(el)) if (t !== el) t.textContent = value;
        post({ type: "edit", entry: el.dataset.opexOwner, path: el.dataset.opexPath, value });
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          el.textContent = before;
          el.blur();
        } else if (e.key === "Enter" && !/^(P|DD|LI)$/.test(el.tagName)) {
          e.preventDefault();
          el.blur();
        }
      };
      const onBlur = () => {
        el.removeAttribute("contenteditable");
        el.removeEventListener("keydown", onKey);
        el.removeEventListener("input", send);
        if ((el.textContent ?? "") !== before) send();
      };
      el.addEventListener("keydown", onKey);
      el.addEventListener("input", send);
      el.addEventListener("blur", onBlur, { once: true });
    };

    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("#opex-frame b")) {
        e.preventDefault();
        if (hovered) post({ type: "select", section: hovered.dataset.opexSection ?? null, entry: hovered.dataset.opexEntry });
        return;
      }
      if (t.closest("form")) return; // forms stay usable
      const text = t.closest<HTMLElement>("[data-opex-path]");
      const img = t.closest<HTMLImageElement>("img[data-opex-img]");
      // Links and buttons never navigate while editing (Ctrl/Cmd-click still does).
      if (!e.ctrlKey && !e.metaKey && t.closest("a, button")) e.preventDefault();
      if (text) {
        e.preventDefault();
        startEdit(text);
      } else if (img) {
        e.preventDefault();
        post({ type: "pick-image", entry: img.dataset.opexOwner, path: img.dataset.opexImg });
      }
      const sec = sectionOf(t) ?? t.closest<HTMLElement>("[data-opex-entry]");
      if (sec) {
        selected = sec.dataset.opexSection ?? null;
        post({ type: "select", section: selected, entry: sec.dataset.opexEntry });
        place(sec);
      }
    };
    const onMove = (e: MouseEvent) => {
      const sec = sectionOf(e.target as Element) ?? (e.target as Element).closest<HTMLElement>("[data-opex-entry]");
      if (sec !== hovered) {
        hovered = sec;
        place(sec);
      }
    };
    const onMsg = (e: MessageEvent<Msg>) => {
      if (e.origin !== consoleOrigin || e.data?.source !== "opex-console") return;
      const m = e.data;
      if (m.type === "content") {
        locale = m.locale;
        mark(m.entries);
      } else if (m.type === "select") {
        selected = m.section;
        const el = m.section ? document.querySelector<HTMLElement>(`[data-opex-section="${CSS.escape(m.section)}"]`) : null;
        if (el) {
          const r = rectOf(el);
          if (r) scrollTo({ top: Math.max(0, r.top - 80), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
          hovered = el;
          place(el);
        }
      } else if (m.type === "text") {
        for (const el of document.querySelectorAll<HTMLElement>(`[data-opex-owner="${m.entry}"][data-opex-path="${CSS.escape(m.path)}"]`)) if (!el.isContentEditable) el.textContent = m.value;
      }
    };
    const onScroll = () => place(hovered);

    document.addEventListener("click", onClick, true);
    document.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("message", onMsg);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    post({
      type: "ready",
      path: location.pathname,
      locale,
      scopes: scopes().map((s) => ({ entry: s.dataset.opexEntry, section: s.dataset.opexSection ?? null, label: s.dataset.opexLabel ?? null })),
    });
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("mousemove", onMove);
      window.removeEventListener("message", onMsg);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      style.remove();
      frame.remove();
      w.__opexBridge = false;
    };
  }, [consoleOrigin]);
  return null;
}
