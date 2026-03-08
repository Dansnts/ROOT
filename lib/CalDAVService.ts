/**
 * CalDAVService.ts — Sync bidirectionnelle complète
 *
 * Pull  : REPORT → parse iCal → blocs chiffrés IndexedDB
 * Push  : création/édition/suppression → PUT/DELETE → serveur CalDAV
 * Proxy : toutes les requêtes passent par /caldav-proxy/ (pas de CORS)
 *
 * SÉCURITÉ :
 *  - Credentials déchiffrés en RAM uniquement pour la durée de la requête
 *  - nginx proxy : access_log désactivé pour ce bloc
 *  - CryptoKey jamais exposée dans ce module
 */

import ICAL from "ical.js";
import { db } from "./database";
import { encryptValue, decryptValue } from "@/stores/vaultStore";
import type { CalDAVConfig, CalendarEntry } from "./database";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SyncResult {
  created: number;
  updated: number;
  deleted: number;
  errors: number;
  errorMessage?: string;
}

export interface CalDAVEvent {
  uid: string;
  href: string;    // URL complète sur le serveur (/dav/.../event.ics)
  etag: string;
  summary: string;
  dtstart: string; // YYYY-MM-DD
  dtend?: string;  // YYYY-MM-DD
  description?: string;
  location?: string;
  status?: string;
}

export interface EventFormData {
  uid?: string;       // présent si édition d'un event existant
  summary: string;
  dtstart: string;    // YYYY-MM-DD
  dtend?: string;     // YYYY-MM-DD
  description?: string;
  location?: string;
  caldavUrl?: string; // URL sur le serveur (pour PUT/DELETE)
  caldavEtag?: string;
}

// Propriétés stockées dans encryptedProperties d'un bloc CalDAV
export interface CalDAVBlockProps {
  dueDate?: string;
  endDate?: string;
  description?: string;
  location?: string;
  caldavEventId?: string;   // UID
  caldavUrl?: string;        // URL ressource sur le serveur
  caldavEtag?: string;       // ETag pour détection de conflit
  status?: string;
  priority?: string;
}

// ── Proxy URL ─────────────────────────────────────────────────────────────────

function toProxyUrl(originalUrl: string): string {
  try {
    const u = new URL(originalUrl);
    return `/caldav-proxy/${u.hostname}${u.pathname}${u.search}`;
  } catch {
    return originalUrl;
  }
}

function eventResourceUrl(calendarUrl: string, uid: string): string {
  const base = calendarUrl.endsWith("/") ? calendarUrl : calendarUrl + "/";
  return base + uid + ".ics";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildBasicAuth(username: string, password: string): string {
  return "Basic " + btoa(`${username}:${password}`);
}

function escapeICalText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function nextDay(dateStr: string): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

function toICalDate(dateStr: string): string {
  return dateStr.replace(/-/g, "");
}

function nowStamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

// ── Génération iCal ───────────────────────────────────────────────────────────

export function generateICalString(event: EventFormData): string {
  const uid = event.uid ?? crypto.randomUUID();
  const dtstart = toICalDate(event.dtstart);
  const dtend = toICalDate(event.dtend ?? nextDay(event.dtstart));

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ROOT//ROOT Calendar 1.0//FR",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `SUMMARY:${escapeICalText(event.summary)}`,
    `DTSTART;VALUE=DATE:${dtstart}`,
    `DTEND;VALUE=DATE:${dtend}`,
    `DTSTAMP:${nowStamp()}`,
    event.description ? `DESCRIPTION:${escapeICalText(event.description)}` : null,
    event.location ? `LOCATION:${escapeICalText(event.location)}` : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean) as string[];

  return lines.join("\r\n");
}

// ── Parsing XML response ──────────────────────────────────────────────────────

