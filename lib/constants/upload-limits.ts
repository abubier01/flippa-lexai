/**
 * Shared upload size limit so client-side validation and the server-side
 * 413 guard cannot drift. Update here and both honor it.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export const MAX_UPLOAD_BYTES_LABEL = '10 MB'
