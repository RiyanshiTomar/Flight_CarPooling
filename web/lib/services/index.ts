import { httpService } from "./http";
import { mockService } from "./mock";
import type { FlyPoolService } from "./types";

/**
 * ===========================================================================
 *  THE ONE PLACE TO CHANGE THE BACKEND
 * ===========================================================================
 *  Every page uses `service` below. To switch backends, change the single
 *  line marked  <-- CHANGE HERE.
 *
 *  Using a new backend (Firebase, Supabase, another REST API, GraphQL...):
 *    1. Create lib/services/myBackend.ts that exports an object implementing `FlyPoolService`
 *       (see ./types.ts, copy ./http.ts as a starting point).
 *    2. Import it here and use it on the marked line.
 *  No page or component needs to change.
 *
 *  Quick switch without code: set NEXT_PUBLIC_DATA_SOURCE=mock in web/.env.local
 *  to run the whole website offline on the in-memory mock service.
 */
const defaultService: FlyPoolService = httpService; // <-- CHANGE HERE

export const service: FlyPoolService = process.env.NEXT_PUBLIC_DATA_SOURCE === "mock" ? mockService : defaultService;

export * from "./types";
