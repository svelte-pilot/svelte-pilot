export function appendSearchParams(searchParams, q): void {
  switch (q.constructor) {
    case Object:
      Object.entries(q).forEach(([key, val]) => {
        if (val != null) {
          if (val.constructor === Array) {
            val.forEach(v => searchParams.append(key, v));
          } else {
            searchParams.append(key, val);
          }
        }
      });

      break;

    case String:
      q = new URLSearchParams(q);
      // falls through
    case URLSearchParams:
      q.forEach((val, key) => searchParams.append(key, val));
      break;

    case Array:
      q.forEach(([key, val]) => searchParams.append(key, val));
      break;
  }
}
