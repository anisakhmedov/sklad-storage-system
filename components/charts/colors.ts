// Категориальная палитра (фиксированный порядок, не переставлять и не переиспользовать
// для другой семантики — см. skill dataviz). Значения для светлой темы веб-панели.
export const CATEGORICAL = {
  blue: "#2a78d6",
  orange: "#eb6834",
  aqua: "#1baf7a",
  yellow: "#eda100",
};

export const UNIT_COLORS: Record<string, string> = {
  tonne: CATEGORICAL.blue,
  kg: CATEGORICAL.orange,
  box: CATEGORICAL.aqua,
  piece: CATEGORICAL.yellow,
};

export const UNIT_LABELS: Record<string, string> = {
  tonne: "Тонны",
  kg: "Кг",
  box: "Ящики",
  piece: "Штуки",
};

export const METHOD_COLORS: Record<string, string> = {
  "Наличные": CATEGORICAL.blue,
  "Терминал": CATEGORICAL.orange,
  "Перечисление (счёт-банк)": CATEGORICAL.aqua,
  "Карта (счёт-карта)": CATEGORICAL.yellow,
};

export const CHART_CHROME = {
  grid: "#e6e9ee",
  axis: "#98a1b3",
  text: "#545e74",
};
