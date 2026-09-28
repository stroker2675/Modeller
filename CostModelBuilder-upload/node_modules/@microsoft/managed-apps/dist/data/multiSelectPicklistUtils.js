/*!
 * Copyright (C) Microsoft Corporation. All rights reserved.
 */
/**
 * Serializes MultiSelectPicklist fields in a Dataverse record before sending to the API.
 *
 * The Dataverse Web API expects MultiSelectPicklist values as comma-separated strings
 * (e.g. `"100,200,300"`), but the generated TypeScript types represent them as number arrays
 * (e.g. `[100, 200, 300]`). This function converts any listed field whose current value is an
 * array into that wire format. An empty array is serialized as `null` because Dataverse rejects
 * an empty string for this column type — `null` is the correct way to clear the field.
 *
 * A shallow copy of the record is returned so the caller's object is not mutated.
 *
 * @param record - The record being sent to `createRecordAsync` or `updateRecordAsync`.
 * @param fields - Names of all MultiSelectPicklist columns declared on this entity.
 * @returns A new record object with array-valued picklist fields replaced by comma-separated strings,
 *   or `null` for empty arrays.
 */
export function serializeMultiSelectPicklistFields(record, fields) {
    const result = { ...record };
    for (const field of fields) {
        if (Array.isArray(result[field])) {
            const arr = result[field];
            // Dataverse requires null (not an empty string) to clear a MultiSelectPicklist field.
            result[field] = arr.length > 0 ? arr.join(',') : null;
        }
    }
    return result;
}
/**
 * Deserializes MultiSelectPicklist fields in a Dataverse record returned from the API.
 *
 * The Dataverse Web API returns MultiSelectPicklist values as comma-separated strings
 * (e.g. `"100,200,300"`), but the generated TypeScript types represent them as number arrays.
 * This function mutates the record in place, converting each listed field from its wire format
 * back to an array. An empty string (`""`) is treated as an empty array.
 *
 * @param record - The record returned by `retrieveRecordAsync` or `retrieveMultipleRecordsAsync`.
 *                 Mutated in place.
 * @param fields - Names of all MultiSelectPicklist columns declared on this entity.
 */
export function deserializeMultiSelectPicklistFields(record, fields) {
    for (const field of fields) {
        const value = record[field];
        if (typeof value === 'string') {
            record[field] = value !== '' ? value.split(',').map(Number) : [];
        }
    }
}
//# sourceMappingURL=multiSelectPicklistUtils.js.map