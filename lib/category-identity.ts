// The persisted Week prefix is an identity, not a freely editable display label.
export function plainCategory(category: string) {
  return category
    .trim()
    .replace(
      /^(?:[0-9#*]\uFE0F?\u20E3|[\p{Extended_Pictographic}\p{Regional_Indicator}][\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u200D\p{Emoji_Modifier}]*)\s+/u,
      '',
    );
}

export function weeklyCategoryNumber(category: string) {
  const match = /^Week ([1-4])(?: · .+)?$/i.exec(plainCategory(category));
  return match ? Number(match[1]) : null;
}

export function preserveWeeklyIdentity(original: string, category: string) {
  const week = weeklyCategoryNumber(original);
  if (!week) return category;
  const requestedWeek = weeklyCategoryNumber(category);
  if (requestedWeek && requestedWeek !== week)
    throw new Error(
      'Keep this category in its original week. Change a transaction category to move spending between weeks.',
    );
  if (requestedWeek) return category;
  const name = plainCategory(category);
  const emoji = category.slice(0, category.length - name.length);
  return `${emoji}Week ${week} · ${name}`;
}
