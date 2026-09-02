function localOnlyResponse() {
  return Response.json(
    { error: 'Cloud sync is disabled. This version stores data only on the current device.' },
    { status: 410 },
  );
}

// The previous single-record D1 endpoint had no user identity boundary. Keep the
// route closed so older clients cannot expose or overwrite a self-use snapshot.
export async function GET() {
  return localOnlyResponse();
}

export async function PUT() {
  return localOnlyResponse();
}
