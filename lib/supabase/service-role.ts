// Split from service-role-core so CLI scripts (e.g. scripts/backfill_*) can import the core without tripping the server-only guard.
import 'server-only'
export { getServiceClient } from './service-role-core'
