/** Homeworks projections can retain their source markers even when an ID is missing. */
export type HomeworksOwnershipRecord = {
  homeworks_id?: string | null;
  data_source?: string | null;
  homeworks_status?: string | null;
  homeworks_deleted?: boolean;
};

export function isHomeworksOwned(record?: HomeworksOwnershipRecord | null): boolean {
  return !!record && (
    record.homeworks_id != null ||
    record.data_source === "homeworks_sync" ||
    record.homeworks_status != null ||
    record.homeworks_deleted === true
  );
}

/** Ownership travels with options; route preferences can still offer every property. */
export type OwnershipOption = HomeworksOwnershipRecord & {
  id: string;
  label: string;
  client?: HomeworksOwnershipRecord | null;
};

export function isHomeworksOptionOwned(option: OwnershipOption): boolean {
  return isHomeworksOwned(option) || isHomeworksOwned(option.client);
}
