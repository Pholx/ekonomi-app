// ════════════════════════════════════════════════════════════════════
// AGE CURVE – linjär interpolering mellan åldersspannens mittpunkter
// ════════════════════════════════════════════════════════════════════
// Ersätter diskreta åldersspann (t.ex. "25-34") med en kontinuerlig
// kurva så att en 32-åring får ett värde mellan 25-34-punkten och
// 35-44-punkten istället för att hoppa mellan två spann.
//
// Anropas med en ålder och en lista av { age, value }-punkter.
// Klämmer i ändarna (under första punkten → första värdet, över
// sista punkten → sista värdet).
// ════════════════════════════════════════════════════════════════════

function interpolateAtAge(age, points) {
  if (!points || points.length === 0) return 0;
  if (age == null || isNaN(age)) return 0;

  const sorted = [...points].sort((a, b) => a.age - b.age);

  if (age <= sorted[0].age) return sorted[0].value;
  if (age >= sorted[sorted.length - 1].age) return sorted[sorted.length - 1].value;

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (age >= a.age && age <= b.age) {
      const t = (age - a.age) / (b.age - a.age);
      return a.value + t * (b.value - a.value);
    }
  }
  return sorted[sorted.length - 1].value;
}

// Bygger en points-array från ett åldersspann-objekt.
//   map      = { '25-34': 42, '35-44': 62, ... }
//   midpoints = { '25-34': 29.5, '35-44': 39.5, ... }
// Returnerar [{ age: 29.5, value: 42 }, ...]
function buildAgePoints(map, midpoints) {
  return Object.keys(map)
    .filter(k => midpoints[k] !== undefined)
    .map(k => ({ age: midpoints[k], value: map[k] }));
}

// Standard-mittpunkter för SCB:s 10-årsspann (används av compare*.js)
const AGE_MIDPOINTS_10Y = {
  '18-24': 21,
  '25-34': 29.5,
  '35-44': 39.5,
  '45-54': 49.5,
  '55-64': 59.5,
  '65-74': 69.5,
  '75+':   82      // öppen övre gräns – satt vid 82 som rimligt antagande
};