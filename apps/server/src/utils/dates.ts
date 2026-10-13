export function startOfDay(date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date = new Date()): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function resolveDateRange(opts: {
  preset?: string;
  from?: string;
  to?: string;
}): { from: Date; to: Date } {
  const today = new Date();
  switch (opts.preset) {
    case 'YESTERDAY': {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case 'THIS_WEEK': {
      const w = new Date(today);
      w.setDate(w.getDate() - 6);
      return { from: startOfDay(w), to: endOfDay(today) };
    }
    case 'THIS_MONTH': {
      const m = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: startOfDay(m), to: endOfDay(today) };
    }
    case 'CUSTOM':
      return {
        from: startOfDay(opts.from ? new Date(opts.from) : today),
        to: endOfDay(opts.to ? new Date(opts.to) : today),
      };
    case 'TODAY':
    default:
      return { from: startOfDay(today), to: endOfDay(today) };
  }
}
