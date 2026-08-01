/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as adapters_email_postmark from "../adapters/email/postmark.js";
import type * as adapters_form_worker from "../adapters/form/worker.js";
import type * as adapters_phone_signature from "../adapters/phone/signature.js";
import type * as adapters_phone_twilio from "../adapters/phone/twilio.js";
import type * as adapters_phone_vapi from "../adapters/phone/vapi.js";
import type * as core_bands from "../core/bands.js";
import type * as core_hours from "../core/hours.js";
import type * as core_outcome from "../core/outcome.js";
import type * as core_verdict from "../core/verdict.js";
import type * as core_windows from "../core/windows.js";
import type * as crons from "../crons.js";
import type * as enrichment_cache from "../enrichment/cache.js";
import type * as enrichment_competitors from "../enrichment/competitors.js";
import type * as enrichment_crawl from "../enrichment/crawl.js";
import type * as enrichment_reviews from "../enrichment/reviews.js";
import type * as enrichment_screenshot from "../enrichment/screenshot.js";
import type * as http from "../http.js";
import type * as ports_probe from "../ports/probe.js";
import type * as runs_activate from "../runs/activate.js";
import type * as runs_artifacts from "../runs/artifacts.js";
import type * as runs_auditLog from "../runs/auditLog.js";
import type * as runs_debrief from "../runs/debrief.js";
import type * as runs_dispatch from "../runs/dispatch.js";
import type * as runs_kill from "../runs/kill.js";
import type * as runs_queries from "../runs/queries.js";
import type * as runs_resolve from "../runs/resolve.js";
import type * as scans from "../scans.js";
import type * as scheduler_reconcile from "../scheduler/reconcile.js";
import type * as scheduler_retention from "../scheduler/retention.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "adapters/email/postmark": typeof adapters_email_postmark;
  "adapters/form/worker": typeof adapters_form_worker;
  "adapters/phone/signature": typeof adapters_phone_signature;
  "adapters/phone/twilio": typeof adapters_phone_twilio;
  "adapters/phone/vapi": typeof adapters_phone_vapi;
  "core/bands": typeof core_bands;
  "core/hours": typeof core_hours;
  "core/outcome": typeof core_outcome;
  "core/verdict": typeof core_verdict;
  "core/windows": typeof core_windows;
  crons: typeof crons;
  "enrichment/cache": typeof enrichment_cache;
  "enrichment/competitors": typeof enrichment_competitors;
  "enrichment/crawl": typeof enrichment_crawl;
  "enrichment/reviews": typeof enrichment_reviews;
  "enrichment/screenshot": typeof enrichment_screenshot;
  http: typeof http;
  "ports/probe": typeof ports_probe;
  "runs/activate": typeof runs_activate;
  "runs/artifacts": typeof runs_artifacts;
  "runs/auditLog": typeof runs_auditLog;
  "runs/debrief": typeof runs_debrief;
  "runs/dispatch": typeof runs_dispatch;
  "runs/kill": typeof runs_kill;
  "runs/queries": typeof runs_queries;
  "runs/resolve": typeof runs_resolve;
  scans: typeof scans;
  "scheduler/reconcile": typeof scheduler_reconcile;
  "scheduler/retention": typeof scheduler_retention;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
