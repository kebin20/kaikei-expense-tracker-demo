export interface TokyoClock {
  date: string;
  hour: number;
}

const tokyoClockFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});

const tokyoDateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Tokyo',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

export function getTokyoClock(now = new Date()): TokyoClock {
  const parts = Object.fromEntries(
    tokyoClockFormatter
      .formatToParts(now)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
  };
}

export function formatTokyoDateTime(value: string | number | Date) {
  return tokyoDateTimeFormatter.format(new Date(value));
}