function parseMultistatusResponses(xmlText: string): { href: string; etag: string; ical: string }[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");
  const responses = doc.getElementsByTagNameNS("DAV:", "response");
  const results: { href: string; etag: string; ical: string }[] = [];

  for (const response of Array.from(responses)) {
    const href = response.getElementsByTagNameNS("DAV:", "href")[0]?.textContent ?? "";
    const etag = response.getElementsByTagNameNS("DAV:", "getetag")[0]?.textContent ?? "";
    const ical = response.getElementsByTagNameNS("urn:ietf:params:xml:ns:caldav", "calendar-data")[0]?.textContent ?? "";
    if (ical) results.push({ href, etag: etag.replace(/"/g, ""), ical });
  }

  return results;
}

/**
 * Parse un bloc iCal et retourne tous les événements :
 *  - Événement simple → tableau de 1 élément
 *  - Événement récurrent (RRULE) → toutes les occurrences développées sur
 *    la fenêtre [aujourd'hui - 1 an … aujourd'hui + 2 ans], max 730 occ.
 *
 * Chaque occurrence récurrente a un UID unique : `${baseUid}__${dtstart}`
 * afin de pouvoir les stocker et identifier séparément dans IndexedDB.
 */
function parseICalToEvents(ical: string, href: string, etag: string): CalDAVEvent[] {
  if (!ical.trim()) return [];
  try {
    const jcal = ICAL.parse(ical);
    const comp = new ICAL.Component(jcal);
    const vevent = comp.getFirstSubcomponent("vevent");
    if (!vevent) return [];

    const ev = new ICAL.Event(vevent);
    const baseUid = ev.uid ?? crypto.randomUUID();
    const summary = ev.summary ?? "Sans titre";
    const description = vevent.getFirstPropertyValue("description") as string | undefined;
    const location   = vevent.getFirstPropertyValue("location")    as string | undefined;
    const status     = vevent.getFirstPropertyValue("status")      as string | undefined;

    // ── Événement simple ──────────────────────────────────────────────────────
    if (!ev.isRecurring()) {
      const dtstart = ev.startDate?.toJSDate()?.toISOString().split("T")[0];
      const dtend   = ev.endDate?.toJSDate()?.toISOString().split("T")[0];
      if (!dtstart) return [];
      return [{ uid: baseUid, href, etag, summary, dtstart, dtend, description, location, status }];
    }

    // ── Événement récurrent : développement des occurrences ───────────────────
    const now        = new Date();
    const rangeStart = new Date(now.getFullYear() - 1, 0, 1);
    const rangeEnd   = new Date(now.getFullYear() + 2, 11, 31);
    const MAX_OCC    = 730; // ~2 ans hebdo max

    // Durée de l'événement source (en ms) pour calculer dtend des occurrences
    const srcStart = ev.startDate?.toJSDate();
    const srcEnd   = ev.endDate?.toJSDate();
    const durationMs = srcStart && srcEnd ? srcEnd.getTime() - srcStart.getTime() : 0;

    const expand = new ICAL.RecurExpansion({ component: vevent, dtstart: ev.startDate });
    const events: CalDAVEvent[] = [];
    let count = 0;
    let prevStr = ""; // garde contre boucle infinie si next() ne progresse pas

    for (let next = expand.next(); next && count < MAX_OCC; next = expand.next()) {
      const jsDate  = next.toJSDate();
      const dateStr = jsDate.toISOString().split("T")[0];

      // Guard : si la date n'avance plus, on arrête
      if (dateStr === prevStr) break;
      prevStr = dateStr;

      if (jsDate > rangeEnd) break;
      count++;
      if (jsDate < rangeStart) continue;

      // Calcul de dtend à partir de la durée source (évite getOccurrenceDetails
      // qui est instable dans certaines versions ical.js browser)
      const occEnd = durationMs > 0
        ? new Date(jsDate.getTime() + durationMs).toISOString().split("T")[0]
        : undefined;

      events.push({
        uid: `${baseUid}__${dateStr}`,
        href,
        etag,
        summary,
        dtstart: dateStr,
        dtend: occEnd && occEnd !== dateStr ? occEnd : undefined,
        description,
        location,
        status,
      });
    }

    // Fallback : si l'expansion n'a rien produit, retourner au moins l'événement de base
    if (events.length === 0 && srcStart) {
      const dtstart = srcStart.toISOString().split("T")[0];
      const dtend   = srcEnd?.toISOString().split("T")[0];
      return [{ uid: baseUid, href, etag, summary, dtstart, dtend, description, location, status }];
    }

    return events;
  } catch {
    return [];
  }
}

// ── Diagnostic erreur ─────────────────────────────────────────────────────────

function diagnoseFetchError(err: unknown, url: string): string {
  const msg = String(err);
  if (msg.includes("NetworkError") || msg.includes("Failed to fetch") || msg.includes("Load failed")) {
    const host = (() => { try { return new URL(url).hostname; } catch { return url; } })();
    return `Erreur réseau — impossible de joindre ${host}. Vérifiez votre connexion.`;
  }
  return msg;
}

// ── Découverte des calendriers ────────────────────────────────────────────────

export interface DiscoveredCalendar {
  url: string;
  displayName: string;
  color?: string;
}

export async function discoverCalendars(
  config: Pick<CalDAVConfig, "serverUrl" | "username" | "password">
): Promise<{ calendars: DiscoveredCalendar[]; error?: string }> {
  const auth = buildBasicAuth(config.username, config.password);

  try {
    const res = await fetch(toProxyUrl(config.serverUrl), {
      method: "PROPFIND",
      headers: {
        Authorization: auth,
        Depth: "1",
        "Content-Type": "application/xml; charset=utf-8",
      },
      body: `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:A="http://apple.com/ns/ical/">
  <D:prop>
    <D:displayname/>
    <D:resourcetype/>
    <A:calendar-color/>
  </D:prop>
</D:propfind>`,
    });

    if (!res.ok && res.status !== 207) {
      if (res.status === 401) return { calendars: [], error: "Authentification refusée — vérifiez identifiant et mot de passe." };
      return { calendars: [], error: `HTTP ${res.status}` };
    }

    const xmlText = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "application/xml");
    const responses = doc.getElementsByTagNameNS("DAV:", "response");
    const calendars: DiscoveredCalendar[] = [];

    for (const response of Array.from(responses)) {
      // Only include resources that have <C:calendar> in their resourcetype
      const resourcetype = response.getElementsByTagNameNS("DAV:", "resourcetype")[0];
      const isCalendar = resourcetype
        ? resourcetype.getElementsByTagNameNS("urn:ietf:params:xml:ns:caldav", "calendar").length > 0
        : false;
      if (!isCalendar) continue;

      const href = response.getElementsByTagNameNS("DAV:", "href")[0]?.textContent ?? "";
      const displayName = response.getElementsByTagNameNS("DAV:", "displayname")[0]?.textContent ?? "";
      const colorRaw = response.getElementsByTagNameNS("http://apple.com/ns/ical/", "calendar-color")[0]?.textContent;
      // Some servers return #RRGGBBAA — keep only #RRGGBB
      const color = colorRaw ? colorRaw.slice(0, 7) : undefined;

      // Reconstruct full URL from relative href
      let url: string;
      try {
        const origin = new URL(config.serverUrl).origin;
        url = new URL(href, origin).toString();
      } catch {
        url = href;
      }

      calendars.push({ url, displayName: displayName || url, color });
    }

    return { calendars };
  } catch (err) {
    return { calendars: [], error: diagnoseFetchError(err, config.serverUrl) };
  }
}

// ── Test de connexion ─────────────────────────────────────────────────────────

export async function testCalDAVConnection(config: Pick<CalDAVConfig, "serverUrl" | "username" | "password">): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(toProxyUrl(config.serverUrl), {
      method: "PROPFIND",
      headers: {
        Authorization: buildBasicAuth(config.username, config.password),
        Depth: "0",
        "Content-Type": "application/xml",
      },
      body: `<?xml version="1.0"?><D:propfind xmlns:D="DAV:"><D:prop><D:resourcetype/></D:prop></D:propfind>`,
    });
    if (res.ok || res.status === 207) return { ok: true, message: `Connexion réussie (HTTP ${res.status})` };
    if (res.status === 401) return { ok: false, message: "Authentification refusée — vérifiez identifiant et mot de passe." };
    if (res.status === 403) return { ok: false, message: "Accès interdit (403) — vérifiez les permissions." };
    if (res.status === 404) return { ok: false, message: "URL introuvable (404) — vérifiez l'URL du calendrier." };
    return { ok: false, message: `Erreur HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, message: diagnoseFetchError(err, config.serverUrl) };
  }
}

// ── Push : créer ou mettre à jour un événement sur le serveur ─────────────────

export async function pushEventToCalDAV(
  config: Pick<CalDAVConfig, "serverUrl" | "username" | "password">,
  event: EventFormData
): Promise<{ ok: boolean; url: string; etag: string; message?: string }> {
  const uid = event.uid ?? crypto.randomUUID();
  const resourceUrl = event.caldavUrl ?? eventResourceUrl(config.serverUrl, uid);
  const ical = generateICalString({ ...event, uid });

  const headers: Record<string, string> = {
    Authorization: buildBasicAuth(config.username, config.password),
    "Content-Type": "text/calendar; charset=utf-8",
  };

  // If-None-Match: * pour les nouveaux événements (évite d'écraser un existant)
  if (!event.caldavUrl) headers["If-None-Match"] = "*";
  // If-Match pour les mises à jour (détection de conflit)
  if (event.caldavEtag) headers["If-Match"] = `"${event.caldavEtag}"`;

  try {
    const res = await fetch(toProxyUrl(resourceUrl), {
      method: "PUT",
      headers,
      body: ical,
    });

    if (res.ok || res.status === 201 || res.status === 204) {
      const etag = res.headers.get("ETag")?.replace(/"/g, "") ?? event.caldavEtag ?? "";
      return { ok: true, url: resourceUrl, etag };
    }
    return { ok: false, url: resourceUrl, etag: "", message: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, url: resourceUrl, etag: "", message: diagnoseFetchError(err, resourceUrl) };
  }
}

// ── Push : supprimer un événement sur le serveur ──────────────────────────────

export async function deleteEventFromCalDAV(
  config: Pick<CalDAVConfig, "serverUrl" | "username" | "password">,
  caldavUrl: string,
  etag?: string
): Promise<{ ok: boolean; message?: string }> {
  const headers: Record<string, string> = {
    Authorization: buildBasicAuth(config.username, config.password),
  };
  if (etag) headers["If-Match"] = `"${etag}"`;

  try {
    const res = await fetch(toProxyUrl(caldavUrl), { method: "DELETE", headers });
    if (res.ok || res.status === 204 || res.status === 404) return { ok: true };
    return { ok: false, message: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, message: diagnoseFetchError(err, caldavUrl) };
  }
}

// ── Pull + merge : sync complète depuis le serveur ───────────────────────────

export async function syncCalDAV(
  config: Pick<CalDAVConfig, "serverUrl" | "username" | "password">,
  entry: CalendarEntry
): Promise<SyncResult> {
  const result: SyncResult = { created: 0, updated: 0, deleted: 0, errors: 0 };
  const categoryId = entry.categoryId ?? entry.categoryId;
  if (!categoryId) return { ...result, errors: 1, errorMessage: "Catégorie non définie pour ce calendrier." };

  const blockType = entry.mode === "kanban" ? "task" : "calendar-event";
  const auth = buildBasicAuth(config.username, config.password);
  let xmlText: string;

  try {
    const res = await fetch(toProxyUrl(entry.url), {
      method: "REPORT",
      headers: {
        Authorization: auth,
        Depth: "1",
        "Content-Type": "application/xml; charset=utf-8",
      },
      body: `<?xml version="1.0" encoding="utf-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop><D:getetag/><C:calendar-data/></D:prop>
  <C:filter><C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT"/></C:comp-filter></C:filter>
</C:calendar-query>`,
    });

    if (!res.ok && res.status !== 207) throw new Error(`HTTP ${res.status}`);
    xmlText = await res.text();
  } catch (err) {
    return { ...result, errors: 1, errorMessage: diagnoseFetchError(err, config.serverUrl) };
  }

  const responses = parseMultistatusResponses(xmlText);
  const serverUids = new Set<string>();
  const calBase = entry.url.replace(/\/?$/, "/");

  // Charge une fois tous les blocs de la page cible pour éviter N requêtes DB
  const pageBlocks = await db.blocks
    .where("pageId").equals(categoryId)
    .filter((b: import("./database").BlockRecord) => !b.isDeleted)
    .toArray();

  // Index uid→block pour lookup O(1) (uid = caldavEventId stocké dans les props)
  const blockByUid = new Map<string, typeof pageBlocks[0]>();
  for (const block of pageBlocks) {
    try {
      const props = await decryptValue<CalDAVBlockProps>(block.encryptedProperties);
      if (props.caldavEventId && props.caldavUrl?.startsWith(calBase)) {
        blockByUid.set(props.caldavEventId, block);
      }
    } catch { /* skip */ }
  }

  for (const { href, etag, ical } of responses) {
    // Développe récurrences → peut retourner plusieurs occurrences
    const calEvents = parseICalToEvents(ical, href, etag);

    for (const event of calEvents) {
      serverUids.add(event.uid);

      try {
        const newContent = { type: "paragraph", content: [{ type: "text", text: event.summary }] };
        const newProps: CalDAVBlockProps = {
          dueDate: event.dtstart,
          endDate: event.dtend,
          description: event.description,
          location: event.location,
          caldavEventId: event.uid,
          // Pour les occurrences récurrentes, l'URL pointe vers l'événement de base (href)
          caldavUrl: href.startsWith("http") ? href : new URL(href, new URL(entry.url).origin).toString(),
          caldavEtag: event.etag,
        };

        const foundBlock = blockByUid.get(event.uid);

        if (foundBlock) {
          // Mise à jour uniquement si l'etag a changé
          const currentProps = await decryptValue<CalDAVBlockProps>(foundBlock.encryptedProperties);
          if (currentProps.caldavEtag !== event.etag) {
            await db.blocks.update(foundBlock.id, {
              encryptedContent: await encryptValue(newContent),
              encryptedProperties: await encryptValue({ ...currentProps, ...newProps }),
              updatedAt: Date.now(),
            });
            result.updated++;
          }
        } else {
          const order = await db.blocks.where("pageId").equals(categoryId).count();
          const newBlock = {
            id: crypto.randomUUID(),
            pageId: categoryId,
            parentBlockId: null as null,
            type: blockType as import("./database").BlockType,
            encryptedContent: await encryptValue(newContent),
            encryptedProperties: await encryptValue(newProps),
            order,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            isDeleted: false,
          };
          await db.blocks.add(newBlock);
          blockByUid.set(event.uid, newBlock as typeof pageBlocks[0]);
          result.created++;
        }
      } catch {
        result.errors++;
      }
    }
  }

  return result;
}
