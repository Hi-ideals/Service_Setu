/** Every successful response has the same envelope, so the frontend has one parser. */
export function ok(res, data, { message = 'OK', status = 200, meta } = {}) {
  const body = { success: true, message, data };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

export function created(res, data, message = 'Created successfully') {
  return ok(res, data, { message, status: 201 });
}

export function noContent(res) {
  return res.status(204).send();
}

/** Paginated list response. `meta` carries what the UI needs to render a pager. */
export function paginated(res, items, { page, limit, total, message = 'OK' }) {
  return ok(res, items, {
    message,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  });
}

export default { ok, created, noContent, paginated };
