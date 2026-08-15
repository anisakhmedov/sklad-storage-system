import { connectDB } from "./db";
import { Container } from "@/models/Container";
import { StorageRecord } from "@/models/StorageRecord";
import { ownerLabelOf } from "./ownerKey";
import { DEFAULT_CELL_COUNT, cellNumbersForCount } from "./cells";
import type { IGoodsOwner, GoodsOwnerType } from "@/models/StorageRecord";

export interface CellOccupant {
  clientId: string;
  ownerLabel: string;
  ownerType: GoodsOwnerType;
  /** Краткая сводка того, что арендатор хранит в этой камере, напр. "Яблоки, Картофель". */
  productSummary: string;
}

export interface CellStatus {
  number: number;
  occupants: CellOccupant[];
  /** Ручной флажок сотрудника/владельца (см. models/Container.ts::fullCells) — НЕ
   * производное от occupants.length. */
  isFull: boolean;
}

export interface ContainerCellsGrid {
  containerId: string;
  containerName: string;
  cells: CellStatus[];
}

/**
 * Сетка камер хранения (по умолчанию 2×4 на контейнер, см. lib/cells.ts — количество камер
 * теперь редактируется индивидуально на контейнер, см. models/Container.ts::cellCount) для
 * одного или нескольких контейнеров. Занятость камеры вычисляется из активных (quantity > 0) StorageRecord —
 * записи с обнулённым количеством (см. app/api/miniapp/records/[id]/adjust/route.ts)
 * считаются вывезенными и не занимают камеру. Один арендатор с несколькими записями в
 * одной камере схлопывается в одного occupant (по clientId), как и в lib/debt.ts.
 *
 * containerIds — undefined = все контейнеры (веб-дашборд, app/api/containers/cells/route.ts);
 * массив из одного id = один контейнер (mini app, ограничен доступом сотрудника через
 * lib/miniAuth.ts::allowedContainerIds ещё до вызова этой функции).
 */
export async function getCellsGrid(containerIds?: string[]): Promise<ContainerCellsGrid[]> {
  await connectDB();

  const containerFilter = containerIds ? { _id: { $in: containerIds } } : {};
  const containers = await Container.find(containerFilter).sort({ name: 1 }).lean();
  if (containers.length === 0) return [];

  const records = (await StorageRecord.find({
    containerId: { $in: containers.map((c) => c._id) },
    quantity: { $gt: 0 },
  })
    .select("containerId cellNumber productName goodsOwner clientId")
    .lean()) as unknown as {
    containerId: unknown;
    cellNumber: number;
    productName: string;
    goodsOwner: IGoodsOwner;
    clientId: unknown;
  }[];

  // containerId -> cellNumber -> clientId -> { occupant, products[] }
  type BucketOccupant = Omit<CellOccupant, "productSummary">;
  type Bucket = Map<string, Map<number, Map<string, { occupant: BucketOccupant; products: string[] }>>>;
  const byContainer: Bucket = new Map();

  for (const r of records) {
    const containerId = String(r.containerId);
    const key = String(r.clientId);
    if (!byContainer.has(containerId)) byContainer.set(containerId, new Map());
    const byCell = byContainer.get(containerId)!;
    if (!byCell.has(r.cellNumber)) byCell.set(r.cellNumber, new Map());
    const byOwner = byCell.get(r.cellNumber)!;
    if (!byOwner.has(key)) {
      byOwner.set(key, {
        occupant: { clientId: key, ownerLabel: ownerLabelOf(r.goodsOwner), ownerType: r.goodsOwner.type },
        products: [],
      });
    }
    byOwner.get(key)!.products.push(r.productName);
  }

  return containers.map((c) => {
    const containerId = String(c._id);
    const byCell = byContainer.get(containerId);
    const fullCells = new Set(c.fullCells || []);
    const cellNumbers = cellNumbersForCount(c.cellCount ?? DEFAULT_CELL_COUNT);
    const cells: CellStatus[] = cellNumbers.map((number) => {
      const byOwner = byCell?.get(number);
      const occupants: CellOccupant[] = byOwner
        ? Array.from(byOwner.values()).map(({ occupant, products }) => ({
            ...occupant,
            productSummary: Array.from(new Set(products)).join(", "),
          }))
        : [];
      return { number, occupants, isFull: fullCells.has(number) };
    });
    return { containerId, containerName: c.name, cells };
  });
}

/** Ставит/снимает ручной флажок "камера заполнена" (см. CellStatus.isFull выше). */
export async function toggleCellFull(containerId: string, cellNumber: number, full: boolean): Promise<void> {
  await connectDB();
  await Container.findByIdAndUpdate(containerId, {
    [full ? "$addToSet" : "$pull"]: { fullCells: cellNumber },
  });
}
