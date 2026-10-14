// Demo operations are intercepted in the visitor's browser; no server writes.
function browserOnly() {
  return Response.json({ error: 'This demo stores records only in your browser. No server ledger is available.' }, { status: 405 });
}
export const GET = browserOnly;
export const POST = browserOnly;
export const PUT = browserOnly;
export const PATCH = browserOnly;
export const DELETE = browserOnly;
