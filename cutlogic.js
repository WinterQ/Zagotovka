// cutlogic.js
// Точность 0.1 мм
const SCALE = 10; // 1 единица = 0.1 мм

function toUnits(mm) {
  return Math.round(parseFloat(mm) * SCALE);
}

function fromUnits(units) {
  return (units / SCALE).toFixed(1); // строка с 1 знаком после запятой
}

/**
 * positions: массив объектов
 *   { length_mm: число, width_mm: число, count: целое }
 * sheetWidthMm: ширина листа (мм, число)
 * sheetLengthsMm: массив длин листов (мм, числа)
 * kerfMm: толщина реза (мм, число)
 *
 * Возвращает:
 * {
 *   sheets: [
 *     {
 *       id,
 *       length_u,
 *       used_width_u,
 *       items: [{ length_u, width_u, count }]
 *     },
 *   ],
 *   wastes: { "w_u_len_u": count, ... },
 *   totalSheets: число
 * }
 */
function calculateCutlist(positions, sheetWidthMm, sheetLengthsMm, kerfMm) {
  const sheetWidthU = Math.round(sheetWidthMm * SCALE);
  const kerfU = Math.round(kerfMm * SCALE);

  // Уникальные длины листов, сортировка по убыванию
  const sheetLengthsU = Array.from(
    new Set(sheetLengthsMm.map(L => Math.round(L * SCALE)))
  ).sort((a, b) => b - a);

  // Нормализуем позиции в десятых мм
  const normPositions = positions.map(pos => ({
    length_u: Math.round(pos.length_mm * SCALE),
    width_u: Math.round(pos.width_mm * SCALE),
    count: pos.count
  }));

  // Сортировка: сначала по длине, потом по ширине (убывание)
  normPositions.sort((a, b) => {
    if (a.length_u !== b.length_u) return b.length_u - a.length_u;
    return b.width_u - a.width_u;
  });

  const sheets = [];
  const wastes = {}; // ключ "w_u_len_u" -> count
  let sheetId = 0;

  for (const pos of normPositions) {
    let needed = pos.count;
    const pieceLen = pos.length_u;
    const pieceWFull = pos.width_u + kerfU;

    while (needed > 0) {
      let bestIndex = null;
      let bestRemainingW = null;

      // Ищем лучший существующий лист (Best Fit)
      for (let i = 0; i < sheets.length; i++) {
        const sh = sheets[i];
        if (pieceLen <= sh.length_u) {
          const remainingW = sheetWidthU - sh.used_width_u;
          if (pieceWFull <= remainingW) {
            const restAfter = remainingW - pieceWFull;
            if (bestRemainingW === null || restAfter < bestRemainingW) {
              bestRemainingW = restAfter;
              bestIndex = i;
            }
          }
        }
      }

      if (bestIndex !== null) {
        // Кладём на существующий лист
        const sh = sheets[bestIndex];
        sh.used_width_u += pieceWFull;

        let merged = false;
        for (const it of sh.items) {
          if (it.length_u === pieceLen && it.width_u === pos.width_u) {
            it.count += 1;
            merged = true;
            break;
          }
        }
        if (!merged) {
          sh.items.push({
            length_u: pieceLen,
            width_u: pos.width_u,
            count: 1
          });
        }
        needed -= 1;
        continue;
      }

      // Нужен новый лист: берём минимальную длину, которой хватает
      let chooseLenU = null;
      for (const L of sheetLengthsU) {
        if (pieceLen <= L) {
          chooseLenU = L;
          // не break: берём самую МАЛЕНЬКУЮ подходящую (последнюю в цикле)
        }
      }
      if (chooseLenU === null) {
        throw new Error(
          `Деталь длиной ${fromUnits(pieceLen)} мм длиннее любого листа`
        );
      }

      sheetId += 1;
      const newSheet = {
        id: sheetId,
        length_u: chooseLenU,
        used_width_u: pieceWFull,
        items: [{
          length_u: pieceLen,
          width_u: pos.width_u,
          count: 1
        }]
      };
      sheets.push(newSheet);
      needed -= 1;
    }
  }

  // Считаем отходы
  for (const sh of sheets) {
    const wasteW = sheetWidthU - sh.used_width_u;
    if (wasteW > 0) {
      const key = `${wasteW}_${sh.length_u}`;
      wastes[key] = (wastes[key] || 0) + 1;
    }

    const minPieceLen = Math.min(...sh.items.map(it => it.length_u));
    if (minPieceLen < sh.length_u) {
      const wasteLen = sh.length_u - minPieceLen;
      const key = `${sheetWidthU}_${wasteLen}`;
      wastes[key] = (wastes[key] || 0) + 1;
    }
  }

  return {
    sheets,
    wastes,
    totalSheets: sheets.length
  };
}

// Экспорт для Node (не мешает в браузере)
if (typeof module !== "undefined") {
  module.exports = { calculateCutlist, toUnits, fromUnits, SCALE };
}
