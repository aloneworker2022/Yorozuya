/* 畫面和描述共用的日本時間。 */
export function japanNow(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("zh-Hant", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((part) => [part.type, part.value]));
  const hour = Number(parts.hour);
  const month = Number(parts.month);
  const dayPart = hour < 5 || hour >= 23 ? "深夜" : hour < 10 ? "早晨" : hour < 17 ? "白天" : hour < 19 ? "傍晚" : "晚上";
  const season = month === 12 || month <= 2 ? "冬" : month <= 5 ? "春" : month <= 8 ? "夏" : "秋";
  const label = `${parts.month}月${parts.day}日 ${parts.weekday} ${parts.hour}:${parts.minute}`;
  return {
    label,
    hour,
    month,
    dayPart,
    season,
    line: `現在是日本時間${parts.year}年${label}，${season}季的${dayPart}。描述必須符合這個時間和季節，不要把${dayPart}寫成別的時段。`,
  };
}
