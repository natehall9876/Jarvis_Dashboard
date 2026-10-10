import { test, expect } from "@playwright/test";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadServerModule } from "./load-server-module";

const properties = [
  { id: "first", street: "12 Main St #2 & Rear", city: "Smithfield", state: "RI", zip: "02917" },
  { id: "second", street: "30 Oak Road", city: "Johnston", state: "RI", zip: "02919" },
];

async function renderClient(rows = properties) {
  const { default: Page } = loadServerModule<{ default: (props: unknown) => Promise<ReactElement> }>(
    "src/app/(dashboard)/clients/[id]/page.tsx",
    {
      "next/link": ({ href, children, ...props }: { href: string; children: ReactNode }) => createElement("a", { href, ...props }, children),
      "@/lib/data/clients": { getClientById: async () => ({ error: null, data: {
        client: { id: "client", first_name: "Sample", status: "inactive" }, properties: rows,
        jobs: [], quotes: [], invoices: [], outstanding_balance: 0, balance_verified: true,
      } }) },
      "@/lib/data/client-photos": { getClientPhotos: async () => ({ data: [] }) },
      "@/lib/data/options": { getServiceOptions: async () => ({ data: [] }) },
      "@/lib/supabase/storage": { getJobPhotoUrls: async () => ({ urls: new Map(), error: null }) },
      "@/lib/actions/clients": { updateClient: async () => {}, archiveClient: async () => {} },
      "@/components/clients/client-form": { ClientForm: () => null },
      "@/components/photos/photo-upload-form": { PhotoUploadForm: () => null },
      "@/components/photos/photo-grid": { PhotoGrid: () => null },
    },
  );
  return renderToStaticMarkup(await Page({ params: Promise.resolve({ id: "client" }), searchParams: Promise.resolve({}) }));
}

function links(html: string) {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((match) => ({
    attrs: match[1],
    href: /href="([^"]+)"/.exec(match[1])?.[1].replaceAll("&amp;", "&"),
    text: match[2].replace(/<[^>]+>/g, "").replaceAll("&amp;", "&"),
  }));
}

test("client addresses open Google Maps with the full property address, independently for each property", async () => {
  const anchors = links(await renderClient());
  for (const property of properties) {
    const address = [property.street, property.city, property.state, property.zip].join(", ");
    const link = anchors.find((a) => a.text === address);
    expect(link?.href).toBeDefined();
    const url = new URL(link!.href!, "https://jarvis.example");
    expect(url.origin).toBe("https://www.google.com");
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("query")).toBe(address);
    expect(link?.attrs).toContain('target="_blank"');
    expect(link?.attrs).toContain("noopener noreferrer");
  }
});

test("each property offers separate Apple and Google Maps choices and keeps explicit property details", async () => {
  const anchors = links(await renderClient());
  const apple = anchors.filter((a) => a.text === "Apple Maps");
  const google = anchors.filter((a) => a.text === "Google Maps");
  expect(apple).toHaveLength(2);
  expect(google).toHaveLength(2);
  for (let i = 0; i < properties.length; i++) {
    const address = [properties[i].street, properties[i].city, properties[i].state, properties[i].zip].join(", ");
    expect(new URL(apple[i].href!).hostname).toBe("maps.apple.com");
    expect(new URL(apple[i].href!).searchParams.get("address")).toBe(address);
    expect(new URL(google[i].href!).searchParams.get("query")).toBe(address);
    expect(apple[i].attrs).toContain("min-h-11");
    expect(google[i].attrs).toContain("min-h-11");
    expect(anchors.find((a) => a.href === "/properties/" + properties[i].id)?.text).toBe("Property details");
  }
});

test("a missing street does not send a property nickname or city-only record to Maps", async () => {
  const html = await renderClient([{ id: "empty", street: "  ", city: "Smithfield", state: "RI", zip: "" }]);
  expect(links(html).filter((a) => a.href?.startsWith("https://"))).toHaveLength(0);
  expect(html).toContain("Street address not available");
  expect(links(html).some((a) => a.href === "/properties/empty")).toBe(true);
});
